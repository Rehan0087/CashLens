import { db, migrate } from "../src/db/index.js";
import { allowedActions, nextAssignedRole, nextStatus } from "../src/engine/workflow.js";
import type { AlertStatus, AlertType } from "../src/types.js";

function verify() {
  migrate();
  const alert = db
    .prepare(`SELECT id, type, status, assigned_role FROM alerts ORDER BY id LIMIT 1`)
    .get() as { id: string; type: AlertType; status: AlertStatus; assigned_role: string } | undefined;

  if (!alert) {
    console.log(JSON.stringify({ verification: "alert-lifecycle", passed: false, reason: "no seeded alert exists" }, null, 2));
    process.exitCode = 1;
    return;
  }

  const creationEvent = db
    .prepare(`SELECT action, from_status, to_status, from_assigned_role, to_assigned_role FROM alert_workflow_events WHERE alert_id = ? AND action = 'create'`)
    .get(alert.id) as
    | { action: string; from_status: AlertStatus; to_status: AlertStatus; from_assigned_role: string; to_assigned_role: string }
    | undefined;
  const eventCount = Number((db.prepare(`SELECT COUNT(*) AS n FROM alert_workflow_events WHERE alert_id = ?`).get(alert.id) as { n: number }).n);

  const legalOpsActions = allowedActions("new", "provider_ops", alert.type);
  const legalRiskActions = allowedActions("escalated", "risk_analyst", alert.type);
  const checks = {
    seededAlertStartsNew: alert.status === "new",
    seededAlertStartsWithProviderOpsOwner: alert.assigned_role === "provider_ops",
    creationEventExists: Boolean(creationEvent),
    creationEventRoutesToProviderOps: creationEvent?.from_status === "new" && creationEvent.to_status === "new" && creationEvent.to_assigned_role === "provider_ops",
    providerOpsCanAcknowledgeOrEscalate: legalOpsActions.includes("acknowledge") && legalOpsActions.includes("escalate"),
    escalationMovesToRisk: nextStatus("escalate") === "escalated" && nextAssignedRole("escalate", "provider_ops") === "risk_analyst",
    riskCanResolveEscalatedCase: legalRiskActions.includes("resolve"),
    resolutionIsVisibleStatus: nextStatus("resolve") === "resolved",
    auditEventExists: eventCount >= 1,
  };

  const passed = Object.values(checks).every(Boolean);
  console.log(JSON.stringify({
    verification: "alert-lifecycle",
    passed,
    alert: { id: alert.id, type: alert.type, status: alert.status, assignedRole: alert.assigned_role },
    auditEventCount: eventCount,
    legalOpsActions,
    legalRiskActions,
    checks,
  }, null, 2));
  if (!passed) process.exitCode = 1;
}

verify();
