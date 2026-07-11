# Core Prototype Flow

This document describes the working Phase 2 flow in CashLens. It connects the
relational seed data, liquidity aggregation, alert detection, role-scoped API
responses, live synthetic events, and case coordination workflow.

## 1. End-to-end demonstration

```text
Seed database
    |
    v
Compute liquidity + provider data quality
    |
    v
Run detectors and persist evidence/confidence
    |
    +--> Agent dashboard: shared cash + three separate provider floats
    |
    +--> Provider operations: masked provider-scoped queue
    |        |
    |        +--> acknowledge or escalate with note
    |                         |
    |                         v
    +--> Risk analyst: escalated evidence + human disposition
                              |
                              +--> resolve with audit note
```

The flow is designed for a judge or reviewer to follow one synthetic agent from
an observed balance/transaction condition through an alert and, when appropriate,
through an authorized human workflow.

## 2. Startup and seed flow

Run the server setup from Ubuntu/Linux or a local development shell:

```bash
cd server
npm install
npm run seed
npm run dev
```

`server/src/db/seed.ts` performs these steps:

1. Migrates the SQL schema if required.
2. Creates a seeded random generator with seed `42`.
3. Creates providers, agents, physical cash, and separate provider balances.
4. Generates multi-day cash-in/cash-out history.
5. Injects labeled synthetic conditions for validation.
6. Stores `sim_now` and seed metadata.
7. Runs the detector and persists the initial alert set.

The labels are ground truth for validation only. `runDetection()` computes alerts
from observed balances, timestamps, transaction history, and data quality.

## 3. Balance aggregation flow

The aggregation path is implemented in
`server/src/engine/liquidityScorer.ts`.

```text
agents
  + agent physical_cash
  + agent_provider_balances for bKash/Nagad/Rocket
  + today's transaction totals
  + eight rolling 30-minute windows
        |
        v
  EWRH demand forecast over four hours
        |
        +--> physical-cash pressure
        +--> provider-float pressure
        +--> shortage estimate
        +--> confidence penalties
        +--> overall pressure level
```

Important calculation boundaries:

- Cash-out reduces the shared physical-cash drawer.
- Provider e-money movement is calculated separately for each provider.
- Missing, future-dated, invalid, or stale provider snapshots are classified
  before they can influence a balance calculation.
- A provider operations response shows its own exact provider balance, while other
  providers and shared cash are reduced to pressure direction.
- Management receives aggregate overview data instead of individual balances.

## 4. API endpoints for the working flow

The prototype uses a real demo login flow: passwords are checked against salted
scrypt hashes, an HttpOnly session cookie is created, and role/provider/agent scope
is read from the authenticated server-side user record. The demo identities are
synthetic; production would add an external identity provider and MFA.

| Endpoint | Example | Purpose |
|---|---|---|
| `GET /api/health` | `/api/health` | Liveness and provider-input state |
| `GET /api/ready` | `/api/ready` | Readiness; missing feeds return not-ready |
| `GET /api/meta` | `/api/meta` | Providers, agents, and simulation clock |
| `POST /api/auth/login` | `/api/auth/login` | Verify demo identity and create session |
| `GET /api/auth/me` | `/api/auth/me` | Read current authenticated scope |
| `POST /api/auth/logout` | `/api/auth/logout` | Revoke current session |
| `GET /api/agents` | `/api/agents` | Session-scoped liquidity list |
| `GET /api/agents/:id` | `/api/agents/agent-5` | Agent detail, timeline, and open alerts |
| `GET /api/overview` | `/api/overview` | Management aggregates |
| `GET /api/alerts` | `/api/alerts` | Session-scoped provider queue |
| `GET /api/alerts` | `/api/alerts` | Escalated/resolved risk queue based on session |
| `GET /api/alerts/:id` | `/api/alerts/al-3` | Case evidence and allowed actions |
| `POST /api/alerts/:id/action` | `/api/alerts/al-3/action` | Acknowledge/escalate/resolve |
| `GET /api/whatif/:agentId` | `/api/whatif/agent-5?multiplier=2` | Read-only demand projection |
| `GET /api/live-feed/snapshot` | `/api/live-feed/snapshot` | Current synthetic snapshot |
| `GET /api/live-feed/stream` | `/api/live-feed/stream` | Server-Sent Events stream |
| `POST /api/live-feed/control` | `/api/live-feed/control` | Pause/resume/inject demo event |

## 5. Alert-triggering flow

### Automatic detection

The seed path and first server boot call `runDetection()` when the alert table is
empty. The detection pass:

1. Computes liquidity for every agent.
2. Creates physical-cash pressure drafts when projected cash-out demand is high.
3. Creates provider liquidity drafts for high-pressure floats.
4. Creates data-quality drafts for stale, missing, or inconsistent feeds.
5. Compares provider floats for cross-provider imbalance.
6. Calculates per-agent transaction baselines and checks z-score/operating-hour
   deviations.
7. Stores alert evidence, severity, confidence, assignment, and source transaction.

The detector does not read `scenario_tag`, `is_synthetic_anomaly`, or
`anomaly_kind` when making its decisions.

### Example: run a fresh detection pass

The normal demo path is to reseed, which clears old case state and runs detection:

```bash
cd server
npm run seed
```

The API then exposes the resulting alert queue. A production implementation would
schedule or trigger a detection pass from validated provider-feed ingestion; that
integration is outside this synthetic prototype.

## 6. Case coordination flow

```mermaid
sequenceDiagram
  participant Ops as Provider operations
  participant API as Express API
  participant DB as SQLite
  participant Risk as Risk analyst

  Ops->>API: GET /api/alerts?role=provider_ops&providerId=bkash
  API->>DB: Select own-provider + cross-provider alerts
  API-->>Ops: Masked queue with evidence/confidence
  Ops->>API: GET /api/alerts/:id?role=provider_ops&providerId=bkash
  API-->>Ops: Case detail + allowedActions
  Ops->>API: POST /api/alerts/:id/action {action: acknowledge}
  API->>DB: Set status acknowledged; append case note
  Ops->>API: POST /api/alerts/:id/action {action: escalate, note: ...}
  API->>DB: Set status escalated; assign risk_analyst; append note
  Risk->>API: GET /api/alerts?role=risk_analyst
  API-->>Risk: Escalated cases only
  Risk->>API: POST /api/alerts/:id/action {action: resolve, note: ...}
  API->>DB: Set status resolved; append disposition note
  API-->>Risk: Updated status and assigned role
```

The server validates all of the following before changing case state:

- The selected role can access the case.
- The provider operations role is viewing its own provider or a cross-provider case.
- The requested action is legal for the current status, role, and alert type.
- Escalation and resolution include a non-empty written note.
- The next status and assigned role follow the workflow state machine.

Provider operations can never resolve an unusual-transaction case. Risk analysts
can resolve escalated cases. Agents, financial-service-provider users, and
management users observe but do not perform case actions in this prototype.

## 7. Live synthetic flow

The live feed is intentionally separate from the persisted alert workflow:

1. The in-memory stream starts when the server listens.
2. The client loads a snapshot from `/api/live-feed/snapshot`.
3. The client subscribes to `/api/live-feed/stream` through Server-Sent Events.
4. Synthetic transactions update rolling metrics and active alerts in the snapshot.
5. Demo controls can pause/resume, inject liquidity drain, or inject an anomaly.
6. No live control writes to a provider, moves money, or changes a real account.

## 8. Failure and uncertainty behavior

| Condition | API/UI behavior |
|---|---|
| Database not seeded | Health/readiness reports unavailable; server does not fabricate a clear queue |
| Missing provider snapshot | Provider state is `missing`; balance is unavailable and confidence is reduced |
| Future or invalid timestamp | Provider state is `inconsistent`; value is not treated as valid |
| Feed older than 60 minutes | State is `stale`; figures are marked unconfirmed and confidence is penalized |
| Insufficient history | Forecast confidence includes sparse/thin-horizon penalties |
| Unauthorized case action | API returns `403` and does not mutate the database |
| Missing required note | API returns `400` and does not mutate the workflow |
| Live stream unavailable | Client reports unavailable status rather than interpreting silence as safety |

## 9. Prototype boundaries

This flow demonstrates decision support and coordination. It intentionally does not
implement production authentication, provider integration, payment execution,
account blocking, automated fraud adjudication, or customer surveillance.
