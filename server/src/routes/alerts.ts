import { Router } from "express";
import { randomUUID } from "node:crypto";
import { db } from "../db/index.js";
import { computeAgentLiquidity, maskLiquidityForRole } from "../engine/liquidityScorer.js";
import { allowedActions, nextAssignedRole, nextStatus, noteRequired, type CaseAction } from "../engine/workflow.js";
import type { AlertEvidence, AlertStatus, AlertType, LocalizedText, Role } from "../types.js";
import { roleOf, providerIdOf } from "./helpers.js";

export const alertsRouter = Router();

interface AlertRow {
  id: string;
  agent_id: string;
  agent_name: string;
  area: string;
  provider_id: string | null;
  provider_name: string | null;
  type: AlertType;
  severity: string;
  evidence_json: string;
  confidence: number;
  status: AlertStatus;
  assigned_role: string;
  created_at: string;
}

const BASE_SELECT = `
  SELECT a.id, a.agent_id, ag.name AS agent_name, ag.area, a.provider_id, p.name AS provider_name,
         a.type, a.severity, a.evidence_json, a.confidence, a.status, a.assigned_role, a.created_at
  FROM alerts a
  JOIN agents ag ON ag.id = a.agent_id
  LEFT JOIN providers p ON p.id = a.provider_id`;

function localized(en: string, bn: string, banglish: string): LocalizedText {
  return { en, bn, banglish };
}

/**
 * A cross-provider alert is useful to every provider's operations team, but
 * it must not disclose another provider's exact balance or the agent's cash
 * drawer. Redaction belongs on the server, never just in a React component.
 */
function evidenceForRole(row: AlertRow, role: Role): AlertEvidence {
  const evidence = JSON.parse(row.evidence_json) as AlertEvidence;
  if (role !== "provider_ops" || row.provider_id !== null) return evidence;

  const signals = { ...evidence.signals };
  if (row.type === "liquidity_pressure") {
    delete signals.projected_cash_out_next_4h;
    delete signals.physical_cash_on_hand;
    delete signals.cash_out_so_far_today;
    delete signals.estimated_shortage_minutes;
    return {
      ...evidence,
      signals,
      explanation: localized(
        "The shared cash drawer is under projected pressure. Exact cash amounts are hidden from provider operations.",
        "যৌথ নগদ ড্রয়ারে চাপের পূর্বাভাস আছে। সঠিক নগদ অঙ্ক প্রোভাইডার অপারেশনস থেকে গোপন রাখা হয়েছে।",
        "Shared cash drawer-e pressure er forecast ache. Exact cash amount provider operations theke lukiye rakha hoyeche."
      ),
      suggestedAction: localized(
        "Coordinate through approved operational channels; no wallet or cash movement is executed by this system.",
        "অনুমোদিত অপারেশনাল চ্যানেলে সমন্বয় করুন; এই সিস্টেম কোনো ওয়ালেট বা নগদ লেনদেন করে না।",
        "Approved operational channel-e coordinate korun; ei system kono wallet ba cash movement kore na."
      ),
    };
  }

  if (row.type === "cross_provider_imbalance") {
    delete signals.surplus_float;
    delete signals.deficit_float;
    delete signals.imbalance_ratio;
    return {
      ...evidence,
      signals,
      explanation: localized(
        "Provider floats are imbalanced: one provider is under pressure while another has surplus. Exact balances stay private.",
        "প্রোভাইডার ফ্লোটে ভারসাম্যহীনতা আছে: একটি প্রোভাইডারে চাপ, অন্যটিতে উদ্বৃত্ত। সঠিক ব্যালেন্স গোপন রাখা হয়েছে।",
        "Provider float-e imbalance ache: ek provider-e pressure, onnotite surplus. Exact balance private thake."
      ),
      suggestedAction: localized(
        "Coordinate the affected provider's official top-up process. Wallets remain separate.",
        "ক্ষতিগ্রস্ত প্রোভাইডারের অফিসিয়াল টপ-আপ প্রক্রিয়ায় সমন্বয় করুন। ওয়ালেট আলাদাই থাকবে।",
        "Affected provider-er official top-up process-e coordinate korun. Wallet alada-i thakbe."
      ),
    };
  }

  return evidence;
}

function serialize(row: AlertRow, role: Role) {
  return {
    id: row.id,
    agentId: row.agent_id,
    agentName: row.agent_name,
    area: row.area,
    providerId: row.provider_id,
    providerName: row.provider_name,
    type: row.type,
    severity: row.severity,
    confidence: row.confidence,
    status: row.status,
    assignedRole: row.assigned_role,
    createdAt: row.created_at,
    evidence: evidenceForRole(row, role),
  };
}

function canAccessAlert(row: Pick<AlertRow, "agent_id" | "provider_id" | "status">, role: Role, providerId?: string, agentId?: string) {
  if (role === "provider_ops") return Boolean(providerId && (row.provider_id === providerId || row.provider_id === null));
  if (role === "risk_analyst") return row.status === "escalated" || row.status === "resolved";
  if (role === "agent") return Boolean(agentId && row.agent_id === agentId);
  return false;
}

/**
 * Visibility boundary:
 * - provider_ops: alerts on their own provider + cross-provider ones (provider_id NULL).
 * - risk_analyst: only cases that ops escalated (plus their resolved history).
 * - agent: their own alerts (agentId param).
 * - fsp_management: none here — they get aggregates from /api/overview only.
 */
alertsRouter.get("/", (req, res) => {
  const role = roleOf(req);
  const providerId = providerIdOf(req);
  const status = typeof req.query.status === "string" && req.query.status !== "all" ? req.query.status : undefined;
  const agentId = typeof req.query.agentId === "string" ? req.query.agentId : undefined;

  const where: string[] = [];
  const params: string[] = [];

  if (role === "provider_ops") {
    if (!providerId) return res.status(400).json({ error: "providerId is required for provider_ops" });
    where.push("(a.provider_id = ? OR a.provider_id IS NULL)");
    params.push(providerId);
  } else if (role === "risk_analyst") {
    where.push("a.status IN ('escalated', 'resolved')");
  } else if (role === "agent") {
    if (!agentId) return res.status(400).json({ error: "agentId is required for agent role" });
    where.push("a.agent_id = ?");
    params.push(agentId);
  } else {
    // financial_service_provider and fsp_management are aggregate roles: no case list.
    return res.status(403).json({ error: "This role sees aggregates only — use /api/overview" });
  }

  if (status) {
    where.push("a.status = ?");
    params.push(status);
  }

  const rows = db
    .prepare(
      `${BASE_SELECT} WHERE ${where.join(" AND ")}
       ORDER BY CASE a.severity WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END, a.created_at, a.id`
    )
    .all(...params) as unknown as AlertRow[];

  res.json(rows.map((row) => serialize(row, role)));
});

// Full case detail: alert + agent liquidity context (masked) + note timeline + allowed actions.
alertsRouter.get("/:id", (req, res) => {
  const role = roleOf(req);
  const providerId = providerIdOf(req);
  const agentId = typeof req.query.agentId === "string" ? req.query.agentId : undefined;

  const row = db.prepare(`${BASE_SELECT} WHERE a.id = ?`).get(req.params.id) as AlertRow | undefined;
  if (!row) return res.status(404).json({ error: "Case not found" });
  if (!canAccessAlert(row, role, providerId, agentId)) {
    return res.status(403).json({ error: "You do not have access to this case." });
  }

  const notes = db
    .prepare(`SELECT id, role, note, timestamp FROM case_notes WHERE alert_id = ? ORDER BY timestamp, id`)
    .all(req.params.id) as unknown as Array<{ id: string; role: string; note: string; timestamp: string }>;

  const [liq] = computeAgentLiquidity(row.agent_id);

  res.json({
    ...serialize(row, role),
    notes,
    agentContext: liq ? maskLiquidityForRole(liq, role, providerId) : null,
    allowedActions: allowedActions(row.status, role, row.type),
    noteRequiredFor: { escalate: noteRequired("escalate"), resolve: noteRequired("resolve"), acknowledge: noteRequired("acknowledge") },
  });
});

// Case action: acknowledge / escalate / resolve, with server-enforced authority rules.
alertsRouter.post("/:id/action", (req, res) => {
  const { action, note } = req.body as { action?: CaseAction; note?: string };
  const role = roleOf(req);
  const providerId = providerIdOf(req);
  const agentId = typeof req.query.agentId === "string" ? req.query.agentId : undefined;
  if (!action) return res.status(400).json({ error: "action is required" });

  const row = db.prepare(`SELECT id, agent_id, provider_id, status, type, assigned_role FROM alerts WHERE id = ?`).get(req.params.id) as
    | { id: string; agent_id: string; provider_id: string | null; status: AlertStatus; type: AlertType; assigned_role: string }
    | undefined;
  if (!row) return res.status(404).json({ error: "Case not found" });
  if (!canAccessAlert(row, role, providerId, agentId)) {
    return res.status(403).json({ error: "You do not have access to act on this case." });
  }

  const allowed = allowedActions(row.status, role, row.type);
  if (!allowed.includes(action)) {
    return res.status(403).json({
      error: `A ${role.replace("_", " ")} cannot ${action} a ${row.status} ${row.type.replace(/_/g, " ")} case.`,
    });
  }
  const trimmedNote = (note ?? "").trim();
  if (noteRequired(action) && trimmedNote.length === 0) {
    return res.status(400).json({ error: "A note explaining the decision is required for this action." });
  }

  const newStatus = nextStatus(action);
  const newRole = nextAssignedRole(action, row.assigned_role);
  const now = new Date().toISOString();
  const auditNote = [
    `Status: ${row.status} → ${newStatus}.`,
    `Owner: ${row.assigned_role.replace("_", " ")} → ${newRole.replace("_", " ")}.`,
    trimmedNote.length > 0 ? trimmedNote : `Action recorded: ${action}.`,
  ].join(" ");

  db.prepare(`UPDATE alerts SET status = ?, assigned_role = ? WHERE id = ?`).run(newStatus, newRole, row.id);
  db.prepare(`INSERT INTO case_notes (id, alert_id, role, note, timestamp) VALUES (?, ?, ?, ?, ?)`).run(
    randomUUID(),
    row.id,
    role,
    auditNote,
    now
  );

  res.json({ ok: true, id: row.id, previousStatus: row.status, status: newStatus, previousAssignedRole: row.assigned_role, assignedRole: newRole });
});
