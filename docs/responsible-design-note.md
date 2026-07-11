# Responsible-Design Note

CashLens is a synthetic decision-support prototype. It helps people reason about
liquidity and unusual activity, but it is not an automated enforcement, banking,
credit, identity, or fraud-adjudication system.

## 1. Explicit non-actions

The prototype intentionally does not:

- execute cash transfers, wallet transfers, top-ups, withdrawals, or payments;
- connect to bKash, Nagad, Rocket, bank, telecom, or customer systems;
- block, freeze, suspend, close, or downgrade an account;
- declare a customer, agent, transaction, or provider fraudulent;
- merge physical cash with any provider e-money balance;
- make a final risk, compliance, fraud, credit, or eligibility decision;
- identify or surveil real customers;
- send an operational instruction to a provider;
- use an AI response as authority for an action.

The live controls inject synthetic in-memory events only. They do not represent
real transaction controls.

## 2. Privacy and data minimization

- All seeded names, areas, account-like identifiers, amounts, transactions, and
  anomaly labels are synthetic.
- No production credentials, provider tokens, customer identifiers, or real API
  connections are included in the repository.
- Provider operations receives its own provider's exact context where permitted;
  other provider balances and shared physical cash are masked to pressure direction.
- Management receives aggregate readiness, counts, and pressure indicators rather
  than individual balances or case evidence.
- Risk analysts receive escalated case evidence needed for human review, not an
  unrestricted database export.
- The optional AI advisory receives aggregate synthetic live metrics, not raw
  customer records or credentials.
- Runtime `.env` files, SQLite data, logs, dependency directories, and generated
  outputs are excluded from Git.

The prototype now uses seeded demo identities, salted scrypt password hashes,
HttpOnly session cookies, and server-side role/provider/agent scope. The shared
demo password is synthetic and must never be reused in production. A deployment
with real data would still require an external identity provider, password policy,
MFA, account recovery, rate limiting, least-privilege authorization, audit
logging, key management, retention controls, and legal/privacy review.

## 3. Human review and authority separation

The system separates observation from action:

| Role | May observe | May act in prototype |
|---|---|---|
| Multi-provider agent | Own physical cash, own provider floats, forecasts, own alerts | No case action; what-if is read-only |
| Provider operations | Assigned-provider queue and masked cross-provider context | Acknowledge/escalate; resolve operational cases only |
| Risk analyst | Escalated and resolved cases with evidence | Resolve escalated cases with a disposition note |
| Financial service provider | Own provider service pressure | No cross-provider case action |
| Management | Aggregates, counts, readiness, validation metrics | No individual case action |

Every escalation and resolution requires a written note. The note is stored in the
case timeline so a reviewer can distinguish the detector's suggestion from the
human decision. The API, not only the UI, validates role, provider, case status,
allowed action, and required note.

## 4. False positives and uncertainty

CashLens treats an alert as a prompt for review, not proof of wrongdoing.

- Every alert contains structured evidence, confidence, uncertainty, and a
  suggested next step.
- A stale feed is marked unconfirmed and confidence is reduced; it is not silently
  treated as a zero balance or a normal balance.
- Missing or inconsistent inputs are unavailable rather than invented.
- Unusual-transaction detection uses an agent's own historical baseline and exempts
  agents with insufficient history instead of guessing.
- The validation harness reports threshold trade-offs. The 3-sigma default keeps
  the current synthetic false-positive rate low, while a lower threshold catches
  more subtle examples at a documented false-positive cost.
- Ordinary afternoon demand is deliberately represented separately from unusual
  behavior so operational pressure does not automatically become a fraud claim.

The displayed confidence is model/engine confidence in the signal, not confidence
that a person committed wrongdoing. Human reviewers must consider missing context,
legitimate demand, feed quality, and alternative explanations.

## 5. Advisory and AI boundaries

The deterministic local engine remains authoritative for local risk scores, input
quality, provider masking, case permissions, and workflow transitions. The optional
OpenAI advisory is constrained to:

- aggregate synthetic live-stream metrics;
- a short structured summary and recommended review step;
- explicit `requires_human_review: true` behavior;
- no account, customer, or provider action;
- graceful disabled/error states when the API key or model is unavailable.

The advisory must not replace local safeguards, invent missing facts, accuse a
person, or authorize a transaction. Any future AI integration must preserve these
constraints and add privacy, security, model-risk, and cost review.

## 6. Safety and failure behavior

- API failures return a trace identifier without exposing internal stack traces.
- Health and readiness endpoints distinguish unavailable data from a healthy queue.
- A silent or unavailable live stream is not interpreted as a clear queue.
- Invalid workflow actions return an error without mutating case state.
- Required notes are validated before database mutation.
- Foreign keys and status checks constrain relational state transitions.
- Synthetic labels are available to validation but are not exposed as detector
  evidence or used directly to make user-facing decisions.

## 7. Prototype limitations

This project does not provide production authentication, multi-tenant isolation,
provider reconciliation, immutable event sourcing, disaster recovery, formal
privacy deletion workflows, fairness measurement on real populations, or a legal
determination of fraud. SQLite, query-parameter role simulation, and deterministic
fixtures are appropriate for a local hackathon demonstration only.

Before production use, the team would need independent security review, threat
modeling, access-control testing, data-protection review, provider contracts,
monitoring and incident response, representative evaluation data, and explicit
human-appeal procedures.
