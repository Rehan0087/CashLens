# Data and Simulation Note

CashLens uses a deterministic synthetic dataset to demonstrate multi-provider
liquidity pressure, feed quality, unusual transaction behavior, and human case
coordination. The data is designed for a hackathon prototype and validation
evidence, not for production financial decisions.

## Generation paths

There are two supported generation paths:

1. **Integrated application seeder**: `server/src/db/seed.ts` uses the TypeScript
   simulation modules and runs the CashLens detection engine after loading data.
   This is the normal path for the application demo:

   ```bash
   cd server
   npm run seed
   ```

2. **Portable SQL generator**: `server/scripts/generate_synthetic_sql.py` uses only
   Python's standard library and emits SQL compatible with
   `server/src/db/schema.sql`. It is useful for Ubuntu/Linux data inspection,
   reproducible fixtures, and database-focused demonstrations:

   ```bash
   python3 server/scripts/generate_synthetic_sql.py \
     --seed 42 \
     --agents 36 \
     --days 14 \
     --sim-now 2026-07-12T16:00:00+06:00 \
     --output server/data/synthetic_seed.sql
   ```

   To print SQL to stdout instead of writing a file:

   ```bash
   python3 server/scripts/generate_synthetic_sql.py --output - > server/data/synthetic_seed.sql
   ```

The generated SQL loads base entities and labeled transactions. It deliberately
does not insert alerts: alerts are observations derived by the TypeScript detector
from balances and transactions. After loading a SQL fixture into the database,
run the application detection pass before evaluating the alert queue.

## Relational entities

- **Providers**: bKash, Nagad, and Rocket are independent provider records.
- **Agents**: each agent has an area, one physical-cash amount, and a validation
  scenario tag.
- **Agent provider balances**: one row per agent/provider pair, with an e-money
  balance and synchronization timestamp. The composite key prevents duplicates.
- **Transactions**: cash-in and cash-out events reference both an agent and a
  provider. Amount, timestamp, and anomaly labels are stored for reproducibility.
- **Alerts**: generated later by the detector with evidence, severity, confidence,
  and workflow status.
- **Case notes**: append-only coordination notes for escalation and resolution.
- **Simulation metadata**: stores the frozen simulation clock and generator source.

## Baseline assumptions

- Default seed is `42`; equal seed and parameters produce the same generated values.
- Default population is 36 agents across six Bangladesh-style operating areas.
- Default history is 14 days plus a focused demo day ending at 16:00 Bangladesh time.
- Each agent has one shared physical-cash drawer and three separate e-money floats.
- Normal transactions use agent-specific baseline mean and standard deviation.
- Demo-day afternoon activity increases ordinary demand without automatically making
  every larger transaction an anomaly.
- Provider-feed timestamps are part of the observation and can be stale or future-
  dated to model inconsistent input.
- Amounts are integer BDT-like values for readable demonstrations; they are not
  real currency balances.

## Injected scenario conditions

Every fourth agent after the first receives one engineered scenario. The labels are
ground truth for validation only; the detector must infer alerts from observed
balances, transaction history, timestamps, and feed quality.

| Scenario | Synthetic condition | Expected analytical signal |
|---|---|---|
| `liquidity_pressure` | Low physical cash plus a labeled large cash-out | Shared drawer shortage and pressure forecast |
| `cross_provider_imbalance` | High bKash float and low Nagad/Rocket floats | Separate provider deficit/surplus relationship |
| `stale_data` | bKash feed hours behind; Nagad sync timestamp in the future | Data-quality alert and reduced confidence |
| `unusual_transaction` | Two high volume spikes, one odd-hour event, one subtle 2.1-2.4 sigma event | Detectable anomalies plus an intentionally difficult miss |

The unusual-transaction scenario intentionally includes a subtle spike below the
normal 3-sigma detector threshold. This prevents the validation report from being
artificially perfect and demonstrates the trade-off between sensitivity and false
positives.

## Data-quality and safety boundaries

- `scenario_tag`, `is_synthetic_anomaly`, and `anomaly_kind` are never used as
  user-facing evidence or direct detector inputs.
- Stale or inconsistent balances are not silently converted to zero or treated as
  trustworthy; the application marks affected figures and reduces confidence.
- The synthetic dataset contains no real accounts, customer identities,
  credentials, provider API connections, or personally identifying information.
- No generated transaction represents an instruction to move money.
- The optional AI advisory receives aggregate synthetic metrics only and cannot
  authorize a case action.
- Provider and role masking remains server-side when the application serves the
  generated database.

## Limitations

- Randomness models plausible ranges, not a statistically representative sample of
  Bangladesh's actual mobile-money economy.
- Provider balances are snapshots; the prototype does not model a full settlement
  ledger, reconciliation process, or external provider uptime.
- The simulation does not model production identity management, MFA, fraud
  investigation, customer consent, legal retention, or multi-tenant access control.
- The synthetic labels are useful for measuring detector behavior but would not be
  available in a real deployment.
- SQLite and generated SQL are appropriate for local/demo use; production would
  require managed relational infrastructure, migrations, backups, and monitoring.
