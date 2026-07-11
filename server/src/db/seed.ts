import { db, migrate, inTransaction, setMeta } from "./index.js";
import { mulberry32 } from "../simulation/rng.js";
import { computeSimNow } from "../simulation/simClock.js";
import { PROVIDERS, generateAgents, generateBalances, generateTransactions } from "../simulation/syntheticDataGenerator.js";
import { injectTransactionAnomalies } from "../simulation/anomalyInjector.js";
import { runDetection } from "../engine/runDetection.js";
import { ensureDemoUsers } from "../auth.js";

const SEED = 42; // fixed seed -> reproducible demo data for judges
const AGENT_COUNT = 36;
const HISTORY_DAYS = 14;

function seed() {
  migrate();

  const rand = mulberry32(SEED);
  const simNow = computeSimNow();

  const agents = generateAgents(rand, AGENT_COUNT);
  const balances = generateBalances(rand, agents, simNow);
  const transactions = generateTransactions(rand, agents, simNow, HISTORY_DAYS);
  injectTransactionAnomalies(rand, agents, transactions, simNow);

  inTransaction(() => {
    db.exec(
      "DELETE FROM sessions; DELETE FROM users; DELETE FROM case_notes; DELETE FROM alerts; DELETE FROM transactions; DELETE FROM agent_provider_balances; DELETE FROM agents; DELETE FROM providers;"
    );

    const insertProvider = db.prepare("INSERT INTO providers (id, name) VALUES (?, ?)");
    const insertAgent = db.prepare("INSERT INTO agents (id, name, area, physical_cash, scenario_tag) VALUES (?, ?, ?, ?, ?)");
    const insertBalance = db.prepare(
      "INSERT INTO agent_provider_balances (agent_id, provider_id, e_money_balance, last_synced_at) VALUES (?, ?, ?, ?)"
    );
    const insertTx = db.prepare(
      "INSERT INTO transactions (id, agent_id, provider_id, type, amount, timestamp, is_synthetic_anomaly, anomaly_kind) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    );

    for (const p of PROVIDERS) insertProvider.run(p.id, p.name);
    for (const a of agents) insertAgent.run(a.id, a.name, a.area, a.physicalCash, a.scenarioTag);
    for (const b of balances) insertBalance.run(b.agentId, b.providerId, b.eMoneyBalance, b.lastSyncedAt);
    for (const tx of transactions) {
      insertTx.run(tx.id, tx.agentId, tx.providerId, tx.type, tx.amount, tx.timestamp, tx.isSyntheticAnomaly ? 1 : 0, tx.anomalyKind);
    }
  });

  ensureDemoUsers();

  setMeta("sim_now", simNow.toISOString());
  setMeta("seeded_at", new Date().toISOString());

  const alertCount = runDetection();

  const scenarioCounts = agents.reduce<Record<string, number>>((acc, a) => {
    acc[a.scenarioTag] = (acc[a.scenarioTag] ?? 0) + 1;
    return acc;
  }, {});

  console.log(`Seeded ${agents.length} agents, ${balances.length} balances, ${transactions.length} transactions.`);
  console.log("Scenario tags:", scenarioCounts);
  console.log(`Injected labeled transaction anomalies: ${transactions.filter((t) => t.isSyntheticAnomaly).length}`);
  console.log(`Detection pass produced ${alertCount} alerts.`);
  console.log(`Simulated clock: ${simNow.toISOString()}`);
}

seed();
