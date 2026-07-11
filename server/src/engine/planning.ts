import { getSimNow } from "../db/index.js";
import { computeAgentLiquidity, estimateShortageMinutes } from "./liquidityScorer.js";
import type { AgentLiquidity, PressureLevel, ProviderDataState, Role } from "../types.js";

export interface PlanningProvider {
  providerId: string;
  providerName: string;
  agentCount: number;
  pressuredAgents: number;
  totalBalance: number | null;
  projectedInflowNeed: number;
  shortageMinutes: number | null;
  level: PressureLevel;
  dataState: ProviderDataState | "degraded";
  exactValuesMasked: boolean;
}

export interface PlanningSharedCash {
  agentCount: number;
  totalPhysicalCash: number | null;
  projectedOutflow: number;
  shortageMinutes: number | null;
  level: PressureLevel;
  exactValuesMasked: boolean;
}

export interface PlanningContext {
  simNow: string;
  horizonHours: number;
  sharedCash: PlanningSharedCash;
  providers: PlanningProvider[];
  constraints: Array<{
    providerId: string;
    providerShortageMinutes: number | null;
    sharedCashShortageMinutes: number | null;
    bindingConstraint: "provider_e_money" | "shared_physical_cash" | "no_projected_shortage" | "insufficient_data";
  }>;
  advisoryOnly: true;
  prohibitedActions: string[];
}

const LEVEL_RANK: Record<PressureLevel, number> = { low: 0, medium: 1, high: 2 };

function maxLevel(levels: PressureLevel[]): PressureLevel {
  return levels.reduce((current, candidate) => (LEVEL_RANK[candidate] > LEVEL_RANK[current] ? candidate : current), "low");
}

function aggregateState(states: Array<ProviderDataState>): ProviderDataState | "degraded" {
  if (states.length === 0 || states.every((state) => state === "missing")) return "missing";
  if (states.every((state) => state === "fresh")) return "fresh";
  if (states.some((state) => state === "inconsistent")) return "inconsistent";
  if (states.some((state) => state === "missing")) return "missing";
  return "degraded";
}

function providerPlanning(liquidity: AgentLiquidity[]): PlanningProvider[] {
  const providers = new Map<string, { providerName: string; rows: AgentLiquidity["providers"] }>();
  for (const agent of liquidity) {
    for (const provider of agent.providers) {
      const entry = providers.get(provider.providerId) ?? { providerName: provider.providerName, rows: [] };
      entry.rows.push(provider);
      providers.set(provider.providerId, entry);
    }
  }

  return [...providers.entries()].map(([providerId, entry]) => {
    const knownBalances = entry.rows.filter((row) => row.balance !== null);
    const totalBalance = knownBalances.length === entry.rows.length ? knownBalances.reduce((sum, row) => sum + (row.balance ?? 0), 0) : null;
    const projectedInflowNeed = entry.rows.reduce((sum, row) => sum + row.projectedInflowNeed, 0);
    const states = entry.rows.map((row) => row.dataState);
    const state = aggregateState(states);
    const shortageMinutes = totalBalance === null || state === "missing" || state === "inconsistent"
      ? null
      : estimateShortageMinutes(totalBalance, projectedInflowNeed);

    return {
      providerId,
      providerName: entry.providerName,
      agentCount: entry.rows.length,
      pressuredAgents: entry.rows.filter((row) => row.level !== "low").length,
      totalBalance: totalBalance === null ? null : Math.round(totalBalance),
      projectedInflowNeed: Math.round(projectedInflowNeed),
      shortageMinutes,
      level: maxLevel(entry.rows.map((row) => row.level)),
      dataState: state,
      exactValuesMasked: false,
    };
  }).sort((a, b) => b.level.localeCompare(a.level) || a.providerId.localeCompare(b.providerId));
}

function buildFullPlanning(liquidity: AgentLiquidity[]): PlanningContext {
  const totalPhysicalCash = liquidity.reduce((sum, agent) => sum + (agent.physicalCash ?? 0), 0);
  const projectedOutflow = liquidity.reduce((sum, agent) => sum + agent.projectedOutflow, 0);
  const sharedCashLevel = maxLevel(liquidity.map((agent) => agent.cashLevel));
  const providerRows = providerPlanning(liquidity);
  const sharedCashShortageMinutes = estimateShortageMinutes(totalPhysicalCash, projectedOutflow);

  return {
    simNow: getSimNow().toISOString(),
    horizonHours: 4,
    sharedCash: {
      agentCount: liquidity.length,
      totalPhysicalCash: Math.round(totalPhysicalCash),
      projectedOutflow: Math.round(projectedOutflow),
      shortageMinutes: sharedCashShortageMinutes,
      level: sharedCashLevel,
      exactValuesMasked: false,
    },
    providers: providerRows,
    constraints: providerRows.map((provider) => {
      const providerMinutes = provider.shortageMinutes;
      const horizonMinutes = 4 * 60;
      const providerInHorizon = providerMinutes !== null && providerMinutes <= horizonMinutes;
      const sharedCashInHorizon = sharedCashShortageMinutes !== null && sharedCashShortageMinutes <= horizonMinutes;
      const bindingConstraint = provider.dataState === "missing" || provider.dataState === "inconsistent" || providerMinutes === null
        ? "insufficient_data"
        : !providerInHorizon && !sharedCashInHorizon
          ? "no_projected_shortage"
          : providerInHorizon && (!sharedCashInHorizon || providerMinutes <= (sharedCashShortageMinutes ?? Number.POSITIVE_INFINITY))
            ? "provider_e_money"
            : "shared_physical_cash";
      return {
        providerId: provider.providerId,
        providerShortageMinutes: providerMinutes,
        sharedCashShortageMinutes,
        bindingConstraint,
      };
    }),
    advisoryOnly: true,
    prohibitedActions: ["automatic_transfer", "wallet_rebalancing", "fund_freezing", "account_blocking"],
  };
}

/**
 * Provider-aware planning is a read-only context view. The underlying scorer
 * keeps each provider float separate; this function only compares independent
 * shortage estimates against the shared physical-cash estimate.
 */
export function computePlanningContext(): PlanningContext {
  return buildFullPlanning(computeAgentLiquidity());
}

export function maskPlanningForRole(context: PlanningContext, role: Role, providerId?: string): PlanningContext {
  if (role === "risk_analyst") return context;

  const ownProvider = role === "provider_ops" || role === "financial_service_provider" ? providerId : undefined;
  const providers = context.providers.map((provider) => {
    const visible = role === "fsp_management" ? false : provider.providerId === ownProvider;
    return visible
      ? provider
      : {
          ...provider,
          totalBalance: null,
          projectedInflowNeed: 0,
          shortageMinutes: null,
          exactValuesMasked: true,
        };
  });

  return {
    ...context,
    sharedCash: {
      ...context.sharedCash,
      totalPhysicalCash: null,
      projectedOutflow: 0,
      shortageMinutes: null,
      exactValuesMasked: true,
    },
    providers,
    constraints: context.constraints.map((constraint) => ({
      ...constraint,
      providerShortageMinutes: providers.find((provider) => provider.providerId === constraint.providerId)?.shortageMinutes ?? null,
      sharedCashShortageMinutes: null,
      bindingConstraint: providers.find((provider) => provider.providerId === constraint.providerId)?.dataState === "fresh"
        ? "insufficient_data"
        : constraint.bindingConstraint,
    })),
  };
}
