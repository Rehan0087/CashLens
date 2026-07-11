# CashLens — Super Agent Liquidity & Risk Intelligence

*One drawer. Three floats.* এক ড্রয়ার, তিনটি আলাদা ফ্লোট।

A decision-support prototype for the **SUST CSE Carnival 2026 Codex Community Hackathon**
(bKash challenge). Mobile-money agents in Bangladesh serve bKash, Nagad, and Rocket
customers from **one pool of physical cash** but **three separate e-money floats**.
CashLens gives the agent, each provider's ops team, risk analysts, and FSP management
a shared understanding of liquidity pressure and unusual activity — **without merging
wallets, making fraud decisions, or executing any financial action**.

> Everything in this repository is synthetic. There are no real accounts, balances,
> customer identities, credentials, or provider APIs anywhere in the system.

## Quick start

Requires **Node.js ≥ 24** (uses the built-in `node:sqlite` — no native builds, no Docker).

```bash
# 1. API server (port 4000)
cd server
npm install
npm run seed        # builds the synthetic dataset + runs the detection engine
npm run dev

# 2. Web client (port 5173), in a second terminal
cd client
npm install
npm run dev
```

## Ubuntu/Linux setup

The documented target is Ubuntu 22.04+ or another current Linux distribution.
Node.js 24+ is required because the server uses Node's built-in SQLite support.

```bash
sudo apt update
sudo apt install -y git curl python3
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
source "$HOME/.nvm/nvm.sh"
nvm install 24
nvm use 24

git clone https://github.com/Rehan0087/CashLens.git
cd CashLens

cd server
npm ci
cp .env.example .env
npm run seed
npm run build

cd ../client
npm ci
npm run build
```

For development, use two terminals:

```bash
# terminal 1
cd CashLens/server
npm run dev

# terminal 2
cd CashLens/client
npm run dev
```

Open `http://localhost:5173`. In production mode, build the client and server,
then run `npm start` from `server/`; the Express server serves `client/dist` when
that directory exists.

### Environment variables

Copy `server/.env.example` to `server/.env` for local development. `.env` is
ignored by Git and must never be committed.

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `4000` | Express API and production web-server port |
| `HOST` | `127.0.0.1` | Bind address; use `0.0.0.0` only for an intentional LAN demo |
| `OPENAI_API_KEY` | empty | Optional key for the synthetic advisory only |
| `OPENAI_MODEL` | `gpt-5.6` | Optional advisory model override |

### Demo sign-in accounts

The landing page uses server-side demo authentication. Passwords are stored as
salted scrypt hashes and successful sign-in creates an HttpOnly session cookie.
For the synthetic hackathon dataset, all demo accounts use the password
`cashlens-demo`:

| Username | Role/scope |
|---|---|
| `agent.demo` | Multi-provider agent demo scope |
| `ops.bkash` | bKash provider operations |
| `risk.reviewer` | Risk/compliance reviewer |
| `fsp.bkash` | bKash financial-service provider |
| `management` | Aggregate operations management |

The client cannot choose a different role by editing a URL. The server derives
role, provider scope, and agent scope from the authenticated session. These are
demo credentials only; production requires an identity provider, MFA, rate
limiting, recovery controls, and a real password policy.

The application remains fully usable without `OPENAI_API_KEY`; deterministic local
signals remain authoritative and the AI advisory is shown as disabled.

### Loading sample data

The integrated application seed is the recommended path:

```bash
cd server
npm run seed
```

For a portable SQL fixture, generate data with Python's standard library:

```bash
cd CashLens
python3 server/scripts/generate_synthetic_sql.py \
  --seed 42 \
  --agents 36 \
  --days 14 \
  --sim-now 2026-07-12T16:00:00+06:00 \
  --output server/data/synthetic_seed.sql
```

The generated SQL is compatible with `server/src/db/schema.sql` and contains
providers, agents, separate balances, transactions, simulation metadata, and
validation labels. It does not insert alerts; run the application's detection
pass after loading a fixture. Full assumptions and limitations are documented in
[docs/data-simulation-note.md](docs/data-simulation-note.md).

Open http://localhost:5173, sign in with a demo identity, and enter its authorized workspace. The demo dataset is anchored to a frozen
simulated clock (**today 16:00**, the afternoon peak) and a fixed PRNG seed (**42**),
so every run reproduces the same story.

### Live transaction feed

Open **Live transaction feed** from the landing page or the app header for the real-time
synthetic stream. It uses Server-Sent Events at `/api/live-feed/stream` and keeps a
five-minute rolling risk window. The demo controls can pause/resume the
stream, inject a ten-second bKash liquidity drain, or inject five identical 20,000 BDT
Cash-Outs from one synthetic account. These controls only change in-memory demo state;
they never call a provider API or move money.

To enable the optional OpenAI advisory card, set `OPENAI_API_KEY` in the server
environment and optionally set `OPENAI_MODEL`. The server sends only aggregate,
synthetic five-minute metrics to the Responses API. The local risk score, balance
limits, and stop-before-negative safeguards remain authoritative; OpenAI provides an
additional structured advisory that always requires human review.

```bash
npm run metrics     # (in /server) recomputes validation metrics
                    # -> server/data/metrics.json + docs/validation-evidence.md
```

## Guided scenarios (A–D)

The fastest way to see the whole product: choose **Multi-provider agent** on the
landing page, then open **Guided scenarios** from the app header. It presents the four demonstration scenarios from the
challenge brief and, for each, jumps straight to the exact agent or case that shows
it — with a banner stating the scenario and what to notice.

- **A · Hidden provider shortage** — totals look healthy, one float is nearly empty.
- **B · Liquidity pressure with unusual activity** — cash falling fast *and* a spike.
- **C · Cross-provider / data inconsistency** — a stale feed and a conflicting feed.
- **D · Coordinated response and closure** — routing → ownership → ack → escalate → resolve.

Targets are computed live from the seeded data (`server/src/engine/scenarios.ts`),
so they stay correct across reseeds. Full mapping in
[docs/requirements-traceability.md](docs/requirements-traceability.md).

## The five-minute demo flow

1. **Agent** (pick *Rahim M. — Mirpur*): one drawer bar shows physical cash beside three
   separate floats; the bKash feed is hours stale and marked **unconfirmed** rather than
   trusted. Slide *What if demand rises?* to stress-test the afternoon.
2. **Agent** (pick *Beauty U. — Mirpur*): projected cash-out demand exceeds cash in hand —
   the pressure dial goes high, with a plain-language explanation in EN / বাংলা / Banglish.
3. **Provider Ops (bKash)**: the alert queue ranks a 7.9σ cash-out spike with evidence,
   confidence, and the agent's masked drawer (other providers' balances are hidden —
   only pressure direction is shared). Acknowledge, then **escalate with a note**.
4. **Risk Analyst**: the escalated case arrives with the full evidence band (amount vs
   the agent's usual range), the ops note, and a **disposition** form. The system never
   blocks or accuses — the analyst records the human judgement.
5. **FSP Management**: area hotspots, provider counts (never balances), and the live
   **validation metrics** panel — recall, false-positive rate, precision, scenario
   coverage, engine runtime, dashboard p95.

## Architecture

See [docs/architecture-diagram.md](docs/architecture-diagram.md) for the full diagram.

```
client/  React + Vite + TS    role views, drawer bar, case panels, i18n toggle
server/  Express + node:sqlite
  src/simulation/             seeded synthetic data generator + labeled anomaly injector
  src/engine/                 liquidity scorer, detectors, workflow rules, metrics
  src/routes/                 role-scoped REST API (masking enforced server-side)
  src/i18n/                   trilingual alert explanations (EN / BN / Banglish)
docs/                         simulation note, responsible-design note, validation evidence
```

## What the engine detects

| Alert type | Signal | Example evidence |
|---|---|---|
| Liquidity pressure | EWRH-projected 4h demand vs physical cash / per-provider float | `projected_cash_out_next_4h`, `pressure_score`, forecast confidence |
| Cross-provider imbalance | one float ≥8× another and the small one below demand floor | surplus/deficit pair + ratio |
| Unusual transaction | z-score ≥ 3σ vs the agent's own 13-day baseline; hours outside usual window | `z_score`, `baseline_mean ± σ`, time |
| Data quality | balance feed stale > 60 min | `stale_minutes`; related alerts marked *unconfirmed* |

Liquidity forecasts use an Exponentially Weighted Rolling Horizon (eight 30-minute
windows, with recent demand weighted most heavily). A rule-based confidence engine
then deducts confidence for degraded feeds, sparse history, thin horizon coverage,
and volatile transaction amounts. Every alert carries the resulting confidence,
structured signals, a trilingual explanation, and a suggested next step. Alerts
from stale feeds are labeled *unconfirmed* instead of being silently trusted or dropped.

## Coordination and authority separation

`new → acknowledged → escalated → resolved`, enforced server-side:

- **Provider ops** acknowledge/escalate; they can close operational alerts but can
  **never** resolve an unusual-transaction case.
- **Risk analysts** alone resolve escalated cases, and must record a disposition.
- Escalation and resolution **require a written note** — the audit trail is the product.
- Ops see other providers' balances masked (pressure direction only); management sees
  counts, never balances; agents see only their own operation.

## Validation

Generated ground truth (labeled injected anomalies + engineered agent scenarios) lets
the engine be scored honestly — see [docs/validation-evidence.md](docs/validation-evidence.md).
Headline numbers on the fixed seed: **75% recall** (the misses are deliberately subtle
2.2σ anomalies — catching them costs 29 false positives, shown in the threshold sweep),
**0.0% FPR**, **100% precision**, **100% scenario coverage**, **~8ms** full detection pass.

## SonarQube analysis

GitHub Actions runs the client/server builds and a SonarQube scan on every push and
pull request. The workflow is defined in
`.github/workflows/sonarqube.yml`, with project settings in
`sonar-project.properties`.

Before the first run, create a matching project in SonarQube Server with the key
`Rehan0087_CashLens`, then add these repository secrets under **Settings → Secrets
and variables → Actions**:

- `SONAR_HOST_URL`: the reachable URL of the SonarQube Server instance, such as
  `https://sonarqube.example.com`.
- `SONAR_TOKEN`: a project or user analysis token with permission to submit scans.

The SonarQube Server must be reachable from GitHub-hosted runners. The workflow
uses Node.js 24, installs both lockfiles with `npm ci`, builds the client and server,
and then analyzes `client/src` and `server/src` while excluding dependencies,
generated output, runtime data, logs, and documentation.

## Responsible design

The prototype deliberately cannot: move money, merge wallets, block accounts, name
anyone a fraudster, or read real data. Full discussion — privacy, human review,
false-positive handling, refusal list — in
[docs/responsible-design-note.md](docs/responsible-design-note.md).

## Docs index

- [docs/architecture-diagram.md](docs/architecture-diagram.md)
- [docs/core-prototype-flow.md](docs/core-prototype-flow.md)
- [docs/data-simulation-note.md](docs/data-simulation-note.md)
- [docs/responsible-design-note.md](docs/responsible-design-note.md)
- [docs/validation-evidence.md](docs/validation-evidence.md) *(generated)*
- [docs/demo-script.md](docs/demo-script.md)
- [docs/requirements-traceability.md](docs/requirements-traceability.md) *(brief §5–§16 → implementation: stakeholders, scope, functional, non-functional, scenarios A–D)*
- [docs/rubric-compliance.md](docs/rubric-compliance.md) *(capability, metric, and non-functional requirement map)*
