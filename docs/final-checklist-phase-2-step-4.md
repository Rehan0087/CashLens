# Final submission checklist — Phase 2, Step 4

## Alert lifecycle audit

Status: verified for review. This step maps routing, ownership, human action,
and visible resolution for the seeded alert `al-1`.

## 1. State machine

```text
system detection
      |
      v
new / provider_ops
      |  POST /api/alerts/al-1/action {"action":"acknowledge"}
      v
acknowledged / provider_ops
      |  POST /api/alerts/al-1/action {"action":"escalate","note":"..."}
      v
escalated / risk_analyst
      |  POST /api/alerts/al-1/action {"action":"resolve","note":"..."}
      v
resolved / risk_analyst
```

Every transition writes both:

- an updated `alerts.status` and `alerts.assigned_role` value; and
- an append-only `alert_workflow_events` row containing actor role, old/new
  status, old/new owner, note, action, and timestamp.

The existing `case_notes` timeline receives the same human-readable decision
note, so the result is visible in the case panel as well as queryable for audit.

## 2. Exact authenticated API flow

The role, provider scope, and agent scope come from the HttpOnly session cookie;
the client does not submit trusted `role` or `providerId` query parameters.

### A. Seed and create the alert

```bash
cd server
npm run seed
```

The detection pass creates `al-1` with `status = new` and
`assigned_role = provider_ops`, then records an action=`create` event.

### B. Provider operations receives the queue

```bash
curl -c ops.cookie \
  -H 'Content-Type: application/json' \
  -d '{"username":"ops.bkash","password":"cashlens-demo"}' \
  http://127.0.0.1:4000/api/auth/login

curl -b ops.cookie http://127.0.0.1:4000/api/alerts
curl -b ops.cookie http://127.0.0.1:4000/api/alerts/al-1
```

The case detail includes `allowedActions`, initially including `acknowledge` and
`escalate` where the alert type permits them.

### C. Acknowledge and escalate with ownership transfer

```bash
curl -b ops.cookie -X POST \
  -H 'Content-Type: application/json' \
  -d '{"action":"acknowledge","note":"Provider operations received the advisory."}' \
  http://127.0.0.1:4000/api/alerts/al-1/action

curl -b ops.cookie -X POST \
  -H 'Content-Type: application/json' \
  -d '{"action":"escalate","note":"The evidence needs risk review with the agent context."}' \
  http://127.0.0.1:4000/api/alerts/al-1/action
```

The escalation response contains:

```json
{
  "ok": true,
  "id": "al-1",
  "previousStatus": "acknowledged",
  "status": "escalated",
  "previousAssignedRole": "provider_ops",
  "assignedRole": "risk_analyst"
}
```

### D. Risk analyst resolves with a visible disposition

```bash
curl -c risk.cookie \
  -H 'Content-Type: application/json' \
  -d '{"username":"risk.reviewer","password":"cashlens-demo"}' \
  http://127.0.0.1:4000/api/auth/login

curl -b risk.cookie http://127.0.0.1:4000/api/alerts

curl -b risk.cookie -X POST \
  -H 'Content-Type: application/json' \
  -d '{"action":"resolve","note":"Reviewed with the agent; no further escalation is required."}' \
  http://127.0.0.1:4000/api/alerts/al-1/action

curl -b risk.cookie http://127.0.0.1:4000/api/alerts/al-1
```

The final case detail visibly reports:

```json
{
  "status": "resolved",
  "assignedRole": "risk_analyst",
  "allowedActions": [],
  "notes": ["... acknowledge ...", "... escalation ...", "... resolution ..."],
  "workflowEvents": [
    {"action":"create","to_status":"new"},
    {"action":"acknowledge","to_status":"acknowledged"},
    {"action":"escalate","to_status":"escalated"},
    {"action":"resolve","to_status":"resolved"}
  ]
}
```

## 3. Server-side authority rules

`server/src/engine/workflow.ts` and `server/src/routes/alerts.ts` enforce:

- provider operations can acknowledge and escalate;
- provider operations may resolve operational alerts but cannot resolve
  `unusual_transaction` cases;
- risk analysts can resolve escalated cases;
- agents, FSP users, and management cannot mutate cases;
- escalation and resolution require a written note;
- invalid transitions return `403` or `400` without mutation.

The UI hides actions that are unavailable, but the API remains the authority.

## 4. Read-only verifier

After seeding, run:

```bash
cd server
npm run verify:lifecycle
```

The verifier checks the seeded alert's initial routing, creation audit event,
legal provider-operations actions, escalation owner, risk resolution permission,
and visible `resolved` terminal status. The full HTTP sequence above verifies
the mutations and resulting timeline when demonstrating the prototype.

Approval requested: review the lifecycle audit before Phase 3, Step 5.
