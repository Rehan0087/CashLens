import { db, getSimNow, inTransaction } from "../db/index.js";
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
      insert.run(
        `al-${i + 1}`,
        d.agentId,
        d.providerId,
        d.type,
        d.severity,
        JSON.stringify(d.evidence),
        Number(d.confidence.toFixed(2)),
        simNow,
        d.sourceTransactionId
      );
    });
  });

  return drafts.length;
}
