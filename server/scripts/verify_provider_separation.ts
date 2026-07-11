import { db, migrate } from "../src/db/index.js";

type CountRow = { n: number };
type ProviderTotal = { provider_id: string; balance_rows: number; total_balance: number };

function count(sql: string): number {
  return Number((db.prepare(sql).get() as CountRow).n);
}

function verify() {
  migrate();

  const providerCount = count("SELECT COUNT(*) AS n FROM providers");
  const agentCount = count("SELECT COUNT(*) AS n FROM agents");
  const balanceRows = count("SELECT COUNT(*) AS n FROM agent_provider_balances");
  const sharedCashRows = count("SELECT COUNT(*) AS n FROM agents WHERE physical_cash >= 0");
  const distinctTransactionProviders = count("SELECT COUNT(DISTINCT provider_id) AS n FROM transactions");
  const duplicateBalanceKeys = count(
    `SELECT COUNT(*) AS n FROM (
       SELECT agent_id, provider_id FROM agent_provider_balances
       GROUP BY agent_id, provider_id HAVING COUNT(*) > 1
     )`
  );
  const orphanTransactions = count(
    `SELECT COUNT(*) AS n FROM transactions t
     LEFT JOIN providers p ON p.id = t.provider_id
     WHERE p.id IS NULL`
  );
  const providerTotals = db
    .prepare(
      `SELECT provider_id, COUNT(*) AS balance_rows, ROUND(SUM(e_money_balance), 2) AS total_balance
       FROM agent_provider_balances GROUP BY provider_id ORDER BY provider_id`
    )
    .all() as unknown as ProviderTotal[];

  const checks = {
    atLeastTwoProviderContexts: providerCount >= 2,
    sharedCashIsAgentScoped: sharedCashRows === agentCount,
    providerBalanceRowsMatchAgentProviderGrid: balanceRows === agentCount * providerCount,
    atLeastTwoTransactionProviders: distinctTransactionProviders >= 2,
    noDuplicateAgentProviderBalanceKeys: duplicateBalanceKeys === 0,
    noOrphanTransactionProviders: orphanTransactions === 0,
  };
  const passed = Object.values(checks).every(Boolean);

  console.log(
    JSON.stringify(
      {
        verification: "provider-separation",
        passed,
        counts: { providerCount, agentCount, sharedCashRows, balanceRows, distinctTransactionProviders },
        providerTotals,
        checks,
        interpretation: {
          sharedCash: "agents.physical_cash is one shared physical-cash value per agent",
          providerFloats: "agent_provider_balances.e_money_balance is keyed separately by agent_id and provider_id",
          transactionScope: "transactions retain provider_id and are foreign-keyed to providers",
          noLedgerMerge: "the verification compares independent columns and never sums physical cash into provider balances",
        },
      },
      null,
      2
    )
  );

  if (!passed) process.exitCode = 1;
}

verify();
