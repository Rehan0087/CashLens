-- CashLens Phase 1 / Step 1 verification report.
-- Run on Ubuntu with:
--   sqlite3 server/data/cashlens.sqlite3 < server/scripts/verify_provider_separation.sql
-- This script is read-only and contains no customer or credential data.

.headers on
.mode column

SELECT 'provider_context_count' AS assertion,
       CASE WHEN COUNT(*) >= 2 THEN 'PASS' ELSE 'FAIL' END AS result,
       COUNT(*) AS observed
FROM providers;

SELECT 'distinct_provider_contexts' AS assertion,
       GROUP_CONCAT(id, ', ') AS provider_ids
FROM providers;

SELECT 'shared_cash_rows' AS assertion,
       CASE WHEN COUNT(*) = (SELECT COUNT(*) FROM agents) THEN 'PASS' ELSE 'FAIL' END AS result,
       COUNT(*) AS observed,
       (SELECT COUNT(*) FROM agents) AS expected
FROM agents;

SELECT 'provider_balance_rows' AS assertion,
       CASE WHEN COUNT(*) = (SELECT COUNT(*) FROM agents) * (SELECT COUNT(*) FROM providers)
            THEN 'PASS' ELSE 'FAIL' END AS result,
       COUNT(*) AS observed,
       (SELECT COUNT(*) FROM agents) * (SELECT COUNT(*) FROM providers) AS expected
FROM agent_provider_balances;

SELECT 'provider_totals_are_distinct' AS assertion,
       p.id AS provider_id,
       p.name AS provider_name,
       COUNT(b.agent_id) AS agent_balance_rows,
       ROUND(COALESCE(SUM(b.e_money_balance), 0), 2) AS provider_e_money_total
FROM providers p
LEFT JOIN agent_provider_balances b ON b.provider_id = p.id
GROUP BY p.id, p.name
ORDER BY p.id;

SELECT 'shared_cash_and_provider_float_example' AS evidence,
       a.id AS agent_id,
       ROUND(a.physical_cash, 2) AS shared_physical_cash,
       b.provider_id,
       ROUND(b.e_money_balance, 2) AS provider_specific_e_money
FROM agents a
JOIN agent_provider_balances b ON b.agent_id = a.id
ORDER BY a.id, b.provider_id
LIMIT 9;

SELECT 'provider_balance_duplicate_keys' AS assertion,
       CASE WHEN COUNT(*) = 0 THEN 'PASS' ELSE 'FAIL' END AS result,
       COUNT(*) AS duplicate_groups
FROM (
  SELECT agent_id, provider_id
  FROM agent_provider_balances
  GROUP BY agent_id, provider_id
  HAVING COUNT(*) > 1
);

SELECT 'transaction_provider_orphans' AS assertion,
       CASE WHEN COUNT(*) = 0 THEN 'PASS' ELSE 'FAIL' END AS result,
       COUNT(*) AS orphan_rows
FROM transactions t
LEFT JOIN providers p ON p.id = t.provider_id
WHERE p.id IS NULL;

SELECT 'cross_provider_transaction_contexts' AS assertion,
       CASE WHEN COUNT(*) >= 2 THEN 'PASS' ELSE 'FAIL' END AS result,
       COUNT(DISTINCT provider_id) AS observed
FROM transactions;

