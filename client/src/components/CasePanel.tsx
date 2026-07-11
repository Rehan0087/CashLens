import { useEffect, useState } from "react";
import type { CaseAction, CaseDetail, Language, Role } from "../api/types";
import { api } from "../api/client";
import { useApp } from "../state";
import { EvidenceBand } from "./EvidenceBand";
import { DrawerBar } from "./DrawerBar";
import { ProviderChip, SeverityChip, StatusChip, alertScopeFallback, typeLabel } from "./Chips";

function pickText(lt: { en: string; bn: string; banglish: string }, lang: Language) {
  return lt[lang] ?? lt.en;
}

function roleLabel(role: string) {
  return role === "risk_analyst" ? "Risk analyst" : "Provider operations";
}

function formatTimestamp(iso: string) {
  const time = new Date(iso);
  return Number.isNaN(time.getTime()) ? "—" : time.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
}

/**
 * Full case view with evidence, audit trail, and role-legal actions.
 * Used as a slide-over by Provider Ops and inline by the Risk Analyst.
 */
export function CasePanel({
  caseId,
  role,
  onClose,
  onChanged,
  inline = false,
}: {
  caseId: string;
  role: Role;
  onClose?: () => void;
  onChanged: () => void;
  inline?: boolean;
}) {
  const { t, language, providerId } = useApp();
  const [detail, setDetail] = useState<CaseDetail | null>(null);
  const [note, setNote] = useState("");
  const [disposition, setDisposition] = useState("dispNoIssue");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = () => {
    api.caseDetail(caseId, role, role === "provider_ops" ? providerId : undefined).then(setDetail).catch((e) => setError(e.message));
  };
  // Reload whenever the selected case changes.
  useEffect(() => {
    setDetail(null);
    setNote("");
    setError("");
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseId, role, providerId]);

  const act = async (action: CaseAction) => {
    if (!detail) return;
    setBusy(true);
    setError("");
    try {
      const finalNote = action === "resolve" && role === "risk_analyst" ? `${t(disposition)} — ${note}`.trim() : note;
      await api.caseAction(detail.id, action, role, finalNote, role === "provider_ops" ? providerId : undefined);
      setNote("");
      load();
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const body = !detail ? (
    <div className="muted">{t("loading")}</div>
  ) : (
    <>
      <div className="case-head">
        <div>
          <div className="case-title">{typeLabel(detail.type, t)}</div>
          <div className="muted" style={{ fontSize: 12.5, marginTop: 3 }}>
            {detail.agentName} · {detail.area}
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
          <SeverityChip severity={detail.severity} t={t} />
          <StatusChip status={detail.status} t={t} />
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <ProviderChip providerId={detail.providerId} providerName={detail.providerName} fallback={alertScopeFallback(detail.type, t)} t={t} />
        <span className="mono muted">
          {t("confidence")} {(detail.confidence * 100).toFixed(0)}%
        </span>
        <span className="conf-bar">
          <i style={{ width: `${detail.confidence * 100}%` }} />
        </span>
        {detail.evidence.unconfirmed && <span className="stale-badge">⚠ {t("unconfirmedFeed")}</span>}
      </div>

      <div className="case-routing">
        <div>
          <span>{t("receivedBy")}</span>
          <strong>{roleLabel(detail.assignedRole)}</strong>
        </div>
        <div>
          <span>{t("caseOwner")}</span>
          <strong>{detail.assignedRole === "risk_analyst" ? roleLabel(detail.assignedRole) : detail.providerName ? `${detail.providerName} operations` : t("sharedCashQueue")}</strong>
        </div>
        <div>
          <span>{t("currentStatus")}</span>
          <StatusChip status={detail.status} t={t} />
        </div>
        <div>
          <span>{t("created")}</span>
          <strong>{formatTimestamp(detail.createdAt)}</strong>
        </div>
      </div>

      <p style={{ fontSize: 13.5 }}>{pickText(detail.evidence.explanation, language)}</p>

      <div className="callout">{pickText(detail.evidence.suggestedAction, language)}</div>

      <div>
        <div className="eyebrow">{t("evidence")}</div>
        <EvidenceBand evidence={detail.evidence} t={t} />
        <div className="signals" style={{ marginTop: 10 }}>
          {Object.entries(detail.evidence.signals).map(([k, v]) => (
            <div key={k}>
              <div className="k">{k}</div>
              <div className="v">{typeof v === "number" ? v.toLocaleString("en-US") : String(v)}</div>
            </div>
          ))}
        </div>
      </div>

      {detail.agentContext && (
        <div>
          <div className="eyebrow">{detail.agentName}</div>
          <DrawerBar liq={detail.agentContext} compact legend t={t} />
        </div>
      )}

      <div>
        <div className="eyebrow">{t("caseTimeline")}</div>
        {detail.notes.length === 0 && <div className="muted" style={{ fontSize: 12.5 }}>—</div>}
        {detail.notes.map((n) => (
          <div className="note-item" key={n.id}>
            <span className="who">{n.role.replace("_", " ")}<br />{formatTimestamp(n.timestamp)}</span>
            <span>{n.note}</span>
          </div>
        ))}
      </div>

      {detail.allowedActions.length > 0 && (
        <div className="action-bar">
          {role === "risk_analyst" && detail.allowedActions.includes("resolve") && (
            <label style={{ fontSize: 12.5, display: "flex", flexDirection: "column", gap: 5 }}>
              <span className="muted">{t("dispositionLabel")}</span>
              <select value={disposition} onChange={(e) => setDisposition(e.target.value)}>
                <option value="dispNoIssue">{t("dispNoIssue")}</option>
                <option value="dispFollowUp">{t("dispFollowUp")}</option>
                <option value="dispCompliance">{t("dispCompliance")}</option>
              </select>
            </label>
          )}
          <textarea placeholder={t("notePlaceholder")} value={note} onChange={(e) => setNote(e.target.value)} />
          {error && <div className="error-text">{error}</div>}
          <div className="action-buttons">
            {detail.allowedActions.includes("acknowledge") && (
              <button className="btn" disabled={busy} onClick={() => act("acknowledge")}>
                {t("acknowledge")}
              </button>
            )}
            {detail.allowedActions.includes("escalate") && (
              <button className="btn primary" disabled={busy} onClick={() => act("escalate")}>
                {t("escalate")}
              </button>
            )}
            {detail.allowedActions.includes("resolve") && (
              <button className="btn success" disabled={busy} onClick={() => act("resolve")}>
                {t("resolve")}
              </button>
            )}
          </div>
        </div>
      )}
    </>
  );

  if (inline) {
    return <div className="card" style={{ display: "flex", flexDirection: "column", gap: 16 }}>{error && !detail ? <div className="error-text">{error}</div> : body}</div>;
  }

  return (
    <>
      <div className="case-overlay" onClick={onClose} />
      <aside className="case-panel" aria-label={t("viewCase")}>
        <button className="btn" style={{ alignSelf: "flex-end" }} onClick={onClose}>
          {t("close")}
        </button>
        {error && !detail ? <div className="error-text">{error}</div> : body}
      </aside>
    </>
  );
}
