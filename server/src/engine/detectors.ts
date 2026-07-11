import { db, getSimNow } from "../db/index.js";
import { computeAgentLiquidity } from "./liquidityScorer.js";
import {
  physicalCashPressureEvidence,
  eMoneyPressureEvidence,
  imbalanceEvidence,
  volumeSpikeEvidence,
  oddHourEvidence,
  staleFeedEvidence,
  providerInputEvidence,
} from "../i18n/explanations.js";
import type { AlertDraft, Severity } from "../types.js";

export const Z_THRESHOLD = 3; // flag transactions ≥ 3σ from the agent's own baseline
export const HOUR_MARGIN = 2; // flag transactions ≥ 2h outside the agent's usual hours
export const IMBALANCE_RATIO = 8; // surplus/deficit float ratio that counts as imbalance
export const IMBALANCE_FLOOR = 5000; // deficit float must also be below this to matter
const STD_FLOOR = 50; // avoid divide-by-near-zero for very regular agents

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

interface TxRow {
  id: string;
  agent_id: string;
  provider_id: string;
  type: "cash_in" | "cash_out";
  amount: number;
  timestamp: string;
}

export interface AgentBaseline {
  mean: number;
  std: number;
  n: number;
  minHour: number;
  maxHour: number;
}

/**
 * Per-agent baseline from history BEFORE the demo day (13 days of transactions).
 * Hours are derived in JS local time — timestamps are stored as UTC ISO strings,
 * so SQL strftime('%H') would disagree with the local-hour checks below.
 */
export function computeBaselines(dayStartIso: string): Map<string, AgentBaseline> {
  const rows = db
    .prepare(`SELECT agent_id, amount, timestamp FROM transactions WHERE timestamp < ?`)
    .all(dayStartIso) as unknown as Array<{ agent_id: string; amount: number; timestamp: string }>;

  const grouped = new Map<string, { amounts: number[]; minHour: number; maxHour: number }>();
  for (const r of rows) {
    let g = grouped.get(r.agent_id);
    if (!g) {
      g = { amounts: [], minHour: 23, maxHour: 0 };
      grouped.set(r.agent_id, g);
    }
    g.amounts.push(r.amount);
    const hour = new Date(r.timestamp).getHours();
    if (hour < g.minHour) g.minHour = hour;
    if (hour > g.maxHour) g.maxHour = hour;
  }

  const baselines = new Map<string, AgentBaseline>();
  for (const [agentId, g] of grouped) {
    const n = g.amounts.length;
    const mean = g.amounts.reduce((a, b) => a + b, 0) / n;
    const variance = g.amounts.reduce((a, b) => a + (b - mean) * (b - mean), 0) / n;
    baselines.set(agentId, {
      mean,
      std: Math.max(Math.sqrt(variance), STD_FLOOR),
      n,
      minHour: g.minHour,
      maxHour: g.maxHour,
    });
  }
  return baselines;
}

/**
 * Pure computation of all alert drafts for the current dataset.
 * No writes — runDetection persists, metrics.ts times this directly.
 */
export function computeAllAlertDrafts(): AlertDraft[] {
  const simNow = getSimNow();
  const dayStartIso = new Date(new Date(simNow).setHours(0, 0, 0, 0)).toISOString();
  const drafts: AlertDraft[] = [];

  const liquidity = computeAgentLiquidity();

  // 1 & 4 — liquidity pressure and data-quality alerts from the scored snapshot.
  for (const agent of liquidity) {
    const degradedProviders = new Set(agent.providers.filter((p) => p.dataState !== "fresh").map((p) => p.providerId));

    if (agent.cashLevel === "high") {
      drafts.push({
        agentId: agent.agentId,
        providerId: null,
        type: "liquidity_pressure",
        severity: "high",
        confidence: clamp((0.55 + 0.2 * agent.cashScore) * agent.cashPredictionConfidence, 0.1, 0.95),
        evidence: physicalCashPressureEvidence({
          projectedOutflow: agent.projectedOutflow,
          physicalCash: agent.physicalCash ?? 0,
          todayCashOut: agent.todayCashOut,
          estimatedShortageMinutes: agent.cashShortageMinutes,
          score: agent.cashScore,
          unconfirmed: false,
        }),
        sourceTransactionId: null,
      });
    }

    for (const p of agent.providers) {
      if (p.level === "high") {
        const unconfirmed = p.stale;
        drafts.push({
          agentId: agent.agentId,
          providerId: p.providerId,
          type: "liquidity_pressure",
          severity: unconfirmed ? "medium" : "high",
          confidence: clamp((0.55 + 0.2 * p.score) * p.predictionConfidence, 0.1, 0.95),
          evidence: eMoneyPressureEvidence({
            providerName: p.providerName,
            projectedInflowNeed: p.projectedInflowNeed,
            balance: p.balance ?? 0,
            estimatedShortageMinutes: p.estimatedShortageMinutes,
            score: p.score,
            unconfirmed,
          }),
          sourceTransactionId: null,
        });
      }

      if (p.dataState === "stale") {
        drafts.push({
          agentId: agent.agentId,
          providerId: p.providerId,
          type: "data_quality",
          severity: (p.staleMinutes ?? 0) > 240 ? "high" : "medium",
          confidence: 0.95,
          evidence: staleFeedEvidence({
            providerName: p.providerName,
            staleMinutes: p.staleMinutes ?? 0,
            lastSyncedAt: new Date(simNow.getTime() - (p.staleMinutes ?? 0) * 60_000).toISOString(),
          }),
          sourceTransactionId: null,
        });
      } else if (p.dataState === "missing" || p.dataState === "inconsistent") {
        drafts.push({
          agentId: agent.agentId,
          providerId: p.providerId,
          type: "data_quality",
          severity: "high",
          confidence: 0.95,
          evidence: providerInputEvidence({ providerName: p.providerName, state: p.dataState }),
          sourceTransactionId: null,
        });
      }
    }

    // 2 — cross-provider imbalance: value idle on one float, another starved.
    const sorted = [...agent.providers].sort((a, b) => (b.balance ?? 0) - (a.balance ?? 0));
    if (sorted.length >= 2) {
      const top = sorted[0];
      const bottom = sorted[sorted.length - 1];
      const ratio = (top.balance ?? 0) / Math.max(bottom.balance ?? 0, 1);
      if (ratio >= IMBALANCE_RATIO && (bottom.balance ?? 0) < IMBALANCE_FLOOR) {
        const unconfirmed = degradedProviders.has(top.providerId) || degradedProviders.has(bottom.providerId);
        drafts.push({
          agentId: agent.agentId,
          providerId: null,
          type: "cross_provider_imbalance",
          severity: (bottom.balance ?? 0) < 1000 ? "high" : "medium",
          confidence: 0.8 * (unconfirmed ? 0.65 : 1),
          evidence: imbalanceEvidence({
            surplusProvider: top.providerName,
            surplusBalance: top.balance ?? 0,
            deficitProvider: bottom.providerName,
            deficitBalance: bottom.balance ?? 0,
            ratio,
            unconfirmed,
          }),
          sourceTransactionId: null,
        });
      }
    }
  }

  // 3 — unusual transactions: per-agent z-score + operating-hours deviation.
  const baselines = computeBaselines(dayStartIso);
  const todayTxs = db
    .prepare(`SELECT id, agent_id, provider_id, type, amount, timestamp FROM transactions WHERE timestamp >= ? ORDER BY timestamp`)
    .all(dayStartIso) as unknown as TxRow[];

  const staleByAgentProvider = new Set<string>();
  for (const agent of liquidity) {
    for (const p of agent.providers) if (p.dataState !== "fresh") staleByAgentProvider.add(`${agent.agentId}|${p.providerId}`);
  }

  for (const tx of todayTxs) {
    const base = baselines.get(tx.agent_id);
    if (!base || base.n < 10) continue; // not enough history for a fair baseline

    const unconfirmed = staleByAgentProvider.has(`${tx.agent_id}|${tx.provider_id}`);
    const z = (tx.amount - base.mean) / base.std;
    const hour = new Date(tx.timestamp).getHours();

    if (z >= Z_THRESHOLD) {
      const severity: Severity = z >= 5 ? "high" : "medium";
      drafts.push({
        agentId: tx.agent_id,
        providerId: tx.provider_id,
        type: "unusual_transaction",
        severity,
        confidence: clamp(0.55 + 0.07 * z, 0.55, 0.97) * (unconfirmed ? 0.65 : 1),
        evidence: volumeSpikeEvidence({
          txType: tx.type,
          amount: tx.amount,
          zScore: z,
          baselineMean: base.mean,
          baselineStddev: base.std,
          timestamp: tx.timestamp,
          unconfirmed,
        }),
        sourceTransactionId: tx.id,
      });
    } else if (hour < base.minHour - HOUR_MARGIN || hour > base.maxHour + HOUR_MARGIN) {
      drafts.push({
        agentId: tx.agent_id,
        providerId: tx.provider_id,
        type: "unusual_transaction",
        severity: "medium",
        confidence: 0.85 * (unconfirmed ? 0.65 : 1),
        evidence: oddHourEvidence({
          txType: tx.type,
          amount: tx.amount,
          timestamp: tx.timestamp,
          usualStartHour: base.minHour,
          usualEndHour: base.maxHour,
          unconfirmed,
        }),
        sourceTransactionId: tx.id,
      });
    }
  }

  return drafts;
}
