import { useEffect, useMemo, useState } from "react";
import type { AgentLiquidity, Overview, ProviderSummary } from "../api/types";
import { api } from "../api/client";
import { useApp } from "../state";
import { DrawerBar } from "../components/DrawerBar";
import { LevelPill, providerColor } from "../components/Chips";

/**
 * Financial service provider view (brief §5): understand provider-specific service
 * pressure while keeping provider data and authority separate. Aggregate only —
 * no case actions, no other provider's balances. The provider selector is "which
 * FSP am I", not a filter over shared data.
 */
export function FspView() {
  const { t, meta, user, providerId, setProviderId } = useApp();
  const [overview, setOverview] = useState<Overview | null>(null);
  const [agents, setAgents] = useState<AgentLiquidity[]>([]);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    setLoadError("");
    Promise.all([api.overview(), api.agents("financial_service_provider", providerId)])
      .then(([overviewResult, agentRows]) => {
        setOverview(overviewResult);
        setAgents(agentRows);
      })
      .catch(() => setLoadError(t("dataUnavailable")));
  }, [providerId, t]);

  const providerName = meta?.providers.find((p) => p.id === providerId)?.name ?? providerId;

  // Only this provider's own summary is surfaced — other providers stay separate.
  const summary: ProviderSummary | undefined = overview?.providers.find((p) => p.providerId === providerId);

  // This provider's float pressure per agent (own balance visible, others masked).
  const providerAgents = useMemo(
    () =>
      agents
        .map((a) => ({ agent: a, p: a.providers.find((pp) => pp.providerId === providerId) }))
        .filter((x) => x.p)
        .sort((a, b) => (b.p!.score ?? 0) - (a.p!.score ?? 0)),
    [agents, providerId]
  );

  const pressured = providerAgents.filter((x) => x.p!.level !== "low");
  const highPressure = providerAgents.filter((x) => x.p!.level === "high").length;
  const staleOrBad = providerAgents.filter((x) => x.p!.dataState !== "fresh").length;

  const readiness =
    highPressure > 0 ? { key: "fspReadinessStrain", cls: "high" } : pressured.length > 0 ? { key: "fspReadinessWatch", cls: "medium" } : { key: "fspReadinessGood", cls: "low" };

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="page-title">{t("fspTitle")}</div>
          <div className="page-sub">{t("roleFspDesc")}</div>
        </div>
        <div className="segmented" role="group" aria-label={t("fspYouAre")}>
          {meta?.providers.filter((p) => !user?.providerId || p.id === user.providerId).map((p) => (
            <button key={p.id} className={providerId === p.id ? "active" : ""} onClick={() => setProviderId(p.id)}>
              <span className="dot" style={{ display: "inline-block", width: 7, height: 7, borderRadius: 99, background: providerColor(p.id), marginRight: 6 }} />
              {p.name}
            </button>
          ))}
        </div>
      </div>

      {loadError && <div className="callout warn" style={{ marginBottom: 14 }}>{loadError}</div>}

      <div className="grid">
        <div className="fsp-identity card rise" style={{ borderLeft: `4px solid ${providerColor(providerId)}` }}>
          <span className="eyebrow" style={{ margin: 0 }}>{t("fspYouAre")}</span>
          <span className="fsp-identity-name">
            <span className="dot" style={{ display: "inline-block", width: 12, height: 12, borderRadius: 99, background: providerColor(providerId), marginRight: 9 }} />
            {providerName}
          </span>
          <span className={`pill ${readiness.cls}`} style={{ marginLeft: "auto" }}>
            {t("fspReadiness")}: {t(readiness.key)}
          </span>
        </div>

        <div className="kpi-row">
          <div className="kpi rise">
            <div className="v">{providerAgents.length}</div>
            <div className="k">{t("fspAgentsServed")}</div>
          </div>
          <div className="kpi rise">
            <div className="v">{highPressure}</div>
            <div className="k">{t("fspFloatPressure")}</div>
            <div className="s">{t("fspCustomersAtRisk")}</div>
          </div>
          <div className="kpi rise">
            <div className="v">{summary?.openAlerts ?? 0}</div>
            <div className="k">{t("openAlerts")}</div>
          </div>
          <div className="kpi rise">
            <div className="v">{staleOrBad}</div>
            <div className="k">{t("staleFeeds")}</div>
          </div>
        </div>

        <div className="card rise">
          <div className="eyebrow">{t("fspFloatPressure")}</div>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>{t("roleAgent")}</th>
                  <th>{t("fspAgentFloat")}</th>
                  <th>{t("levelHigh")}/{t("levelMedium")}/{t("levelLow")}</th>
                </tr>
              </thead>
              <tbody>
                {pressured.length === 0 && (
                  <tr>
                    <td colSpan={3} className="muted" style={{ textAlign: "center", padding: 22 }}>{t("noAlerts")}</td>
                  </tr>
                )}
                {pressured.map(({ agent, p }) => (
                  <tr key={agent.agentId}>
                    <td style={{ width: 180 }}>
                      {agent.agentName}
                      <div className="muted" style={{ fontSize: 11 }}>{agent.area}</div>
                    </td>
                    <td>
                      <DrawerBar liq={agent} compact legend={false} t={t} />
                    </td>
                    <td style={{ width: 90 }}>
                      <LevelPill level={p!.level} t={t} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="sub-note">{t("fspBoundary")}</div>
        </div>
      </div>
    </div>
  );
}
