import { randInt } from "./rng.js";
import type { SimAgent, SimTransaction } from "./syntheticDataGenerator.js";

// Mutates demo-day transactions of "unusual_transaction" agents so the dataset
// carries ground-truth labels (is_synthetic_anomaly + anomaly_kind) that the
// detection engine is scored against in metrics.ts. Labels are never shown in the UI.
export function injectTransactionAnomalies(
  rand: () => number,
  agents: SimAgent[],
  transactions: SimTransaction[],
  simNow: Date
): void {
  const demoDay = simNow.toISOString().slice(0, 10);
  const byAgent = new Map<string, SimTransaction[]>();
  for (const tx of transactions) {
    if (!tx.timestamp.startsWith(demoDay)) continue;
    if (!byAgent.has(tx.agentId)) byAgent.set(tx.agentId, []);
    byAgent.get(tx.agentId)!.push(tx);
  }

  for (const agent of agents) {
    const todays = byAgent.get(agent.id) ?? [];
    if (todays.length === 0) continue;

    if (agent.scenarioTag === "unusual_transaction") {
      // Each unusual-transaction agent gets a fixed mix: two blatant volume spikes
      // (5–8σ), one odd-hour transaction, and one deliberately SUBTLE spike
      // (~2.1–2.4σ) that sits below the 3σ detection threshold. The subtle one is
      // supposed to be missed — it makes the recall metric honest and demonstrates
      // the threshold trade-off instead of a gamed 100%.
      const plan: Array<"volume_spike" | "volume_spike2" | "odd_hour" | "subtle_volume"> = [
        "volume_spike",
        "volume_spike2",
        "odd_hour",
        "subtle_volume",
      ];
      const injectCount = Math.min(todays.length, plan.length);
      for (let i = 0; i < injectCount; i++) {
        const tx = todays[i];
        const kind = plan[i];
        if (kind === "volume_spike" || kind === "volume_spike2") {
          tx.amount = Math.round(agent.baselineMean + agent.baselineStddev * (5 + rand() * 3));
          tx.anomalyKind = "volume_spike";
        } else if (kind === "subtle_volume") {
          tx.amount = Math.round(agent.baselineMean + agent.baselineStddev * (2.1 + rand() * 0.3));
          tx.anomalyKind = "subtle_volume";
        } else {
          const oddHourTime = new Date(tx.timestamp);
          oddHourTime.setHours(randInt(rand, 1, 4), randInt(rand, 0, 59), 0, 0);
          tx.timestamp = oddHourTime.toISOString();
          tx.anomalyKind = "odd_hour";
        }
        tx.isSyntheticAnomaly = true;
      }
    } else if (agent.scenarioTag === "liquidity_pressure") {
      // Demonstration Scenario B needs ONE agent whose physical cash is falling
      // quickly AND that shows a sudden unusual transaction. Liquidity-pressure
      // agents already carry low cash, so a single blatant spike here creates that
      // combined picture on one agent (still a labeled ground-truth anomaly).
      const tx = todays[0];
      tx.amount = Math.round(agent.baselineMean + agent.baselineStddev * (5.5 + rand() * 2));
      tx.anomalyKind = "volume_spike";
      tx.isSyntheticAnomaly = true;
    }
  }
}
