import { db, getSimNow } from "../db/index.js";
import { computeAgentLiquidity } from "./liquidityScorer.js";

// FSP-management view: aggregates only. Per-agent balances and case detail are
// intentionally absent — management sees service risk, not provider account data.

export interface AreaSummary {
  area: string;
  agentCount: number;
  highPressureAgents: number;
  mediumPressureAgents: number;
  openAlerts: number;
  highSeverityAlerts: number;
  pressureIndex: number; // mean cash pressure score across the area's agents
}

export interface ProviderSummary {
  providerId: string;
  providerName: string;
  openAlerts: number;
  highPressureAgents: number;
  staleFeeds: number;
}

export interface Overview {
  simNow: string;
  totals: {
    agents: number;
    openAlerts: number;
    newAlerts: number;
    escalated: number;
    resolved: number;
    highSeverityOpen: number;
  };
  areas: AreaSummary[];
  providers: ProviderSummary[];
}

export function assembleOverview(): Overview {
  const simNow = getSimNow();
  const liquidity = computeAgentLiquidity();

  const alertRows = db
    .prepare(`SELECT agent_id, provider_id, severity, status FROM alerts`)
    .all() as unknown as Array<{ agent_id: string; provider_id: string | null; severity: string; status: string }>;

  const areaMap = new Map<string, AreaSummary & { scoreSum: number }>();
  const agentArea = new Map<string, string>();

  for (const a of liquidity) {
    agentArea.set(a.agentId, a.area);
    let area = areaMap.get(a.area);
    if (!area) {
      area = {
        area: a.area,
        agentCount: 0,
        highPressureAgents: 0,
        mediumPressureAgents: 0,
        openAlerts: 0,
        highSeverityAlerts: 0,
        pressureIndex: 0,
        scoreSum: 0,
      };
      areaMap.set(a.area, area);
    }
    area.agentCount += 1;
    area.scoreSum += a.cashScore;
    if (a.overallLevel === "high") area.highPressureAgents += 1;
    if (a.overallLevel === "medium") area.mediumPressureAgents += 1;
  }

  const providerMap = new Map<string, ProviderSummary>();
  const providers = db.prepare("SELECT id, name FROM providers ORDER BY id").all() as unknown as Array<{ id: string; name: string }>;
  for (const p of providers) {
    providerMap.set(p.id, { providerId: p.id, providerName: p.name, openAlerts: 0, highPressureAgents: 0, staleFeeds: 0 });
  }
  for (const a of liquidity) {
    for (const p of a.providers) {
      const summary = providerMap.get(p.providerId);
      if (!summary) continue;
      if (p.level === "high") summary.highPressureAgents += 1;
      if (p.stale) summary.staleFeeds += 1;
    }
  }

  let openAlerts = 0;
  let newAlerts = 0;
  let escalated = 0;
  let resolved = 0;
  let highSeverityOpen = 0;
  for (const al of alertRows) {
    const open = al.status !== "resolved";
    if (open) {
      openAlerts += 1;
      if (al.severity === "high") highSeverityOpen += 1;
      const area = areaMap.get(agentArea.get(al.agent_id) ?? "");
      if (area) {
        area.openAlerts += 1;
        if (al.severity === "high") area.highSeverityAlerts += 1;
      }
      if (al.provider_id) {
        const p = providerMap.get(al.provider_id);
        if (p) p.openAlerts += 1;
      }
    }
    if (al.status === "new") newAlerts += 1;
    if (al.status === "escalated") escalated += 1;
    if (al.status === "resolved") resolved += 1;
  }

  const areas = [...areaMap.values()]
    .map(({ scoreSum, ...rest }) => ({ ...rest, pressureIndex: Number((scoreSum / rest.agentCount).toFixed(2)) }))
    .sort((a, b) => b.pressureIndex - a.pressureIndex);

  return {
    simNow: simNow.toISOString(),
    totals: { agents: liquidity.length, openAlerts, newAlerts, escalated, resolved, highSeverityOpen },
    areas,
    providers: [...providerMap.values()],
  };
}
