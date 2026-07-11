import { useEffect, useState } from "react";
import type { MetricsReport, Observability, Overview } from "../api/types";
import { api } from "../api/client";
import { useApp } from "../state";
import { providerColor } from "../components/Chips";

export function MgmtView() {
  const { t } = useApp();
  const [overview, setOverview] = useState<Overview | null>(null);
  const [metrics, setMetrics] = useState<MetricsReport | null>(null);
  const [observability, setObservability] = useState<Observability | null>(null);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    setLoadError("");
    Promise.all([api.overview(), api.metrics(), api.observability()])
      .then(([overviewResult, metricsResult, observabilityResult]) => {
        setOverview(overviewResult);
        setMetrics(metricsResult);
        setObservability(observabilityResult);
      })
      .catch(() => setLoadError(t("dataUnavailable")));
  }, [t]);

  if (!overview) return loadError ? <div className="callout warn">{loadError}</div> : <div className="muted">{t("loading")}</div>;

  const maxIndex = Math.max(...overview.areas.map((a) => a.pressureIndex), 1);

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="page-title">{t("roleMgmt")}</div>
          <div className="page-sub">{t("mgmtBoundary")}</div>
        </div>
      </div>

      <div className="grid">
        <div className="kpi-row">
          <div className="kpi rise">
            <div className="v">{overview.totals.agents}</div>
            <div className="k">{t("agents")}</div>
          </div>
          <div className="kpi rise">
            <div className="v">{overview.totals.openAlerts}</div>
            <div className="k">{t("openAlerts")}</div>
            <div className="s">{overview.totals.highSeverityOpen} {t("sevHigh").toLowerCase()}</div>
          </div>
          <div className="kpi rise">
            <div className="v">{overview.totals.escalated}</div>
            <div className="k">{t("escalatedCases")}</div>
          </div>
          <div className="kpi rise">
            <div className="v">{overview.totals.resolved}</div>
            <div className="k">{t("statusResolved")}</div>
          </div>
        </div>

        <div className="two-col">
          <div className="card rise">
            <div className="eyebrow">{t("areaHotspots")}</div>
            {overview.areas.map((a) => (
              <div className="heat-row" key={a.area}>
                <span>
                  {a.area}
                  <div className="muted" style={{ fontSize: 11 }}>
                    {a.agentCount} {t("agents")}
                  </div>
                </span>
                <span className="heat-bar">
                  <i style={{ width: `${(a.pressureIndex / maxIndex) * 100}%` }} />
                </span>
                <span className="heat-meta">
                  {a.pressureIndex.toFixed(2)} · {a.highPressureAgents}⚠ · {a.openAlerts} 🔔
                </span>
              </div>
            ))}
            <div className="sub-note">
              {t("pressureIndex")}: 1.00 = projected demand equals capacity
            </div>
          </div>

          <div className="card rise">
            <div className="eyebrow">{t("providerHealth")}</div>
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Provider</th>
                    <th>{t("openAlerts")}</th>
                    <th>{t("highPressureAgents")}</th>
                    <th>{t("staleFeeds")}</th>
                  </tr>
                </thead>
                <tbody>
                  {overview.providers.map((p) => (
                    <tr key={p.providerId}>
                      <td>
                        <span className="chip provider">
                          <span className="dot" style={{ background: providerColor(p.providerId) }} />
                          {p.providerName}
                        </span>
                      </td>
                      <td className="mono">{p.openAlerts}</td>
                      <td className="mono">{p.highPressureAgents}</td>
                      <td className="mono">{p.staleFeeds}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="sub-note">{t("mgmtBoundary")}</div>
          </div>
        </div>

        {metrics && (
          <div className="card rise">
            <div className="eyebrow">{t("validation")}</div>
            <div className="kpi-row">
              <div className="kpi">
                <div className="v">{(metrics.detection.recall * 100).toFixed(0)}%</div>
                <div className="k">{t("recall")}</div>
                <div className="s">
                  {metrics.detection.detected}/{metrics.dataset.injectedAnomalies} injected
                </div>
              </div>
              <div className="kpi">
                <div className="v">{(metrics.detection.falsePositiveRate * 100).toFixed(1)}%</div>
                <div className="k">{t("falsePositiveRate")}</div>
                <div className="s">{metrics.detection.falsePositives} false alerts</div>
              </div>
              <div className="kpi">
                <div className="v">{(metrics.detection.precision * 100).toFixed(0)}%</div>
                <div className="k">{t("precision")}</div>
              </div>
              <div className="kpi">
                <div className="v">{(metrics.detection.scenarioCoverage * 100).toFixed(0)}%</div>
                <div className="k">{t("scenarioCoverage")}</div>
                <div className="s">{metrics.dataset.scenarioAgents} scenarios</div>
              </div>
              <div className="kpi">
                <div className="v">{metrics.performance.engineRunMsAvg}ms</div>
                <div className="k">{t("engineRun")}</div>
                <div className="s">{metrics.performance.engineThroughputTxPerSec.toLocaleString()} tx/s</div>
              </div>
              <div className="kpi">
                <div className="v">{metrics.performance.dashboardAssemblyP95Ms}ms</div>
                <div className="k">{t("dashboardP95")}</div>
              </div>
              <div className="kpi">
                <div className="v">{(metrics.providerForecast.demandMape * 100).toFixed(1)}%</div>
                <div className="k">{t("forecastError")}</div>
                <div className="s">{metrics.providerForecast.scenarioCount} held-out scenarios</div>
              </div>
              <div className="kpi">
                <div className="v">{metrics.providerForecast.averageLeadMinutes}m</div>
                <div className="k">{t("warningLead")}</div>
                <div className="s">min {metrics.providerForecast.minimumLeadMinutes}m · {metrics.providerForecast.detectedShortages}/{metrics.providerForecast.actualShortageScenarios} caught</div>
              </div>
              <div className="kpi">
                <div className="v">{(metrics.explainability.coverage * 100).toFixed(0)}%</div>
                <div className="k">{t("explanationCoverage")}</div>
                <div className="s">{metrics.explainability.fullyExplainedAlerts}/{metrics.explainability.alerts} alerts</div>
              </div>
              <div className="kpi">
                <div className="v">{metrics.performance.apiReadPathP95Ms}ms</div>
                <div className="k">{t("apiReadP95")}</div>
                <div className="s">avg {metrics.performance.apiReadPathAvgMs}ms · {metrics.dataset.transactions.toLocaleString()} tx</div>
              </div>
              <div className="kpi">
                <div className="v">{(metrics.reliability.providerInputGuards.coverage * 100).toFixed(0)}%</div>
                <div className="k">{t("inputGuardCoverage")}</div>
                <div className="s">delayed · missing · inconsistent</div>
              </div>
            </div>
            <div className="sub-note">{t("validationNote")}</div>
          </div>
        )}

        {observability && (
          <div className="card rise">
            <div className="eyebrow">{t("reliability")}</div>
            <div className="kpi-row">
              <div className="kpi">
                <div className="v">{observability.providerInputs.state === "healthy" ? t("healthy") : t("degraded")}</div>
                <div className="k">{t("providerInputHealth")}</div>
                <div className="s">{observability.providerInputs.receivedFeeds}/{observability.providerInputs.expectedFeeds} feeds received</div>
              </div>
              <div className="kpi">
                <div className="v">{observability.providerInputs.staleFeeds}</div>
                <div className="k">{t("staleFeeds")}</div>
                <div className="s">{observability.providerInputs.missingFeeds} missing · {observability.providerInputs.inconsistentFeeds} inconsistent</div>
              </div>
              <div className="kpi">
                <div className="v">{observability.routes.reduce((sum, route) => sum + route.requests, 0)}</div>
                <div className="k">{t("observedRequests")}</div>
                <div className="s">{observability.routes.reduce((sum, route) => sum + route.errors, 0)} errors · trace IDs logged</div>
              </div>
            </div>
            <div className="sub-note">{observability.providerInputs.safeFallback}</div>
          </div>
        )}
      </div>
    </div>
  );
}
