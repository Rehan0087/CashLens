# Innovation Phase 2 — Operational workflows and human-in-the-loop review

Status: implemented for review. Phase 3 inclusive communication examples and
Linux lifecycle logging are not included in this phase.

## 1. Provider-aware planning

`GET /api/planning/context` returns a four-hour operational context composed of
independent forecasts:

- shared physical-cash total, projected outflow, pressure level, and estimated
  exhaustion time;
- one row per provider with its own e-money balance, projected inflow need,
  pressure level, feed state, and estimated exhaustion time;
- a constraint comparison identifying whether provider e-money, shared cash,
  no projected shortage, or insufficient data is the limiting condition.

The endpoint is session-authenticated. Role masking is applied on the server:

| Role | Exact own provider values | Other provider values | Shared cash exact values |
|---|---:|---:|---:|
| Provider operations | Yes | No | No |
| Financial service provider | Yes | No | No |
| Risk analyst | Yes | Yes | Yes |
| Management | No | No | No |
| Agent | Endpoint denied | Endpoint denied | Endpoint denied |

The scorer never adds provider balances together. It computes each provider's
time-to-depletion independently, then compares those estimates with the
separate shared-cash estimate. The output is advisory and cannot execute a
top-up, wallet transfer, rebalancing, or cash movement.

The React `PlanningPanel` is used by operations, FSP, risk, and management
views. Masked values render as unavailable rather than zero, so missing
authority is not misrepresented as a healthy balance.

## 2. Ownership state machine

The existing alert state machine is now backed by an append-only event table.
The alert row stores current state; `alert_workflow_events` stores each
transition with actor identity, role, old/new status, old/new owner, note, and
timestamp.

```text
new --acknowledge--> acknowledged --escalate--> escalated --resolve--> resolved
 |                         |                     |
 +------escalate-----------+                     +--> feedback labels
 +------resolve (ops only for operational alerts)
```

Authority remains server-enforced:

- provider operations can acknowledge and escalate;
- provider operations can resolve operational/data-quality alerts but not
  unusual-transaction alerts;
- risk analysts resolve escalated cases and record review feedback;
- agents, FSP management, and financial service providers do not mutate cases.

Every transition retains the existing human-readable `case_notes` entry and
also writes a structured `alert_workflow_events` row. This keeps the current UI
timeline compatible while providing a machine-readable audit trail.

## 3. Human review and feedback loop

`POST /api/alerts/:id/feedback` accepts:

```json
{
  "outcome": "false_positive",
  "note": "The demand spike matched the approved holiday operating plan."
}
```

Supported outcomes:

- `confirmed_concern` — the reviewer agrees the evidence needs follow-up;
- `false_positive` — the signal did not represent a concern;
- `contextual_spike` — the increase was legitimate and context explained it;
- `insufficient_evidence` — the input quality or evidence was inadequate.

Only a risk analyst can submit feedback, and the case must be escalated or
resolved. A note of at least five characters is required. Feedback is stored in
the normalized `alert_feedback` table with reviewer role, rule version, and
timestamp. It does not silently change the alert state and does not retrain a
model automatically.

The risk case panel exposes the feedback form and renders previous labels. A
future calibration job may use reviewed labels, subject to governance and
versioned rule approval; this prototype only records the feedback for audit and
analysis.

## 4. Privacy and safety boundaries

- Provider scope comes from the authenticated session, never from a trusted
  client query parameter.
- Cross-provider context exposes pressure direction where appropriate, not
  another provider's exact balance.
- The planning endpoint does not create a cross-provider ledger.
- A false-positive label is a human annotation, not an automated account action.
- No route blocks accounts, freezes funds, executes transfers, or makes a final
  fraud determination.

## 5. Review checklist

- Sign in as `ops.bkash`, open `/api/planning/context`, and verify non-bKash
  balances are masked.
- Escalate an alert from provider operations.
- Sign in as `risk.reviewer`, open the escalated case, and record a false-positive
  or contextual-spike label with a written explanation.
- Confirm the case detail contains both the workflow event and feedback row.
- Verify a direct request with spoofed `role`, `providerId`, or `agentId` query
  parameters cannot expand the session scope.

Approval requested: review Phase 2 before Phase 3 is started.
