import { useEffect, useState } from "react";
import type { AgentDetail, Language } from "../api/types";
import { api } from "../api/client";
import { formatTaka, useApp } from "../state";
import { DrawerBar } from "../components/DrawerBar";
import { PressureDial } from "../components/PressureDial";
import { HourlyBars } from "../components/HourlyBars";
import { WhatIfPanel } from "../components/WhatIfPanel";
import { LevelPill, ProviderChip, SeverityChip, StatusChip, alertScopeFallback, providerColor, typeLabel } from "../components/Chips";

function pickText(lt: { en: string; bn: string; banglish: string }, lang: Language) {
  return lt[lang] ?? lt.en;
}

function shortageEta(minutes: number | null, simNow: string | undefined, t: (key: string) => string) {
  if (minutes === null) return t("noShortageHorizon");
  const eta = simNow ? new Date(new Date(simNow).getTime() + minutes * 60_000) : null;
  const relative = minutes < 60 ? `${minutes}m` : `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
  return `${t("shortageBy")} ${eta ? eta.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) : relative} (${relative})`;
}

function feedStatus(state: AgentDetail["providers"][number]["dataState"], staleMinutes: number | null, t: (key: string) => string) {
  if (state === "missing") return t("feedMissing");
  if (state === "inconsistent") return t("feedInconsistent");
  return `${t("lastSynced")} ${staleMinutes ?? "—"} ${t("minAgo")}`;
}

export function AgentView() {
  const { t, language, meta, agentId, setAgentId } = useApp();
  const [detail, setDetail] = useState<AgentDetail | null>(null);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    if (!agentId) return;
    setDetail(null);
    setLoadError("");
    api.agentDetail(agentId, "agent").then(setDetail).catch(() => setLoadError(t("dataUnavailable")));
  }, [agentId, t]);

  if (!detail)
    return (
      <div>
        <AgentPicker />
        {loadError ? <div className="callout warn">{loadError}</div> : <div className="muted">{t("loading")}</div>}
      </div>
    );

  const total = (detail.physicalCash ?? 0) + detail.providers.reduce((s, p) => s + (p.balance ?? 0), 0);
  const imbalanceAlert = detail.alerts.find((a) => a.type === "cross_provider_imbalance");

  function AgentPicker() {
    return (
      <div className="page-head">
        <div>
          <div className="page-title">{detail?.agentName ?? "…"}</div>
          <div className="page-sub">{detail?.area}</div>
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
          <span className="muted mono">{t("demoSelector")}</span>
          <select value={agentId} onChange={(e) => setAgentId(e.target.value)}>
            {meta?.agents.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} — {a.area}
              </option>
            ))}
          </select>
        </label>
      </div>
    );
  }

  return (
    <div>
      <AgentPicker />

      <div className="grid">
        <div className="hero-grid">
          <div className="card rise">
            <div className="eyebrow">{t("totalServiceable")}</div>
            <div className="big-number">{formatTaka(total)}</div>
            <div className="sub-note">{t("notMerged")}</div>
            <div style={{ marginTop: 18 }}>
              <DrawerBar liq={detail} t={t} />
            </div>
          </div>
          <div className="card rise" style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
            <div className="eyebrow" style={{ alignSelf: "flex-start" }}>
              {t("cashOutPressure")}
            </div>
            <PressureDial score={detail.cashScore} level={detail.cashLevel} t={t} />
            <div className="sub-note" style={{ textAlign: "center" }}>
              {formatTaka(detail.projectedOutflow)} {t("demandVsCash")}
            </div>
            <div className={`shortage-eta${detail.cashShortageMinutes === null ? " calm" : ""}`}>
              {shortageEta(detail.cashShortageMinutes, meta?.simNow, t)}
            </div>
            <div className="sub-note" style={{ textAlign: "center" }}>
              {t("confidence")} {(detail.cashPredictionConfidence * 100).toFixed(0)}%
              {detail.cashConfidencePenalties.length > 0 ? ` · ${detail.cashConfidencePenalties.length} quality check${detail.cashConfidencePenalties.length === 1 ? "" : "s"}` : ""}
            </div>
          </div>
        </div>

        <div className="float-cards">
          {detail.providers.map((p) => (
            <div className="float-card rise" key={p.providerId} style={{ borderTopColor: providerColor(p.providerId) }}>
              <div className="name">
                {p.providerName} {t("eFloat")}
                <LevelPill level={p.level} t={t} />
              </div>
              <div className="bal">{formatTaka(p.balance)}</div>
              <div className="meta-line">
                <span className="mono">
                  {feedStatus(p.dataState, p.staleMinutes, t)}
                </span>
                {p.stale && <span className="stale-badge">⚠ {t("unconfirmedFeed")}</span>}
              </div>
              <div className={`shortage-eta${p.estimatedShortageMinutes === null ? " calm" : ""}`}>
                {shortageEta(p.estimatedShortageMinutes, meta?.simNow, t)}
              </div>
              <div className="sub-note">
                {t("confidence")} {(p.predictionConfidence * 100).toFixed(0)}%
                {p.confidencePenalties.length > 0 ? ` · ${p.confidencePenalties.length} quality check${p.confidencePenalties.length === 1 ? "" : "s"}` : ""}
              </div>
            </div>
          ))}
        </div>

        {imbalanceAlert && (
          <div className="callout warn rise">{pickText(imbalanceAlert.evidence.explanation, language)} {pickText(imbalanceAlert.evidence.suggestedAction, language)}</div>
        )}

        <div className="two-col">
          <div className="card rise">
            <div className="eyebrow">{t("todaysFlow")}</div>
            <HourlyBars timeline={detail.timeline} t={t} />
            <div className="drawer-legend">
              <span className="legend-item">
                <span className="legend-dot" style={{ background: "var(--cash)" }} />
                <span className="legend-name">cash-in</span>
              </span>
              <span className="legend-item">
                <span className="legend-dot" style={{ background: "var(--sev-high)" }} />
                <span className="legend-name">cash-out</span>
              </span>
            </div>
          </div>
          <WhatIfPanel agentId={agentId} role="agent" />
        </div>

        <div className="card rise">
          <div className="eyebrow">{t("myAlerts")}</div>
          {detail.alerts.length === 0 && <div className="muted">{t("noAlerts")}</div>}
          {detail.alerts.map((a) => (
            <div className="alert-row" key={a.id}>
              <SeverityChip severity={a.severity} t={t} />
              <div className="body">
                <strong style={{ fontSize: 13 }}>{typeLabel(a.type, t)}</strong>
                <div className="exp">{pickText(a.evidence.explanation, language)}</div>
                <div className="meta-line">
                  <ProviderChip providerId={a.providerId} providerName={a.providerName} fallback={alertScopeFallback(a.type, t)} t={t} />
                  <StatusChip status={a.status} t={t} />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
