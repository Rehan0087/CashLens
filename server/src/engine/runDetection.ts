import { db, getSimNow, inTransaction } from "../db/index.js";
import { randomUUID } from "node:crypto";
import { computeAllAlertDrafts } from "./detectors.js";

/**
 * Persists a fresh detection pass. Wipes previous alerts and case notes —
 * called by the seed script and by the server on first boot of an unseeded
 * alerts table, never automatically afterwards (so case work survives restarts).
 */
export function runDetection(): number {
  const simNow = getSimNow().toISOString();
  const drafts = computeAllAlertDrafts();

  inTransaction(() => {
    db.exec("DELETE FROM case_notes; DELETE FROM alerts;");
    const insert = db.prepare(
      `INSERT INTO alerts (id, agent_id, provider_id, type, severity, evidence_json, confidence, status, assigned_role, created_at, source_transaction_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'new', 'provider_ops', ?, ?)`
    );
    drafts.forEach((d, i) => {
      const alertId = `al-${i + 1}`;
      insert.run(
        alertId,
        d.agentId,
        d.providerId,
        d.type,
        d.severity,
        JSON.stringify(d.evidence),
        Number(d.confidence.toFixed(2)),
        simNow,
        d.sourceTransactionId
      );
      db.prepare(
        `INSERT INTO alert_workflow_events
         (id, alert_id, actor_user_id, actor_role, action, from_status, to_status, from_assigned_role, to_assigned_role, note, created_at)
         VALUES (?, ?, NULL, 'system', 'create', 'new', 'new', 'system', 'provider_ops', ?, ?)`
      ).run(randomUUID(), alertId, "Advisory detection created this alert; human review is required.", simNow);
    });
  });

  return drafts.length;
}
