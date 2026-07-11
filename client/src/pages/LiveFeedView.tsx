import { useEffect, useMemo, useState } from "react";
import type { AgentLiquidity, LiveAlert, LiveSnapshot, LiveTransaction, PressureLevel, ProviderPressure } from "../api/types";
import { api } from "../api/client";
import { formatSimTime, formatTaka, useApp } from "../state";
import { DrawerBar } from "../components/DrawerBar";
import { PressureDial } from "../components/PressureDial";
import { LevelPill, providerColor } from "../components/Chips";

function snapshotFromEvent(event: Event): { snapshot: LiveSnapshot | null; alert: LiveAlert | null } {
  try {
    const payload = JSON.parse((event as MessageEvent<string>).data) as { snapshot?: LiveSnapshot; alert?: LiveAlert };
    return { snapshot: payload.snapshot ?? null, alert: payload.alert ?? null };
  } catch {
    return { snapshot: null, alert: null };
  }
}

function levelForScore(score: number): PressureLevel {
  return score >= 1 ? "high" : score >= 0.65 ? "medium" : "low";
}

function relativeEta(minutes: number | null): string {
  if (minutes === null) return "No shortage projected in the next 4h";
  if (minutes < 60) return `Likely short in ${minutes}m`;
  return `Likely short in ${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

function maskedAccount(accountId: string): string {
  return `${accountId.slice(0, 5)}••••${accountId.slice(-2)}`;
}

function transactionTone(transaction: LiveTransaction): string {
  if (transaction.risk_metadata.is_anomaly) return "live-anomaly";
  return transaction.tx_type === "CASH_OUT" ? "live-out" : "live-in";
}

function toAgentLiquidity(snapshot: LiveSnapshot): AgentLiquidity {
  const recentCashOut = snapshot.recent_transactions.filter((tx) => tx.tx_type === "CASH_OUT").reduce((sum, tx) => sum + tx.amount, 0);
  const recentCashIn = snapshot.recent_transactions.filter((tx) => tx.tx_type === "CASH_IN").reduce((sum, tx) => sum + tx.amount, 0);
  const projectedOutflow = Math.round((recentCashOut / 5) * 240);
  const cashScore = snapshot.physical_cash <= 0 ? 1 : Math.min(1, projectedOutflow / snapshot.physical_cash);
  const providers: ProviderPressure[] = snapshot.providers.map((provider) => {
    const score = provider.shortage_minutes === null ? (provider.balance < 120_000 ? 0.65 : 0.2) : Math.min(1.5, 60 / Math.max(provider.shortage_minutes, 1));
    return {
      providerId: provider.provider_id,
      providerName: provider.provider,
      balance: provider.balance,
      masked: false,
      projectedInflowNeed: 0,
      estimatedShortageMinutes: provider.shortage_minutes,
      score,
      level: levelForScore(score),
      staleMinutes: 0,
      stale: false,
      dataState: "fresh",
      predictionConfidence: 0.94,
      confidencePenalties: [],
    };
  });

  return {
    agentId: "live-agent",
    agentName: "Live stream",
    area: "Synthetic operation",
    physicalCash: snapshot.physical_cash,
    cashMasked: false,
    todayCashOut: recentCashOut,
    todayCashIn: recentCashIn,
    projectedOutflow,
    cashShortageMinutes: snapshot.physical_cash > 0 && recentCashOut > 0 ? Math.round((snapshot.physical_cash / (recentCashOut / 5)) * 10) / 10 : null,
    cashScore,
    cashLevel: levelForScore(cashScore),
    cashPredictionConfidence: 0.94,
    cashConfidencePenalties: [],
    providers,
    overallLevel: snapshot.risk_level === "red" ? "high" : providers.some((p) => p.level === "high") ? "high" : providers.some((p) => p.level === "medium") ? "medium" : "low",
  };
}

export function LiveFeedView() {
  const { t } = useApp();
  const [snapshot, setSnapshot] = useState<LiveSnapshot | null>(null);
  const [toast, setToast] = useState<LiveAlert | null>(null);
  const [error, setError] = useState("");
  const [controlBusy, setControlBusy] = useState(false);

  useEffect(() => {
    let mounted = true;
    api.liveSnapshot().then((value) => mounted && setSnapshot(value)).catch(() => mounted && setError(t("liveUnavailable")));

    const source = new EventSource("/api/live-feed/stream");
    const handleEvent = (event: Event) => {
      const result = snapshotFromEvent(event);
      if (result.snapshot) {
        setSnapshot(result.snapshot);
        setError("");
      }
      if (result.alert) {
        setToast(result.alert);
        window.setTimeout(() => setToast(null), 6_000);
      }
    };
    source.addEventListener("snapshot", handleEvent);
    source.addEventListener("transaction", handleEvent);
    source.addEventListener("alert", handleEvent);
    source.onerror = () => mounted && setError(t("liveUnavailable"));
    return () => {
      mounted = false;
      source.close();
    };
  }, [t]);

  const control = (action: "pause" | "resume" | "inject_liquidity_drain" | "inject_anomaly_attack") => {
    setControlBusy(true);
    api.liveControl(action)
      .then((result) => setSnapshot(result.snapshot))
      .catch(() => setError(t("liveControlFailed")))
      .finally(() => setControlBusy(false));
  };

  const liveAgent = useMemo(() => snapshot ? toAgentLiquidity(snapshot) : null, [snapshot]);

  if (!snapshot || !liveAgent) return <div className="callout warn">{error || t("loading")}</div>;

  const total = liveAgent.physicalCash! + liveAgent.providers.reduce((sum, provider) => sum + (provider.balance ?? 0), 0);

  return (
    <div>
      {toast && <div className="live-toast" role="alert"><span className="live-alert-icon">!</span><div><strong>{toast.message}</strong><div>{toast.detail}</div></div></div>}

      <div className="page-head live-head">
        <div>
          <div className="page-title">{t("liveFeedTitle")}</div>
          <div className="page-sub">{t("liveFeedSubtitle")}</div>
        </div>
        <div className="live-head-actions">
          <div className={`live-status ${snapshot.paused ? "paused" : "running"}`}>
            <span className="live-dot" /> {snapshot.paused ? t("livePaused") : t("liveRunning")}
            <span className="muted">· {snapshot.mode.replace("_", " ")}</span>
          </div>
          <button className="btn" disabled={controlBusy} onClick={() => control(snapshot.paused ? "resume" : "pause")}>{snapshot.paused ? "▶" : "Ⅱ"} {snapshot.paused ? t("liveResume") : t("livePause")}</button>
        </div>
      </div>

      {error && <div className="callout warn live-error">{error}</div>}

      <div className="grid">
        <div className="hero-grid">
          <div className="card rise">
            <div className="eyebrow">{t("totalServiceable")}</div>
            <div className="big-number">{formatTaka(total)}</div>
            <div className="sub-note">{t("notMerged")}</div>
            <div style={{ marginTop: 18 }}><DrawerBar liq={liveAgent} t={t} /></div>
            <div className="live-stream-caption"><span className="live-dot" /> {snapshot.rolling_transaction_count} {t("liveTransactionsInWindow")} · {formatSimTime(snapshot.updated_at)}</div>
          </div>

          <div className="card rise" style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
            <div className="eyebrow" style={{ alignSelf: "flex-start" }}>{t("cashOutPressure")}</div>
            <PressureDial score={liveAgent.cashScore} level={liveAgent.cashLevel} t={t} />
            <div className="sub-note" style={{ textAlign: "center" }}>{formatTaka(liveAgent.projectedOutflow)} {t("demandVsCash")}</div>
            <div className={`shortage-eta${liveAgent.cashShortageMinutes === null ? " calm" : ""}`}>{relativeEta(liveAgent.cashShortageMinutes)}</div>
            <div className="sub-note" style={{ textAlign: "center" }}>{formatTaka(snapshot.physical_cash_delta_since_start)} {t("liveSinceStart")}</div>
          </div>
        </div>

        <div className="float-cards">
          {liveAgent.providers.map((provider) => {
            const liveProvider = snapshot.providers.find((item) => item.provider_id === provider.providerId);
            return (
              <div className="float-card rise" key={provider.providerId} style={{ borderTopColor: providerColor(provider.providerId) }}>
                <div className="name">{provider.providerName} {t("eFloat")} <LevelPill level={provider.level} t={t} /></div>
                <div className="bal">{formatTaka(provider.balance)}</div>
                <div className="meta-line"><span className={liveProvider && liveProvider.delta_since_start < 0 ? "live-negative mono" : "live-positive mono"}>{liveProvider && liveProvider.delta_since_start >= 0 ? "+" : ""}{formatTaka(liveProvider?.delta_since_start)}</span><span className="mono">{t("liveSinceStart")}</span></div>
                <div className={`shortage-eta${provider.estimatedShortageMinutes === null ? " calm" : ""}`}>{relativeEta(provider.estimatedShortageMinutes)}</div>
                <div className="sub-note">{t("confidence")} {(provider.predictionConfidence * 100).toFixed(0)}%</div>
              </div>
            );
          })}
        </div>

        <div className="two-col">
          <div className="card rise">
            <div className="eyebrow">{t("liveRiskMonitor")}</div>
            <div className={`live-risk-score ${snapshot.risk_level}`}><strong>{snapshot.risk_score}%</strong><span>{snapshot.consecutive_suspicious_cash_outs} {t("liveConsecutive")}</span></div>
            <div className="risk-meter"><div className={`risk-meter-fill ${snapshot.risk_level}`} style={{ width: `${snapshot.risk_score}%` }} /></div>
            <div className="risk-meter-labels"><span>0%</span><span>70% review threshold</span><span>100%</span></div>
            <p className="live-note">{snapshot.risk_level === "red" ? t("liveRiskRed") : t("liveRiskNormal")}</p>
            <div className="responsible-note">{t("liveResponsible")}</div>
            {snapshot.ai_advisory && (
              <div className={`ai-advisory ${snapshot.ai_advisory.status}`}>
                <div className="ai-advisory-head"><span className="eyebrow">{t("aiAdvisory")}</span><span className="chip ghost">{snapshot.ai_advisory.status === "available" ? t("aiAvailable") : snapshot.ai_advisory.status === "disabled" ? "Disabled" : "Unavailable"}</span></div>
                <strong>{snapshot.ai_advisory.summary}</strong>
                <p>{snapshot.ai_advisory.recommended_action}</p>
                {snapshot.ai_advisory.status === "available" && <div className="ai-advisory-meta"><span>{snapshot.ai_advisory.risk_band?.toUpperCase()} advisory</span>{snapshot.ai_advisory.shortage_minutes !== null && <span>{snapshot.ai_advisory.shortage_minutes} min shortage estimate</span>}{snapshot.ai_advisory.confidence !== null && <span>{Math.round(snapshot.ai_advisory.confidence * 100)}% confidence</span>}</div>}
                <div className="ai-advisory-foot">{snapshot.ai_advisory.status === "disabled" ? t("aiDisabled") : snapshot.ai_advisory.status === "error" ? t("aiUnavailable") : t("aiHumanReview")}{snapshot.ai_advisory.generated_at && ` · ${formatSimTime(snapshot.ai_advisory.generated_at)}`}</div>
              </div>
            )}
          </div>

          <div className="card rise">
            <div className="eyebrow">{t("liveAdvisoryAlerts")}</div>
            <div className="live-alert-list">
              {snapshot.active_alerts.map((alert) => <div className="live-alert" key={alert.id}><span className="live-alert-icon">!</span><div><strong>{alert.message}</strong><p>{alert.detail}</p></div></div>)}
              {snapshot.active_alerts.length === 0 && <div className="callout success">{t("liveNoAlerts")}</div>}
            </div>
            <div className="live-controls-wrap">
              <div className="eyebrow">{t("liveDemoControls")}</div>
              <div className="live-controls"><button className="btn" disabled={controlBusy} onClick={() => control("inject_liquidity_drain")}>⚠ {t("liveDrain")}</button><button className="btn primary" disabled={controlBusy} onClick={() => control("inject_anomaly_attack")}>⚡ {t("liveAttack")}</button></div>
            </div>
          </div>
        </div>

        <div className="card rise">
          <div className="page-head live-section-head"><div className="eyebrow">{t("liveRecentTransactions")}</div><span className="muted">{formatSimTime(snapshot.updated_at)}</span></div>
          <div className="table-wrap">
            <table className="data live-table"><thead><tr><th>Time</th><th>Provider</th><th>Type</th><th>Amount</th><th>Account</th><th>Signal</th></tr></thead><tbody>
              {snapshot.recent_transactions.map((transaction) => <tr key={transaction.tx_id} className={transactionTone(transaction)}><td className="mono">{formatSimTime(transaction.timestamp)}</td><td>{transaction.provider}</td><td>{transaction.tx_type.replace("_", " ")}</td><td className="mono">{formatTaka(transaction.amount)}</td><td className="mono">{maskedAccount(transaction.account_id)}</td><td>{transaction.risk_metadata.is_anomaly ? <span className="chip chip-high">Review</span> : <span className="muted">Normal</span>}</td></tr>)}
              {snapshot.recent_transactions.length === 0 && <tr><td colSpan={6} className="muted">{t("liveWaiting")}</td></tr>}
            </tbody></table>
          </div>
        </div>
      </div>
    </div>
  );
}
