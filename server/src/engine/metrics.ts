import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { db, dataDir, getSimNow, migrate } from "../db/index.js";
import { computeAllAlertDrafts, computeBaselines } from "./detectors.js";
import { computeAgentLiquidity } from "./liquidityScorer.js";
import { assembleOverview } from "./overview.js";
import { evaluateHeldOutLiquidity, type HeldOutLiquidityMetrics } from "../simulation/providerValidation.js";
import { evaluateProviderInputGuards, type ProviderInputGuardMetrics } from "../simulation/providerInputValidation.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export interface MetricsReport {
  computedAt: string;
  dataset: {
    agents: number;
    transactions: number;
    demoDayTransactions: number;
    injectedAnomalies: number;
    scenarioAgents: number;
  };
  detection: {
    recall: number; // injected anomalies flagged / injected anomalies
    falsePositiveRate: number; // normal demo-day txs flagged / normal demo-day txs
    precision: number; // correctly flagged / all unusual_transaction alerts
    scenarioCoverage: number; // scenario agents with the expected alert type / scenario agents
    detected: number;
    missed: number;
    falsePositives: number;
  };
  providerForecast: HeldOutLiquidityMetrics;
  explainability: {
    alerts: number;
    fullyExplainedAlerts: number;
    coverage: number;
  };
  reliability: {
    providerInputGuards: ProviderInputGuardMetrics;
  };
  performance: {
    engineRunMsAvg: number; // full detection pass over the whole dataset
    engineThroughputTxPerSec: number;
    dashboardAssemblyP95Ms: number; // overview + agent list, the heaviest read path
    apiReadPathAvgMs: number;
    apiReadPathP95Ms: number;
  };
  thresholdSweep: Array<{
    zThreshold: number;
    recallOnVolumeAnomalies: number;
    falsePositives: number;
    falsePositiveRate: number;
  }>;
}

const EXPECTED_ALERT_FOR_SCENARIO: Record<string, string> = {
  liquidity_pressure: "liquidity_pressure",
  cross_provider_imbalance: "cross_provider_imbalance",
  stale_data: "data_quality",
  unusual_transaction: "unusual_transaction",
};

export function computeMetrics(): MetricsReport {
  const simNow = getSimNow();
  const dayStartIso = new Date(new Date(simNow).setHours(0, 0, 0, 0)).toISOString();

  const totalTx = (db.prepare("SELECT COUNT(*) AS n FROM transactions").get() as { n: number }).n;
  const agentCount = (db.prepare("SELECT COUNT(*) AS n FROM agents").get() as { n: number }).n;
  const demoDayTx = (db.prepare("SELECT COUNT(*) AS n FROM transactions WHERE timestamp >= ?").get(dayStartIso) as { n: number }).n;
  const injected = (db.prepare("SELECT COUNT(*) AS n FROM transactions WHERE is_synthetic_anomaly = 1").get() as { n: number }).n;

  const detected = (
    db
      .prepare(
        `SELECT COUNT(DISTINCT t.id) AS n FROM alerts a JOIN transactions t ON t.id = a.source_transaction_id WHERE t.is_synthetic_anomaly = 1`
      )
      .get() as { n: number }
  ).n;

  const falsePositives = (
    db
      .prepare(
        `SELECT COUNT(*) AS n FROM alerts a JOIN transactions t ON t.id = a.source_transaction_id WHERE t.is_synthetic_anomaly = 0`
      )
      .get() as { n: number }
  ).n;

  const unusualAlerts = (db.prepare(`SELECT COUNT(*) AS n FROM alerts WHERE type = 'unusual_transaction'`).get() as { n: number }).n;

  // Check what was actually persisted. An alert is only "explained" when a
  // reviewer gets a reason, structured evidence, uncertainty, confidence, and
  // a next step in all three supported languages.
  const evidenceRows = db.prepare(`SELECT evidence_json, confidence FROM alerts`).all() as unknown as Array<{ evidence_json: string; confidence: number }>;
  const fullyExplainedAlerts = evidenceRows.filter((row) => {
    try {
      const evidence = JSON.parse(row.evidence_json) as {
        signals?: Record<string, unknown>;
        unconfirmed?: unknown;
        explanation?: Record<string, unknown>;
        suggestedAction?: Record<string, unknown>;
      };
      const localized = (text: Record<string, unknown> | undefined) =>
        Boolean(text && ["en", "bn", "banglish"].every((key) => typeof text[key] === "string" && String(text[key]).trim().length > 0));
      return (
        Object.keys(evidence.signals ?? {}).length > 0 &&
        typeof evidence.unconfirmed === "boolean" &&
        localized(evidence.explanation) &&
        localized(evidence.suggestedAction) &&
        Number.isFinite(row.confidence) &&
        row.confidence >= 0 &&
        row.confidence <= 1
      );
    } catch {
      return false;
    }
  }).length;

  const scenarioAgents = db
    .prepare(`SELECT id, scenario_tag FROM agents WHERE scenario_tag != 'normal'`)
    .all() as unknown as Array<{ id: string; scenario_tag: string }>;

  let covered = 0;
  const coverageCheck = db.prepare(`SELECT COUNT(*) AS n FROM alerts WHERE agent_id = ? AND type = ?`);
  for (const a of scenarioAgents) {
    const expected = EXPECTED_ALERT_FOR_SCENARIO[a.scenario_tag];
    const n = (coverageCheck.get(a.id, expected) as { n: number }).n;
    if (n > 0) covered += 1;
  }

  // Engine runtime: time full detection passes over the complete dataset.
  const ENGINE_RUNS = 5;
  const engineTimes: number[] = [];
  for (let i = 0; i < ENGINE_RUNS; i++) {
    const t0 = performance.now();
    computeAllAlertDrafts();
    engineTimes.push(performance.now() - t0);
  }
  const engineAvg = engineTimes.reduce((a, b) => a + b, 0) / ENGINE_RUNS;

  // Dashboard assembly p95: the heaviest read path a user hits (management overview + full agent list).
  const ASSEMBLY_RUNS = 100;
  const assemblyTimes: number[] = [];
  for (let i = 0; i < ASSEMBLY_RUNS; i++) {
    const t0 = performance.now();
    assembleOverview();
    computeAgentLiquidity();
    assemblyTimes.push(performance.now() - t0);
  }
  assemblyTimes.sort((a, b) => a - b);
  const p95 = assemblyTimes[Math.floor(ASSEMBLY_RUNS * 0.95) - 1];
  const apiReadAvg = assemblyTimes.reduce((sum, value) => sum + value, 0) / ASSEMBLY_RUNS;
  const providerForecast = evaluateHeldOutLiquidity();
  const providerInputGuards = evaluateProviderInputGuards();

  // Threshold sensitivity: how the z-score detector trades recall for false
  // positives. Odd-hour anomalies are excluded (they use a different signal).
  const baselines = computeBaselines(dayStartIso);
  const todayTxRows = db
    .prepare(`SELECT id, agent_id, amount, is_synthetic_anomaly, anomaly_kind FROM transactions WHERE timestamp >= ?`)
    .all(dayStartIso) as unknown as Array<{
    id: string;
    agent_id: string;
    amount: number;
    is_synthetic_anomaly: number;
    anomaly_kind: string | null;
  }>;
  const volumeAnomalies = todayTxRows.filter((t) => t.is_synthetic_anomaly === 1 && t.anomaly_kind !== "odd_hour");
  const normalToday = todayTxRows.filter((t) => t.is_synthetic_anomaly === 0);
  const zOf = (t: { agent_id: string; amount: number }) => {
    const b = baselines.get(t.agent_id);
    return b ? (t.amount - b.mean) / b.std : 0;
  };
  const thresholdSweep = [2, 2.5, 3, 3.5].map((zThreshold) => {
    const caught = volumeAnomalies.filter((t) => zOf(t) >= zThreshold).length;
    const fps = normalToday.filter((t) => zOf(t) >= zThreshold).length;
    return {
      zThreshold,
      recallOnVolumeAnomalies: volumeAnomalies.length === 0 ? 1 : Number((caught / volumeAnomalies.length).toFixed(4)),
      falsePositives: fps,
      falsePositiveRate: normalToday.length === 0 ? 0 : Number((fps / normalToday.length).toFixed(4)),
    };
  });

  const normalDemoDayTx = demoDayTx - injected;
  return {
    computedAt: new Date().toISOString(),
    dataset: {
      agents: agentCount,
      transactions: totalTx,
      demoDayTransactions: demoDayTx,
      injectedAnomalies: injected,
      scenarioAgents: scenarioAgents.length,
    },
    detection: {
      recall: injected === 0 ? 1 : Number((detected / injected).toFixed(4)),
      falsePositiveRate: normalDemoDayTx === 0 ? 0 : Number((falsePositives / normalDemoDayTx).toFixed(4)),
      precision: unusualAlerts === 0 ? 1 : Number((detected / unusualAlerts).toFixed(4)),
      scenarioCoverage: scenarioAgents.length === 0 ? 1 : Number((covered / scenarioAgents.length).toFixed(4)),
      detected,
      missed: injected - detected,
      falsePositives,
    },
    providerForecast,
    explainability: {
      alerts: evidenceRows.length,
      fullyExplainedAlerts,
      coverage: evidenceRows.length === 0 ? 1 : Number((fullyExplainedAlerts / evidenceRows.length).toFixed(4)),
    },
    reliability: { providerInputGuards },
    performance: {
      engineRunMsAvg: Number(engineAvg.toFixed(1)),
      engineThroughputTxPerSec: Math.round(totalTx / (engineAvg / 1000)),
      dashboardAssemblyP95Ms: Number(p95.toFixed(1)),
      apiReadPathAvgMs: Number(apiReadAvg.toFixed(1)),
      apiReadPathP95Ms: Number(p95.toFixed(1)),
    },
    thresholdSweep,
  };
}

function pct(v: number) {
  return `${(v * 100).toFixed(1)}%`;
}

export function renderValidationEvidence(m: MetricsReport): string {
  return `# Validation Evidence — CashLens

Generated by \`npm run metrics\` on ${m.computedAt}. Reproducible: the dataset is
seeded with a fixed PRNG seed (42), so these numbers are stable across machines.

## Method

The seed script injects **labeled** anomalies (\`is_synthetic_anomaly\`, \`anomaly_kind\`)
and engineered agent scenarios (\`scenario_tag\`) into an otherwise-normal synthetic
dataset. The detection engine never reads those labels — they are used only here,
to score its output after the fact. The demo-day "afternoon rush" is deliberately
generated within ~2.5σ of each agent's baseline, so the engine is also being tested
on *not* flagging ordinary operational demand spikes (challenge objective 5).

## Dataset

| | |
|---|---|
| Agents | ${m.dataset.agents} (${m.dataset.scenarioAgents} with engineered scenarios) |
| Transactions (14 days) | ${m.dataset.transactions} |
| Demo-day transactions | ${m.dataset.demoDayTransactions} |
| Injected labeled anomalies | ${m.dataset.injectedAnomalies} |

## Detection quality

| Metric | Value | Detail |
|---|---|---|
| Recall on injected anomalies | **${pct(m.detection.recall)}** | ${m.detection.detected} of ${m.dataset.injectedAnomalies} flagged, ${m.detection.missed} missed |
| False positive rate | **${pct(m.detection.falsePositiveRate)}** | ${m.detection.falsePositives} normal demo-day transactions incorrectly flagged |
| Precision of unusual-transaction alerts | **${pct(m.detection.precision)}** | flagged transactions that were true injected anomalies |
| Scenario coverage | **${pct(m.detection.scenarioCoverage)}** | scenario agents that produced their expected alert type |

Recall is deliberately **not** 100%: each scenario agent's injected mix includes one
*subtle* anomaly (~2.2σ) designed to sit below the 3σ detection threshold. The sweep
below shows exactly what catching it would cost in false positives — that trade-off,
not a perfect score, is the analytically honest result.

## Z-score threshold sensitivity

| Threshold | Recall (volume anomalies) | False positives | FP rate |
|---|---|---|---|
${m.thresholdSweep
  .map(
    (s) =>
      `| ${s.zThreshold.toFixed(1)}σ | ${pct(s.recallOnVolumeAnomalies)} | ${s.falsePositives} | ${pct(s.falsePositiveRate)} |`
  )
  .join("\n")}

The production threshold (3σ) is chosen to keep false positives near zero: every
false alert an ops team reviews costs trust in the queue. The subtle anomalies are
recoverable at 2σ, but only at the false-positive cost shown above.

## Held-out liquidity forecast and early-warning validation

The following scenarios are separate, post-snapshot simulated outcomes. The
liquidity scorer receives only observed demand and capacity at the snapshot;
the actual next-four-hour demand is read only here by the validation harness.

| Metric | Value | Detail |
|---|---:|---|
| Held-out scenarios | **${m.providerForecast.scenarioCount}** | ${m.providerForecast.providerScenarioCount} provider-float + ${m.providerForecast.sharedCashScenarioCount} shared-cash |
| Provider/shared-demand MAE | **৳${m.providerForecast.demandMaeTaka.toLocaleString("en-US")}** | mean absolute four-hour demand-forecast error |
| Demand MAPE | **${pct(m.providerForecast.demandMape)}** | mean absolute percentage error on held-out demand |
| Capacity classification accuracy | **${pct(m.providerForecast.capacityClassificationAccuracy)}** | whether projected demand correctly classified a shortage versus adequate capacity |
| Shortages detected early | **${m.providerForecast.detectedShortages}/${m.providerForecast.actualShortageScenarios}** | ${m.providerForecast.missedShortages} held-out shortages missed |
| Average warning lead | **${m.providerForecast.averageLeadMinutes} min** | time from the snapshot alert to simulated exhaustion |
| Minimum warning lead | **${m.providerForecast.minimumLeadMinutes} min** | shortest detected advance warning |

This evaluates whether a provider float or the shared drawer will be
insufficient within the next four hours without leaking future outcomes into
the live scoring path.

## Explanation coverage

| Metric | Value | Detail |
|---|---:|---|
| Fully explained alerts | **${pct(m.explainability.coverage)}** | ${m.explainability.fullyExplainedAlerts} of ${m.explainability.alerts} include a reason, structured signals, explicit uncertainty, confidence, and a suggested next step in EN / বাংলা / Banglish |

## Provider-input reliability guard

| Metric | Value | Detail |
|---|---:|---|
| Guard scenario coverage | **${pct(m.reliability.providerInputGuards.coverage)}** | ${m.reliability.providerInputGuards.passed}/${m.reliability.providerInputGuards.scenarios} deterministic input-quality cases passed |
| Delayed / missing / inconsistent handling | **${m.reliability.providerInputGuards.delayedHandled && m.reliability.providerInputGuards.missingHandled && m.reliability.providerInputGuards.inconsistentHandled ? "covered" : "incomplete"}** | delayed data is unconfirmed; missing or inconsistent input is unavailable rather than interpreted as zero |

## System performance

| Metric | Value | Detail |
|---|---|---|
| Full detection pass (avg of 5) | **${m.performance.engineRunMsAvg} ms** | entire 14-day dataset, all four detectors |
| Engine throughput | **${m.performance.engineThroughputTxPerSec.toLocaleString("en-US")} tx/sec** | transactions scanned per second |
| Dashboard assembly p95 | **${m.performance.dashboardAssemblyP95Ms} ms** | management overview + full agent list, 100 runs |
| API read-path avg / p95 | **${m.performance.apiReadPathAvgMs} / ${m.performance.apiReadPathP95Ms} ms** | in-process overview + liquidity handler equivalent, 100 runs (network transit excluded) |

## Limitations (stated honestly)

- Metrics are computed against **synthetic** anomalies whose shapes the team designed;
  real-world fraud and liquidity stress are more varied. The numbers demonstrate the
  pipeline is measurable, not that it is production-accurate.
- The anomaly sample is small by design (a readable demo dataset). The same harness
  scales to larger seeds by changing two constants in \`seed.ts\`.
- Time-of-day and z-score detectors assume an agent's own history is a fair baseline;
  a new agent with <10 historical transactions is exempted rather than guessed at.
`;
}

// CLI entry: npm run metrics
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  migrate();
  const report = computeMetrics();
  fs.writeFileSync(path.join(dataDir, "metrics.json"), JSON.stringify(report, null, 2));
  const docsDir = path.join(__dirname, "..", "..", "..", "docs");
  fs.mkdirSync(docsDir, { recursive: true });
  fs.writeFileSync(path.join(docsDir, "validation-evidence.md"), renderValidationEvidence(report));
  console.log(JSON.stringify(report, null, 2));
  console.log("\nWrote server/data/metrics.json and docs/validation-evidence.md");
}
