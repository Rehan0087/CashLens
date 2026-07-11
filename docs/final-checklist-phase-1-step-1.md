# Final submission checklist — Phase 1, Step 1

## Data and balance separation review

Status: verified for review. This document covers only provider-context and
shared-cash separation; liquidity/anomaly evidence is the next checklist item.

## Reviewer finding

The schema represents three distinct provider contexts in the seeded dataset:
`bkash`, `nagad`, and `rocket`.

The money representations are structurally different:

```text
agents.physical_cash
  one value per agent, representing the shared physical drawer

agent_provider_balances
  one row per (agent_id, provider_id), representing a separate provider float
  composite primary key prevents duplicate provider snapshots for one agent

transactions.provider_id
  retains the provider context for each synthetic cash-in/cash-out event
```

The backend preserves the distinction in `computeAgentLiquidity()`:

- it reads `physical_cash` separately from `agents`;
- it reads provider balances through `agent_provider_balances` joined to
  `providers`;
- it calculates the physical-cash flow as `cash_out - cash_in`;
- it calculates each provider float flow as `cash_in - cash_out`;
- it forecasts and masks each provider row independently;
- it does not add provider balances into the physical-cash ledger.

The relevant backend query is:

```sql
SELECT a.id AS agent_id,
       p.id AS provider_id,
       p.name AS provider_name,
       b.e_money_balance,
       b.last_synced_at
FROM agents a
CROSS JOIN providers p
LEFT JOIN agent_provider_balances b
  ON b.agent_id = a.id
 AND b.provider_id = p.id
ORDER BY p.id;
```

The `CROSS JOIN` creates a separate provider context for every agent, while the
composite join prevents one provider's balance from being read as another
provider's balance. Missing snapshots remain `NULL` and are classified as
unavailable rather than treated as zero.

## Reproducible verification

From the repository root:

```bash
cd server
npm run seed
npm run verify:separation
```

The verifier exits with status 1 if any invariant fails. It checks:

- at least two provider contexts exist;
- each seeded agent has one shared-cash value;
- provider balance rows match the agent/provider grid;
- at least two provider contexts appear in transactions;
- no duplicate `(agent_id, provider_id)` balance keys exist;
- no transaction references an unknown provider.

The same read-only report is available as SQL for an Ubuntu SQLite terminal:

```bash
sqlite3 server/data/cashlens.sqlite3 \
  < server/scripts/verify_provider_separation.sql
```

The SQL report prints provider totals and a sample showing one agent's shared
physical cash beside independent bKash/Nagad/Rocket e-money rows. It does not
merge those values.

## Acceptance result on the seeded fixture

The deterministic seed produces 36 agents, 3 providers, 108 provider-balance
rows, and transactions across all three provider contexts. The verification
script must report `passed: true` for this fixture.

## Boundary conclusion

The current prototype demonstrates distinct provider contexts and a separate
shared physical-cash pool. It is not a production settlement ledger: it uses
synthetic SQLite data, does not reconcile real provider systems, and never
executes a transfer or rebalancing action.

Approval requested: review this separation evidence before Phase 1, Step 2.
