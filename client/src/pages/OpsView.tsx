import { useCallback, useEffect, useState } from "react";
import type { AgentLiquidity, AlertListItem, Language } from "../api/types";
import { api } from "../api/client";
import { useApp } from "../state";
import { CasePanel } from "../components/CasePanel";
import { DrawerBar } from "../components/DrawerBar";
import { LevelPill, ProviderChip, SeverityChip, StatusChip, alertScopeFallback, providerColor, typeLabel } from "../components/Chips";
import { PlanningPanel } from "../components/PlanningPanel";

const STATUSES = ["all", "new", "acknowledged", "escalated", "resolved"] as const;

function pickText(lt: { en: string; bn: string; banglish: string }, lang: Language) {
  return lt[lang] ?? lt.en;
}

export function OpsView() {
  const { t, language, meta, user, providerId, setProviderId, focusCaseId, setFocusCaseId } = useApp();
  const [alerts, setAlerts] = useState<AlertListItem[]>([]);
  const [agents, setAgents] = useState<AgentLiquidity[]>([]);
  const [status, setStatus] = useState<(typeof STATUSES)[number]>("all");
  const [openCase, setOpenCase] = useState<string | null>(null);

  // Scenario D deep-links a specific case to open on arrival.
  useEffect(() => {
    if (focusCaseId) {
      setStatus("all");
      setOpenCase(focusCaseId);
      setFocusCaseId(null);
    }
  }, [focusCaseId, setFocusCaseId]);
  const [agentFilter, setAgentFilter] = useState("all");
  const [areaFilter, setAreaFilter] = useState("all");
  const [sortBy, setSortBy] = useState<"priority" | "newest">("priority");
  const [loadError, setLoadError] = useState("");

  const reload = useCallback(() => {
    setLoadError("");
    Promise.all([
      api.alerts("provider_ops", { providerId, status: status === "all" ? undefined : status }),
      api.agents("provider_ops", providerId),
    ])
      .then(([alertRows, agentRows]) => {
        setAlerts(alertRows);
        setAgents(agentRows);
      })
      .catch(() => setLoadError(t("dataUnavailable")));
  }, [providerId, status, t]);

  useEffect(reload, [reload]);

  const open = alerts.filter((a) => a.status !== "resolved");
  const pressured = agents
    .filter((a) => a.overallLevel !== "low")
    .sort((a, b) => b.cashScore - a.cashScore)
    .slice(0, 8);
  const staleFeeds = agents.reduce((s, a) => s + a.providers.filter((p) => p.providerId === providerId && p.stale).length, 0);
  const areas = [...new Set(alerts.map((a) => a.area))].sort();
  const filteredAlerts = alerts
    .filter((a) => (agentFilter === "all" || a.agentId === agentFilter) && (areaFilter === "all" || a.area === areaFilter))
    .sort((a, b) => {
      if (sortBy === "newest") return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      const severityRank = { high: 0, medium: 1, low: 2 } as const;
      return severityRank[a.severity] - severityRank[b.severity] || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

  const statusLabel = (s: (typeof STATUSES)[number]) =>
    s === "all"
      ? t("allStatuses")
      : s === "new"
        ? t("statusNew")
        : s === "acknowledged"
          ? t("statusAcknowledged")
          : s === "escalated"
            ? t("statusEscalated")
            : t("statusResolved");

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="page-title">{t("roleOps")}</div>
          <div className="page-sub">{t("roleOpsDesc")}</div>
        </div>
        <div className="segmented" role="group" aria-label="Provider">
          {meta?.providers.filter((p) => !user?.providerId || p.id === user.providerId).map((p) => (
            <button key={p.id} className={providerId === p.id ? "active" : ""} onClick={() => setProviderId(p.id)}>
              <span className="dot" style={{ display: "inline-block", width: 7, height: 7, borderRadius: 99, background: providerColor(p.id), marginRight: 6 }} />
              {p.name}
            </button>
          ))}
        </div>
      </div>

      {loadError && (
        <div className="callout warn" style={{ marginBottom: 14 }}>
          {loadError} <button className="btn" style={{ marginLeft: 8 }} onClick={reload}>{t("retry")}</button>
        </div>
      )}

      <div className="grid">
        <div className="kpi-row">
          <div className="kpi rise">
            <div className="v">{open.length}</div>
            <div className="k">{t("openAlerts")}</div>
          </div>
          <div className="kpi rise">
            <div className="v">{open.filter((a) => a.severity === "high").length}</div>
            <div className="k">{t("sevHigh")}</div>
          </div>
          <div className="kpi rise">
            <div className="v">{agents.filter((a) => a.providers.some((p) => p.providerId === providerId && p.level === "high")).length}</div>
            <div className="k">{t("highPressureAgents")}</div>
          </div>
          <div className="kpi rise">
            <div className="v">{staleFeeds}</div>
            <div className="k">{t("staleFeeds")}</div>
          </div>
        </div>

        <PlanningPanel />

        <div className="card rise">
          <div className="page-head" style={{ marginBottom: 10 }}>
            <div className="eyebrow" style={{ marginBottom: 0 }}>
              {t("opsQueue")}
            </div>
            <div className="segmented">
              {STATUSES.map((s) => (
                <button key={s} className={status === s ? "active" : ""} onClick={() => setStatus(s)}>
                  {statusLabel(s)}
                </button>
              ))}
            </div>
          </div>

          <div className="queue-filters" aria-label={t("queueFilters")}>
            <label>
              <span>{t("filterAgent")}</span>
              <select value={agentFilter} onChange={(e) => setAgentFilter(e.target.value)}>
                <option value="all">{t("allAgents")}</option>
                {alerts.map((a) => <option key={a.agentId} value={a.agentId}>{a.agentName}</option>).filter((item, index, list) => list.findIndex((candidate) => candidate.key === item.key) === index)}
              </select>
            </label>
            <label>
              <span>{t("filterArea")}</span>
              <select value={areaFilter} onChange={(e) => setAreaFilter(e.target.value)}>
                <option value="all">{t("allAreas")}</option>
                {areas.map((area) => <option key={area} value={area}>{area}</option>)}
              </select>
            </label>
            <label>
              <span>{t("prioritize")}</span>
              <select value={sortBy} onChange={(e) => setSortBy(e.target.value as "priority" | "newest")}>
                <option value="priority">{t("priority")}</option>
                <option value="newest">{t("newest")}</option>
              </select>
            </label>
          </div>

          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>{t("sevHigh")}/{t("sevMedium")}/{t("sevLow")}</th>
                  <th>Type</th>
                  <th>{t("roleAgent")}</th>
                  <th>Provider</th>
                  <th>{t("confidence")}</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {!loadError && filteredAlerts.length === 0 && (
                  <tr>
                    <td colSpan={6} className="muted" style={{ textAlign: "center", padding: 24 }}>
                      {t("noAlerts")}
                    </td>
                  </tr>
                )}
                {filteredAlerts.map((a) => (
                  <tr key={a.id} className="rowlink" onClick={() => setOpenCase(a.id)} tabIndex={0} onKeyDown={(e) => e.key === "Enter" && setOpenCase(a.id)}>
                    <td>
                      <SeverityChip severity={a.severity} t={t} />
                    </td>
                    <td>
                      <strong style={{ fontSize: 12.5 }}>{typeLabel(a.type, t)}</strong>
                      <div className="muted" style={{ fontSize: 11.5, maxWidth: 340, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {pickText(a.evidence.explanation, language)}
                      </div>
                    </td>
                    <td>
                      {a.agentName}
                      <div className="muted" style={{ fontSize: 11 }}>{a.area}</div>
                    </td>
                    <td>
                      <ProviderChip providerId={a.providerId} providerName={a.providerName} fallback={alertScopeFallback(a.type, t)} t={t} />
                    </td>
                    <td>
                      <span className="conf-bar">
                        <i style={{ width: `${a.confidence * 100}%` }} />
                      </span>
                      <span className="mono muted" style={{ marginLeft: 6 }}>
                        {(a.confidence * 100).toFixed(0)}%
                      </span>
                      {a.evidence.unconfirmed && <div className="stale-badge" style={{ marginTop: 4, display: "inline-block" }}>⚠ {t("unconfirmedFeed")}</div>}
                    </td>
                    <td>
                      <StatusChip status={a.status} t={t} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card rise">
          <div className="eyebrow">{t("agentsUnderPressure")}</div>
          <div className="table-wrap">
            <table className="data">
              <tbody>
                {pressured.map((a) => (
                  <tr key={a.agentId}>
                    <td style={{ width: 170 }}>
                      {a.agentName}
                      <div className="muted" style={{ fontSize: 11 }}>{a.area}</div>
                    </td>
                    <td>
                      <DrawerBar liq={a} compact legend={false} t={t} />
                    </td>
                    <td style={{ width: 90 }}>
                      <LevelPill level={a.overallLevel} t={t} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="sub-note">{t("mgmtBoundary")}</div>
        </div>
      </div>

      {openCase && (
        <CasePanel caseId={openCase} role="provider_ops" onClose={() => setOpenCase(null)} onChanged={reload} />
      )}
    </div>
  );
}
