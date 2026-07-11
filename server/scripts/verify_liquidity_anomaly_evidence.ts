import { db, migrate } from "../src/db/index.js";
import { computeAgentLiquidity } from "../src/engine/liquidityScorer.js";
import { computeAllAlertDrafts } from "../src/engine/detectors.js";
import type { AlertEvidence } from "../src/types.js";

function localized(value: unknown): value is { en: string; bn: string; banglish: string } {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return ["en", "bn", "banglish"].every((key) => typeof record[key] === "string" && String(record[key]).trim().length > 0);
}

function verify() {
  migrate();
  const liquidity = computeAgentLiquidity();
  const drafts = computeAllAlertDrafts();
  const persistedUnusual = db
    .prepare(`SELECT id, agent_id, provider_id, severity, confidence, evidence_json FROM alerts WHERE type = 'unusual_transaction' ORDER BY id`)
    .all() as unknown as Array<{
    id: string;
    agent_id: string;
    provider_id: string | null;
    severity: string;
    confidence: number;
    evidence_json: string;
  }>;

  const forwardLookingAgents = liquidity.filter(
    (agent) => agent.projectedOutflow > 0 || agent.providers.some((provider) => provider.projectedInflowNeed > 0)
  );
  const forwardSample = forwardLookingAgents[0];
  const anomalyEvidence = persistedUnusual.map((row) => {
    try {
      return { row, evidence: JSON.parse(row.evidence_json) as AlertEvidence };
    } catch {
      return { row, evidence: null };
    }
  });
  const explainableAnomalies = anomalyEvidence.filter(({ evidence }) => Boolean(
    evidence &&
      typeof evidence.kind === "string" &&
      Object.keys(evidence.signals).length > 0 &&
      typeof evidence.unconfirmed === "boolean" &&
      localized(evidence.explanation) &&
      localized(evidence.suggestedAction)
  ));
  const evidenceText = JSON.stringify(anomalyEvidence.map(({ evidence }) => evidence));

  const checks = {
    forwardLookingLiquidityExists: forwardLookingAgents.length > 0,
    forwardLookingForecastHasProviderOrCashProjection: Boolean(
      forwardSample &&
        (forwardSample.projectedOutflow > 0 || forwardSample.providers.some((provider) => provider.projectedInflowNeed > 0))
    ),
    shortageEstimateIsExplicit: Boolean(
      forwardSample &&
        (forwardSample.cashShortageMinutes === null || Number.isFinite(forwardSample.cashShortageMinutes)) &&
        forwardSample.providers.every((provider) => provider.estimatedShortageMinutes === null || Number.isFinite(provider.estimatedShortageMinutes))
    ),
    anomalyCategoryPersisted: persistedUnusual.length > 0,
    anomalyEvidenceIsExplainable: explainableAnomalies.length === persistedUnusual.length,
    detectorDoesNotUseValidationLabels: !evidenceText.includes("is_synthetic_anomaly") && !evidenceText.includes("anomaly_kind"),
    draftAndPersistedAnomalyPathsExist: drafts.some((draft) => draft.type === "unusual_transaction"),
  };
  const passed = Object.values(checks).every(Boolean);

  const anomalySample = anomalyEvidence[0];
  console.log(
    JSON.stringify(
      {
        verification: "liquidity-and-anomaly-evidence",
        passed,
        checks,
        forwardLookingSample: forwardSample
          ? {
              agentId: forwardSample.agentId,
              projectedOutflowNext4h: forwardSample.projectedOutflow,
              cashOnHand: forwardSample.physicalCash,
              cashShortageMinutes: forwardSample.cashShortageMinutes,
              providerForecasts: forwardSample.providers.map((provider) => ({
                providerId: provider.providerId,
                projectedInflowNeedNext4h: provider.projectedInflowNeed,
                eMoneyBalance: provider.balance,
                estimatedShortageMinutes: provider.estimatedShortageMinutes,
                dataState: provider.dataState,
              })),
            }
          : null,
        anomalySample: anomalySample
          ? {
              alertId: anomalySample.row.id,
              agentId: anomalySample.row.agent_id,
              providerId: anomalySample.row.provider_id,
              severity: anomalySample.row.severity,
              confidence: anomalySample.row.confidence,
              evidence: anomalySample.evidence,
            }
          : null,
      },
      null,
      2
    )
  );

  if (!passed) process.exitCode = 1;
}

verify();
