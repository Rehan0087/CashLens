/**
 * A small, held-out set of post-snapshot outcomes used only by the metrics
 * harness. These records are never read by the liquidity scorer or exposed to
 * users, so the forecast is evaluated against outcomes it did not see.
 */
export interface HeldOutLiquidityScenario {
  id: string;
  scope: "provider_float" | "shared_cash";
  provider?: "bKash" | "Nagad" | "Rocket";
  /** Demand seen by the scorer before the frozen snapshot. */
  observedDemand: number;
  observedHours: number;
  capacity: number;
  /** Ground-truth demand that happens after the snapshot. */
  actualNextFourHourDemand: number;
}

// Deliberately kept separate from seed.ts. This is an evaluation split, not a
// second set of hand-tuned detector labels.
export const HELD_OUT_LIQUIDITY_SCENARIOS: HeldOutLiquidityScenario[] = [
  { id: "provider-bkash-peak", scope: "provider_float", provider: "bKash", observedDemand: 5_400, observedHours: 4, capacity: 5_600, actualNextFourHourDemand: 7_200 },
  { id: "provider-nagad-queue", scope: "provider_float", provider: "Nagad", observedDemand: 4_500, observedHours: 4, capacity: 4_200, actualNextFourHourDemand: 5_800 },
  { id: "provider-rocket-normal", scope: "provider_float", provider: "Rocket", observedDemand: 2_500, observedHours: 4, capacity: 8_000, actualNextFourHourDemand: 2_800 },
  { id: "provider-bkash-eid", scope: "provider_float", provider: "bKash", observedDemand: 7_200, observedHours: 4, capacity: 7_300, actualNextFourHourDemand: 9_500 },
  { id: "provider-nagad-salary", scope: "provider_float", provider: "Nagad", observedDemand: 3_900, observedHours: 4, capacity: 6_200, actualNextFourHourDemand: 4_900 },
  { id: "provider-rocket-topup", scope: "provider_float", provider: "Rocket", observedDemand: 6_100, observedHours: 4, capacity: 6_800, actualNextFourHourDemand: 7_100 },
  { id: "cash-mirpur-peak", scope: "shared_cash", observedDemand: 13_000, observedHours: 4, capacity: 11_300, actualNextFourHourDemand: 15_800 },
  { id: "cash-uttara-normal", scope: "shared_cash", observedDemand: 7_600, observedHours: 4, capacity: 17_000, actualNextFourHourDemand: 8_200 },
  { id: "cash-dhanmondi-eid", scope: "shared_cash", observedDemand: 11_100, observedHours: 4, capacity: 10_500, actualNextFourHourDemand: 13_600 },
  { id: "cash-gulshan-salary", scope: "shared_cash", observedDemand: 8_500, observedHours: 4, capacity: 10_900, actualNextFourHourDemand: 9_700 },
  { id: "cash-savar-peak", scope: "shared_cash", observedDemand: 9_800, observedHours: 4, capacity: 8_200, actualNextFourHourDemand: 11_500 },
  { id: "cash-mohammadpur-normal", scope: "shared_cash", observedDemand: 5_800, observedHours: 4, capacity: 12_000, actualNextFourHourDemand: 6_300 },
];

export interface HeldOutLiquidityMetrics {
  scenarioCount: number;
  providerScenarioCount: number;
  sharedCashScenarioCount: number;
  demandMaeTaka: number;
  demandMape: number;
  capacityClassificationAccuracy: number;
  actualShortageScenarios: number;
  detectedShortages: number;
  missedShortages: number;
  averageLeadMinutes: number;
  minimumLeadMinutes: number;
}

const HORIZON_MINUTES = 4 * 60;
const PEAK_FACTOR = 1.25;

function forecastNextFourHours(s: HeldOutLiquidityScenario) {
  // Held-out fixtures hold aggregate observed demand, so reconstruct evenly
  // sized 30-minute observations before evaluating the same EWRH projection
  // used by the live scorer. Future demand remains completely held out.
  const windowCount = Math.max(1, Math.round(s.observedHours * 2));
  const observedWindows = Array.from({ length: windowCount }, () => s.observedDemand / windowCount);
  return forecastEwrhDemand(observedWindows, 4, PEAK_FACTOR);
}

function actualShortageMinute(s: HeldOutLiquidityScenario): number | null {
  if (s.actualNextFourHourDemand <= s.capacity) return null;
  return (s.capacity / s.actualNextFourHourDemand) * HORIZON_MINUTES;
}

/** Evaluate the fixed held-out outcomes without feeding them back into scoring. */
export function evaluateHeldOutLiquidity(): HeldOutLiquidityMetrics {
  const absoluteErrors: number[] = [];
  const percentageErrors: number[] = [];
  const classification: boolean[] = [];
  const leads: number[] = [];
  let actualShortages = 0;
  let detectedShortages = 0;

  for (const scenario of HELD_OUT_LIQUIDITY_SCENARIOS) {
    const forecast = forecastNextFourHours(scenario);
    const actual = scenario.actualNextFourHourDemand;
    absoluteErrors.push(Math.abs(forecast - actual));
    percentageErrors.push(Math.abs(forecast - actual) / actual);

    const forecastShortage = forecast > scenario.capacity;
    const actualShortage = actual > scenario.capacity;
    classification.push(forecastShortage === actualShortage);
    if (actualShortage) {
      actualShortages += 1;
      if (forecastShortage) {
        detectedShortages += 1;
        // The alert is emitted at the snapshot; the remaining ground-truth
        // minutes until exhaustion is the warning lead available to an operator.
        const lead = actualShortageMinute(scenario);
        if (lead !== null) leads.push(lead);
      }
    }
  }

  const average = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / Math.max(values.length, 1);
  return {
    scenarioCount: HELD_OUT_LIQUIDITY_SCENARIOS.length,
    providerScenarioCount: HELD_OUT_LIQUIDITY_SCENARIOS.filter((s) => s.scope === "provider_float").length,
    sharedCashScenarioCount: HELD_OUT_LIQUIDITY_SCENARIOS.filter((s) => s.scope === "shared_cash").length,
    demandMaeTaka: Math.round(average(absoluteErrors)),
    demandMape: Number(average(percentageErrors).toFixed(4)),
    capacityClassificationAccuracy: Number(average(classification.map((ok) => (ok ? 1 : 0))).toFixed(4)),
    actualShortageScenarios: actualShortages,
    detectedShortages,
    missedShortages: actualShortages - detectedShortages,
    averageLeadMinutes: Math.round(average(leads)),
    minimumLeadMinutes: Math.round(Math.min(...leads)),
  };
}
import { forecastEwrhDemand } from "../engine/liquidityScorer.js";
