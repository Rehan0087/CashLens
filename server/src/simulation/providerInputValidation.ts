import { assessProviderInput } from "../engine/liquidityScorer.js";
import type { ProviderDataState } from "../types.js";

interface ProviderInputScenario {
  id: string;
  balance: number | null;
  lastSyncedAt: string | null;
  expected: ProviderDataState;
}

const NOW = new Date("2026-07-11T10:00:00.000Z");

// These are deliberately failure-mode cases, separate from the live seed. They
// prove the guard's safe fallback for delayed, absent, and invalid input without
// corrupting the readable demo dataset.
const SCENARIOS: ProviderInputScenario[] = [
  { id: "fresh", balance: 12_000, lastSyncedAt: "2026-07-11T09:45:00.000Z", expected: "fresh" },
  { id: "delayed", balance: 12_000, lastSyncedAt: "2026-07-11T07:00:00.000Z", expected: "stale" },
  { id: "missing", balance: null, lastSyncedAt: null, expected: "missing" },
  { id: "negative_balance", balance: -25, lastSyncedAt: "2026-07-11T09:55:00.000Z", expected: "inconsistent" },
  { id: "future_timestamp", balance: 12_000, lastSyncedAt: "2026-07-11T11:00:00.000Z", expected: "inconsistent" },
  { id: "malformed_timestamp", balance: 12_000, lastSyncedAt: "not-a-date", expected: "inconsistent" },
];

export interface ProviderInputGuardMetrics {
  scenarios: number;
  passed: number;
  coverage: number;
  delayedHandled: boolean;
  missingHandled: boolean;
  inconsistentHandled: boolean;
}

export function evaluateProviderInputGuards(): ProviderInputGuardMetrics {
  let passed = 0;
  const seen = new Set<ProviderDataState>();
  for (const scenario of SCENARIOS) {
    const result = assessProviderInput(scenario.balance, scenario.lastSyncedAt, NOW);
    if (result.dataState === scenario.expected) passed += 1;
    if (result.dataState === scenario.expected) seen.add(scenario.expected);
  }
  return {
    scenarios: SCENARIOS.length,
    passed,
    coverage: Number((passed / SCENARIOS.length).toFixed(4)),
    delayedHandled: seen.has("stale"),
    missingHandled: seen.has("missing"),
    inconsistentHandled: seen.has("inconsistent"),
  };
}
