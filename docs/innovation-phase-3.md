# Innovation Phase 3 — Inclusive communication and traceability

Status: implemented for review.

## 1. Inclusive alert payload

The server already stores localized alert explanations in the evidence payload.
The agent-facing contract is now documented and rendered through the reusable
`InclusiveAlertCard` component.

```json
{
  "id": "al-demo-001",
  "type": "unusual_transaction",
  "severity": "medium",
  "status": "new",
  "confidence": 0.78,
  "providerId": "bkash",
  "evidence": {
    "kind": "volume_spike",
    "signals": {
      "amount": 18400,
      "baseline_mean": 6200,
      "baseline_stddev": 1900,
      "z_score": 6.42
    },
    "unconfirmed": false,
    "explanation": {
      "en": "This cash-out is 6.4 times the agent's usual variation. Please review the context before taking any action.",
      "bn": "এই ক্যাশ-আউট এজেন্টের স্বাভাবিক ওঠানামার তুলনায় ৬.৪ গুণ বেশি। কোনো পদক্ষেপের আগে প্রেক্ষাপট যাচাই করুন।",
      "banglish": "Ei cash-out agent-er shabhabik variation-er cheye 6.4 gun beshi. Kono podokkhep-er age prekkhapot check korun."
    },
    "suggestedAction": {
      "en": "Review the evidence and confirm whether this was an approved operational event.",
      "bn": "প্রমাণ পর্যালোচনা করে নিশ্চিত করুন এটি অনুমোদিত অপারেশনাল ঘটনা কি না।",
      "banglish": "Proman review kore nishchit korun eta approved operational event chhilo kina."
    }
  },
  "advisoryOnly": true,
  "humanReviewRequired": true
}
```

Communication rules:

- Put the conclusion first, then the reason, then the safe next step.
- Avoid “fraudster”, “guilty”, or “block now”; the prototype does not make those
  determinations.
- Keep the exact signal values available under an evidence disclosure control.
- Render provider scope and confidence beside the message.
- Use `role="alert"` only for high-severity messages and `role="status"` for
  lower-severity updates; both remain advisory.
- Never expose customer identifiers, PINs, OTPs, private keys, or raw precise
  location in an agent-facing payload.

## 2. Frontend component structure

```text
AgentView
└── InclusiveAlertCard
    ├── SeverityChip + StatusChip
    ├── localized explanation
    ├── localized suggested action
    ├── ProviderChip + confidence
    └── accessible evidence disclosure (<details>)
```

`client/src/components/InclusiveAlertCard.tsx` reads the current language from
the application state, falls back to English when necessary, and exposes the
signal list without adding any financial action button.

## 3. Lifecycle audit records

Alert creation is written to `alert_workflow_events` with:

```text
action=create, actor_role=system, from_status=new, to_status=new
```

Acknowledgement, escalation, resolution, and human feedback append their own
events with actor role, ownership transition, note, and timestamp. Feedback is
also normalized in `alert_feedback` and never silently changes the alert state.

The database migration in `server/src/db/index.ts` rebuilds the small workflow
table when upgrading a database created before the `create` action existed.

## 4. Linux JSONL lifecycle logger

`server/scripts/alert_lifecycle_logger.py` is a read-only standard-library
observer. It emits one JSON object per line for:

- `alert_created`;
- `alert_lifecycle_transition` (including escalation and resolution);
- `alert_review_feedback`;
- `system_health` with SQLite integrity and row counts;
- `logger_error` when the database cannot be read.

Run a one-time audit export:

```bash
python3 server/scripts/alert_lifecycle_logger.py --once \
  --output /tmp/cashlens-alert-lifecycle.jsonl
```

Follow the database for a local monitoring process:

```bash
python3 server/scripts/alert_lifecycle_logger.py \
  --follow --interval 5 \
  --output /var/log/cashlens-alert-lifecycle.jsonl
```

For a systemd deployment, run the command as a restricted service account with
read access to `server/data/cashlens.sqlite3` and write access only to the log
directory. Rotate the JSONL file with `logrotate`; do not put secrets in notes
or log fields.

Example lifecycle record:

```json
{"loggedAt":"2026-07-12T10:00:00Z","service":"cashlens-alert-lifecycle","event":"alert_lifecycle_transition","alertId":"al-3","action":"escalate","fromStatus":"acknowledged","toStatus":"escalated","fromOwner":"provider_ops","toOwner":"risk_analyst","actorRole":"provider_ops","createdAt":"2026-07-12T10:04:00Z"}
```

The logger is observational. It does not acknowledge, escalate, resolve,
freeze, block, transfer, or otherwise mutate a case.

## 5. Acceptance criteria

- English, Bengali, and Banglish alert text is available in the payload.
- The agent UI presents a readable reason and safe next step.
- Alert creation, escalation, resolution, and feedback have structured audit
  records.
- The logger can export history once and follow new events on Linux.
- Health records include database integrity, alert counts, feedback counts, and
  query latency.

Phase 3 is complete for review.
