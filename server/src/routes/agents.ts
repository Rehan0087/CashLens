import { Router } from "express";
import { db, getSimNow } from "../db/index.js";
import { computeAgentLiquidity, maskLiquidityForRole } from "../engine/liquidityScorer.js";
import { roleOf, providerIdOf } from "./helpers.js";

export const agentsRouter = Router();

// List all agents with their liquidity snapshot, masked for the requesting role.
agentsRouter.get("/", (req, res) => {
  const role = roleOf(req);
  const providerId = providerIdOf(req);
  const requestedAgentId = typeof req.query.agentId === "string" ? req.query.agentId : undefined;
  if (role === "fsp_management") {
    return res.status(403).json({ error: "FSP management sees aggregates only — use /api/overview" });
  }
  if (role === "agent" && !requestedAgentId) {
    return res.status(400).json({ error: "agentId is required for the agent view" });
  }
  const openAlertRows = db
    .prepare(`SELECT agent_id, COUNT(*) AS n FROM alerts WHERE status != 'resolved' GROUP BY agent_id`)
    .all() as unknown as Array<{ agent_id: string; n: number }>;
  const openAlerts = new Map(openAlertRows.map((r) => [r.agent_id, r.n]));

  const liquidity = role === "agent" ? computeAgentLiquidity(requestedAgentId) : computeAgentLiquidity();
  const list = liquidity.map((liq) => {
    const masked = maskLiquidityForRole(liq, role, providerId);
    return { ...masked, openAlerts: openAlerts.get(liq.agentId) ?? 0 };
  });
  res.json(list);
});

// Agent detail: liquidity + hourly flow timeline + open alerts for that agent.
agentsRouter.get("/:id", (req, res) => {
  const role = roleOf(req);
  const providerId = providerIdOf(req);
  const requestedAgentId = typeof req.query.agentId === "string" ? req.query.agentId : undefined;
  if (role === "fsp_management") {
    return res.status(403).json({ error: "FSP management sees aggregates only — use /api/overview" });
  }
  if (role === "agent" && requestedAgentId !== req.params.id) {
    return res.status(403).json({ error: "Agents can view only their own operation." });
  }
  const [liq] = computeAgentLiquidity(req.params.id);
  if (!liq) return res.status(404).json({ error: "Agent not found" });

  const simNow = getSimNow();
  const dayStartIso = new Date(new Date(simNow).setHours(0, 0, 0, 0)).toISOString();
  const txRows = db
    .prepare(`SELECT type, amount, timestamp FROM transactions WHERE agent_id = ? AND timestamp >= ? ORDER BY timestamp`)
    .all(req.params.id, dayStartIso) as unknown as Array<{ type: "cash_in" | "cash_out"; amount: number; timestamp: string }>;

  const hourly = new Map<number, { hour: number; cashIn: number; cashOut: number }>();
  for (const tx of txRows) {
    const hour = new Date(tx.timestamp).getHours();
    let h = hourly.get(hour);
    if (!h) {
      h = { hour, cashIn: 0, cashOut: 0 };
      hourly.set(hour, h);
    }
    if (tx.type === "cash_in") h.cashIn += tx.amount;
    else h.cashOut += tx.amount;
  }

  const alerts = db
    .prepare(
      `SELECT a.id, a.type, a.severity, a.confidence, a.status, a.created_at, a.evidence_json, a.provider_id, p.name AS provider_name
       FROM alerts a LEFT JOIN providers p ON p.id = a.provider_id
       WHERE a.agent_id = ? AND a.status != 'resolved' ORDER BY a.severity = 'high' DESC, a.created_at`
    )
    .all(req.params.id) as unknown as Array<Record<string, unknown>>;

  res.json({
    ...maskLiquidityForRole(liq, role, providerId),
    timeline: [...hourly.values()].sort((a, b) => a.hour - b.hour),
    alerts: alerts.map((a) => ({
      id: a.id,
      type: a.type,
      severity: a.severity,
      confidence: a.confidence,
      status: a.status,
      createdAt: a.created_at,
      providerId: a.provider_id,
      providerName: a.provider_name,
      evidence: JSON.parse(String(a.evidence_json)),
    })),
  });
});
