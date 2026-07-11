import { db, getSimNow } from "../db/index.js";
import type { AgentLiquidity, ForecastConfidencePenalty, PressureLevel, ProviderDataState, ProviderPressure, Role } from "../types.js";

export const WINDOW_HOURS = 4; // projection horizon
export const PEAK_FACTOR = 1.25; // retained for compatibility with existing exports
export const STALE_MINUTES = 60; // balance feed older than this = unconfirmed

const EWRH_ALPHA = 0.35;
const EWRH_WINDOW_MINUTES = 30;
const EWRH_LOOKBACK_WINDOWS = 8;
const OPERATIONAL_BUFFER_RATIO = 0.1;

/** Converts a four-hour projection into the EWRH time-to-depletion estimate. */
export function estimateShortageMinutes(capacity: number, projectedDemand: number): number | null {
  if (projectedDemand <= 0) return null;

  const availableBalance = capacity - operationalSafetyBuffer(capacity);
  if (availableBalance <= 0) return 0;

  const hourlyBurnRate = projectedDemand / WINDOW_HOURS;
  return Math.max(1, Math.round((availableBalance / hourlyBurnRate) * 60));
}

export interface ProviderInputAssessment {
  dataState: ProviderDataState;
  balance: number | null;
  staleMinutes: number | null;
}

/**
 * Classify a provider snapshot before it can influence a capacity calculation.
 * Missing or inconsistent snapshots are intentionally unavailable rather than
 * zero-filled; this pure function is also exercised by the reliability metric.
 */
export function assessProviderInput(balance: number | null, lastSyncedAt: string | null, simNow: Date): ProviderInputAssessment {
  if (balance === null || lastSyncedAt === null) {
    return { dataState: "missing", balance: null, staleMinutes: null };
  }
  const syncedAt = new Date(lastSyncedAt);
  if (!Number.isFinite(balance) || balance < 0 || Number.isNaN(syncedAt.getTime()) || syncedAt.getTime() > simNow.getTime() + 5 * 60_000) {
    return { dataState: "inconsistent", balance: null, staleMinutes: null };
  }
  const staleMinutes = Math.round((simNow.getTime() - syncedAt.getTime()) / 60_000);
  return {
    dataState: staleMinutes > STALE_MINUTES ? "stale" : "fresh",
    balance,
    staleMinutes,
  };
}

export function levelFor(score: number): PressureLevel {
  if (score >= 1) return "high";
  if (score >= 0.5) return "medium";
  return "low";
}

const LEVEL_RANK: Record<PressureLevel, number> = { low: 0, medium: 1, high: 2 };

function maxLevel(levels: PressureLevel[]): PressureLevel {
  return levels.reduce((acc, l) => (LEVEL_RANK[l] > LEVEL_RANK[acc] ? l : acc), "low");
}

interface AgentRow {
  id: string;
  name: string;
  area: string;
  physical_cash: number;
}

interface BalanceRow {
  agent_id: string;
  provider_id: string;
  provider_name: string;
  e_money_balance: number | null;
  last_synced_at: string | null;
}

interface FlowRow {
  agent_id: string;
  provider_id: string;
  type: "cash_in" | "cash_out";
  total: number;
}

interface TransactionFlowRow {
  agent_id: string;
  provider_id: string;
  type: "cash_in" | "cash_out";
  amount: number;
  timestamp: string;
}

interface WindowFlow {
  netOutflow: number;
  transactionCount: number;
  amounts: number[];
}

function operationalSafetyBuffer(balance: number): number {
  // The existing API has no safetyBuffer input. A balance-scaled reserve keeps
  // the early-warning behavior stable across physical cash and e-money floats.
  return Math.max(1, Math.round(balance * OPERATIONAL_BUFFER_RATIO));
}

function getWindowFlow(
  rows: TransactionFlowRow[],
  agentId: string,
  providerId: string | null,
  startMs: number,
  endMs: number,
  providerFloat: boolean
): WindowFlow {
  let cashIn = 0;
  let cashOut = 0;
  const amounts: number[] = [];

  for (const row of rows) {
    if (row.agent_id !== agentId || (providerId !== null && row.provider_id !== providerId)) continue;
    const timestampMs = new Date(row.timestamp).getTime();
    if (timestampMs < startMs || timestampMs >= endMs) continue;

    if (row.type === "cash_in") cashIn += row.amount;
    else cashOut += row.amount;
    amounts.push(row.amount);
  }

  return {
    // Physical cash leaves on cash-out; provider e-money leaves on cash-in.
    netOutflow: providerFloat ? cashIn - cashOut : cashOut - cashIn,
    transactionCount: amounts.length,
    amounts,
  };
}

interface EwrhForecast {
  burnRatePerHour: number;
  transactionCount: number;
  activeWindows: number;
  amounts: number[];
}

/** Pure EWRH projection used by the live scorer and the held-out validator. */
export function forecastEwrhDemand(windowOutflows: number[], horizonHours: number, demandMultiplier = 1): number {
  if (windowOutflows.length === 0 || horizonHours <= 0) return 0;
  let ema = windowOutflows[0];
  for (let index = 1; index < windowOutflows.length; index += 1) {
    ema = EWRH_ALPHA * windowOutflows[index] + (1 - EWRH_ALPHA) * ema;
  }
  const windowHours = EWRH_WINDOW_MINUTES / 60;
  return Math.max(0, (ema / windowHours) * horizonHours * demandMultiplier);
}

/**
 * Exponentially weighted rolling-horizon demand forecast.  Each completed
 * half-hour interval updates the prior estimate; the latest observations carry
 * `EWRH_ALPHA` of the weight.  The returned rate is then projected over the
 * four-hour operational horizon by the caller.
 */
function ewrhForecast(windows: WindowFlow[], demandMultiplier: number): EwrhForecast {
  let transactionCount = 0;
  let activeWindows = 0;
  const amounts: number[] = [];

  for (const window of windows) {
    transactionCount += window.transactionCount;
    if (window.transactionCount > 0) activeWindows += 1;
    amounts.push(...window.amounts);
  }

  return {
    burnRatePerHour: forecastEwrhDemand(windows.map((window) => window.netOutflow), 1, demandMultiplier),
    transactionCount,
    activeWindows,
    amounts,
  };
}

function transactionVarianceIsHigh(amounts: number[]): boolean {
  if (amounts.length < 2) return false;
  const mean = amounts.reduce((sum, amount) => sum + amount, 0) / amounts.length;
  if (mean <= 0) return false;
  const variance = amounts.reduce((sum, amount) => sum + (amount - mean) ** 2, 0) / amounts.length;
  return Math.sqrt(variance) > mean * 1.5;
}

/** A deterministic, inspectable confidence penalty engine for EWRH forecasts. */
function forecastConfidence(forecast: EwrhForecast, dataDegraded: boolean) {
  let score = 0.95;
  const penalties: ForecastConfidencePenalty[] = [];
  const apply = (penalty: ForecastConfidencePenalty, amount: number) => {
    penalties.push(penalty);
    score -= amount;
  };

  if (dataDegraded) apply("degraded_feed", 0.35);
  if (forecast.transactionCount < 5) apply("sparse_history", 0.2);
  if (forecast.activeWindows < 3) apply("thin_horizon", 0.1);
  if (transactionVarianceIsHigh(forecast.amounts)) apply("volatile_amounts", 0.15);

  return { confidence: Number(Math.max(0.1, Math.min(0.95, score)).toFixed(2)), penalties };
}

function timeToDepletionMinutes(balance: number, burnRatePerHour: number): number | null {
  if (burnRatePerHour <= 0) return null;
  const availableBalance = balance - operationalSafetyBuffer(balance);
  if (availableBalance <= 0) return 0;
  return Math.max(1, Math.round((availableBalance / burnRatePerHour) * 60));
}

/**
 * Computes liquidity pressure for agents against the frozen sim clock.
 * `demandMultiplier` powers the what-if view (e.g. "what if demand doubles?").
 * Role-based masking is applied by the caller via maskLiquidityForRole.
 */
export function computeAgentLiquidity(agentId?: string, demandMultiplier = 1): AgentLiquidity[] {
  const simNow = getSimNow();
  const dayStartIso = new Date(new Date(simNow).setHours(0, 0, 0, 0)).toISOString();
  const simNowMs = simNow.getTime();
  const rollingWindowMs = EWRH_WINDOW_MINUTES * 60_000;
  const forecastWindowStartMs = simNowMs - EWRH_LOOKBACK_WINDOWS * rollingWindowMs;

  const agentFilter = agentId ? "WHERE a.id = ?" : "";
  const agents = db
    .prepare(`SELECT a.id, a.name, a.area, a.physical_cash FROM agents a ${agentFilter} ORDER BY a.id`)
    .all(...(agentId ? [agentId] : [])) as unknown as AgentRow[];

  const balances = db
    .prepare(
      `SELECT a.id AS agent_id, p.id AS provider_id, p.name AS provider_name, b.e_money_balance, b.last_synced_at
       FROM agents a CROSS JOIN providers p
       LEFT JOIN agent_provider_balances b ON b.agent_id = a.id AND b.provider_id = p.id
       ORDER BY p.id`
    )
    .all() as unknown as BalanceRow[];

  const flows = db
    .prepare(
      `SELECT agent_id, provider_id, type, SUM(amount) AS total
       FROM transactions WHERE timestamp >= ? GROUP BY agent_id, provider_id, type`
    )
    .all(dayStartIso) as unknown as FlowRow[];

  const flowMap = new Map<string, number>();
  for (const f of flows) flowMap.set(`${f.agent_id}|${f.provider_id}|${f.type}`, f.total);

  const rollingTransactions = db
    .prepare(
      `SELECT agent_id, provider_id, type, amount, timestamp
       FROM transactions
       WHERE timestamp >= ? AND timestamp <= ?
       ORDER BY timestamp`
    )
    .all(new Date(forecastWindowStartMs).toISOString(), simNow.toISOString()) as unknown as TransactionFlowRow[];

  const balancesByAgent = new Map<string, BalanceRow[]>();
  for (const b of balances) {
    if (!balancesByAgent.has(b.agent_id)) balancesByAgent.set(b.agent_id, []);
    balancesByAgent.get(b.agent_id)!.push(b);
  }

  const result: AgentLiquidity[] = [];
  for (const agent of agents) {
    const agentBalances = balancesByAgent.get(agent.id) ?? [];
    let todayCashOut = 0;
    let todayCashIn = 0;

    const makeRollingWindows = (providerId: string | null, providerFloat: boolean) =>
      Array.from({ length: EWRH_LOOKBACK_WINDOWS }, (_, index) => {
        const startMs = forecastWindowStartMs + index * rollingWindowMs;
        const endMs = index === EWRH_LOOKBACK_WINDOWS - 1 ? simNowMs + 1 : startMs + rollingWindowMs;
        return getWindowFlow(rollingTransactions, agent.id, providerId, startMs, endMs, providerFloat);
      });

    const cashForecast = ewrhForecast(makeRollingWindows(null, false), demandMultiplier);
    const cashConfidence = forecastConfidence(cashForecast, false);
    const cashBurnRate = cashForecast.burnRatePerHour;

    const providers: ProviderPressure[] = agentBalances.map((b) => {
      const cashIn = flowMap.get(`${agent.id}|${b.provider_id}|cash_in`) ?? 0;
      const cashOut = flowMap.get(`${agent.id}|${b.provider_id}|cash_out`) ?? 0;
      todayCashIn += cashIn;
      todayCashOut += cashOut;

      const assessment = assessProviderInput(b.e_money_balance, b.last_synced_at, simNow);
      const dataState = assessment.dataState;
      const availableBalance = assessment.balance;
      const providerForecast = ewrhForecast(makeRollingWindows(b.provider_id, true), demandMultiplier);
      const providerBurnRate = providerForecast.burnRatePerHour;
      const projectedInflowNeed = Math.max(0, providerBurnRate * WINDOW_HOURS);
      const score = availableBalance === null ? 0 : projectedInflowNeed / Math.max(availableBalance, 1);
      const isDataDelayed = dataState !== "fresh";
      const confidence = forecastConfidence(providerForecast, isDataDelayed);

      return {
        providerId: b.provider_id,
        providerName: b.provider_name,
        balance: availableBalance,
        masked: false,
        projectedInflowNeed: Math.round(projectedInflowNeed),
        estimatedShortageMinutes:
          availableBalance === null || isDataDelayed ? null : timeToDepletionMinutes(availableBalance, providerBurnRate),
        score: Number(score.toFixed(2)),
        level: levelFor(score),
        staleMinutes: assessment.staleMinutes,
        stale: dataState !== "fresh",
        dataState,
        predictionConfidence: confidence.confidence,
        confidencePenalties: confidence.penalties,
      };
    });

    // A customer cash-out is paid from the agent's single physical cash drawer.
    const projectedOutflow = Math.max(0, cashBurnRate * WINDOW_HOURS);
    const cashScore = projectedOutflow / Math.max(agent.physical_cash, 1);
    const cashLevel = levelFor(cashScore);

    result.push({
      agentId: agent.id,
      agentName: agent.name,
      area: agent.area,
      physicalCash: agent.physical_cash,
      cashMasked: false,
      todayCashOut: Math.round(todayCashOut),
      todayCashIn: Math.round(todayCashIn),
      projectedOutflow: Math.round(projectedOutflow),
      cashShortageMinutes: timeToDepletionMinutes(agent.physical_cash, cashBurnRate),
      cashScore: Number(cashScore.toFixed(2)),
      cashLevel,
      cashPredictionConfidence: cashConfidence.confidence,
      cashConfidencePenalties: cashConfidence.penalties,
      providers,
      overallLevel: maxLevel([cashLevel, ...providers.map((p) => p.level)]),
    });
  }
  return result;
}

/**
 * Provider boundary rule: a provider ops team sees its own float exactly, but
 * other providers' balances only as a pressure direction (level), never a number.
 * Physical cash is the agent's own money — ops sees pressure level, not the amount.
 */
export function maskLiquidityForRole(liq: AgentLiquidity, role: Role, providerId?: string): AgentLiquidity {
  if (role === "agent" || role === "risk_analyst") return liq;
  const directionOnlyScore = (level: PressureLevel) => (level === "high" ? 1 : level === "medium" ? 0.5 : 0);
  return {
    ...liq,
    physicalCash: null,
    cashMasked: true,
    todayCashOut: 0,
    todayCashIn: 0,
    projectedOutflow: 0,
    cashShortageMinutes: null,
    cashScore: directionOnlyScore(liq.cashLevel),
    providers: liq.providers.map((p) =>
      p.providerId === providerId
        ? p
        : { ...p, balance: null, masked: true, projectedInflowNeed: 0, estimatedShortageMinutes: null, score: directionOnlyScore(p.level) }
    ),
  };
}
