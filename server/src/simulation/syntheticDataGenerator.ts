import { randRange, randInt, choice, randNormal } from "./rng.js";
import { OPEN_HOUR, SIM_HOUR } from "./simClock.js";

export const PROVIDERS = [
  { id: "bkash", name: "bKash" },
  { id: "nagad", name: "Nagad" },
  { id: "rocket", name: "Rocket" },
];

const AREAS = ["Mirpur", "Uttara", "Dhanmondi", "Gulshan", "Mohammadpur", "Savar"];
const FIRST_NAMES = ["Karim", "Rahim", "Jamal", "Salma", "Nasrin", "Habib", "Rina", "Faruk", "Mizan", "Shahid", "Lima", "Anwar", "Beauty", "Rafiq", "Sultana"];

export type ScenarioTag = "normal" | "liquidity_pressure" | "cross_provider_imbalance" | "stale_data" | "unusual_transaction";

export interface SimAgent {
  id: string;
  name: string;
  area: string;
  physicalCash: number;
  scenarioTag: ScenarioTag;
  baselineMean: number;
  baselineStddev: number;
}

export interface SimBalance {
  agentId: string;
  providerId: string;
  eMoneyBalance: number;
  lastSyncedAt: string;
}

export interface SimTransaction {
  id: string;
  agentId: string;
  providerId: string;
  type: "cash_in" | "cash_out";
  amount: number;
  timestamp: string;
  isSyntheticAnomaly: boolean;
  anomalyKind: string | null;
}

const SCENARIO_TAGS: Exclude<ScenarioTag, "normal">[] = [
  "liquidity_pressure",
  "cross_provider_imbalance",
  "stale_data",
  "unusual_transaction",
];

export function generateAgents(rand: () => number, count: number): SimAgent[] {
  const agents: SimAgent[] = [];
  for (let i = 0; i < count; i++) {
    // Every 4th agent gets an engineered scenario so the dataset carries labeled
    // ground truth the detection engine can be scored against; the rest are normal.
    const scenarioTag: ScenarioTag = i > 0 && i % 4 === 0 ? SCENARIO_TAGS[(i / 4 - 1) % SCENARIO_TAGS.length] : "normal";
    const name = `${choice(rand, FIRST_NAMES)} ${String.fromCharCode(65 + (i % 26))}.`;
    agents.push({
      id: `agent-${i + 1}`,
      name,
      area: choice(rand, AREAS),
      physicalCash: Math.round(scenarioTag === "liquidity_pressure" ? randRange(rand, 1500, 4000) : randRange(rand, 15000, 60000)),
      scenarioTag,
      baselineMean: randRange(rand, 800, 2500),
      baselineStddev: randRange(rand, 150, 500),
    });
  }
  return agents;
}

export function generateBalances(rand: () => number, agents: SimAgent[], simNow: Date): SimBalance[] {
  const balances: SimBalance[] = [];
  for (const agent of agents) {
    for (const provider of PROVIDERS) {
      let staleMinutes = randRange(rand, 1, 20);
      let lastSyncedAt: string | null = null;
      if (agent.scenarioTag === "stale_data") {
        // Scenario C carries BOTH kinds of degraded input on one agent: the first
        // provider feed is hours behind (stale), the second reports a sync time in
        // the future (inconsistent / conflicting). Both must be surfaced and
        // confidence-reduced — never silently treated as a valid or zero balance.
        if (provider.id === PROVIDERS[0].id) {
          staleMinutes = randRange(rand, 180, 600); // several hours behind
        } else if (provider.id === PROVIDERS[1].id) {
          lastSyncedAt = new Date(simNow.getTime() + randRange(rand, 45, 90) * 60_000).toISOString();
        }
      }
      let balance = randRange(rand, 5000, 40000);
      if (agent.scenarioTag === "cross_provider_imbalance") {
        // E-money piled up on one provider while another float is starved.
        balance = provider.id === "bkash" ? randRange(rand, 60000, 90000) : randRange(rand, 500, 2000);
      }
      balances.push({
        agentId: agent.id,
        providerId: provider.id,
        eMoneyBalance: Math.round(balance),
        lastSyncedAt: lastSyncedAt ?? new Date(simNow.getTime() - staleMinutes * 60_000).toISOString(),
      });
    }
  }
  return balances;
}

let txCounter = 0;
function nextTxId() {
  txCounter += 1;
  return `tx-${txCounter}`;
}

export function generateTransactions(
  rand: () => number,
  agents: SimAgent[],
  simNow: Date,
  days: number
): SimTransaction[] {
  const transactions: SimTransaction[] = [];

  for (const agent of agents) {
    for (let d = days - 1; d >= 0; d--) {
      const dayStart = new Date(simNow.getTime() - d * 24 * 60 * 60_000);
      const isDemoDay = d === 0; // "today" — everything after runs up to the 16:00 sim clock
      const txCount = randInt(rand, 4, 10);

      for (let t = 0; t < txCount; t++) {
        const hour = Math.round(randNormal(rand, isDemoDay ? 12 : 14, isDemoDay ? 2 : 3));
        const clampedHour = Math.min(isDemoDay ? SIM_HOUR - 1 : 20, Math.max(OPEN_HOUR, hour));
        const timestamp = new Date(dayStart);
        timestamp.setHours(clampedHour, randInt(rand, 0, 59), 0, 0);

        const provider = choice(rand, PROVIDERS);
        const type = rand() > 0.5 ? "cash_in" : "cash_out";
        const amount = Math.max(50, randNormal(rand, agent.baselineMean, agent.baselineStddev));

        transactions.push({
          id: nextTxId(),
          agentId: agent.id,
          providerId: provider.id,
          type,
          amount: Math.round(amount),
          timestamp: timestamp.toISOString(),
          isSyntheticAnomaly: false,
          anomalyKind: null,
        });
      }

      // Demo-day afternoon rush: larger-than-usual but statistically ordinary
      // (kept within ~2.5σ so it must NOT trip the anomaly detector — it is
      // operational demand, not unusual behavior; that distinction is objective #5).
      if (isDemoDay) {
        const extra = randInt(rand, 2, 5);
        for (let t = 0; t < extra; t++) {
          const timestamp = new Date(dayStart);
          timestamp.setHours(randInt(rand, 13, SIM_HOUR - 1), randInt(rand, 0, 59), 0, 0);
          const provider = choice(rand, PROVIDERS);
          const amount = randNormal(rand, agent.baselineMean + 1.5 * agent.baselineStddev, 0.4 * agent.baselineStddev);
          transactions.push({
            id: nextTxId(),
            agentId: agent.id,
            providerId: provider.id,
            type: "cash_out",
            amount: Math.round(Math.max(50, amount)),
            timestamp: timestamp.toISOString(),
            isSyntheticAnomaly: false,
            anomalyKind: null,
          });
        }
      }
    }
  }

  return transactions;
}
