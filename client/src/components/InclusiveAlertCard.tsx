import type { AgentAlertSummary } from "../api/types";
import { useApp } from "../state";
import { ProviderChip, SeverityChip, StatusChip, alertScopeFallback, typeLabel } from "./Chips";

/**
 * Agent-facing alert card. The server supplies localized text; this component
 * keeps language selection, readable hierarchy, and screen-reader semantics in
 * one place. It never renders an action that could move money or block access.
 */
export function InclusiveAlertCard({ alert }: { alert: AgentAlertSummary }) {
  const { t, language } = useApp();
  const explanation = alert.evidence.explanation[language] ?? alert.evidence.explanation.en;
  const suggestedAction = alert.evidence.suggestedAction[language] ?? alert.evidence.suggestedAction.en;
  const headingId = `alert-heading-${alert.id}`;

  return (
    <article id={`alert-card-${alert.id}`} tabIndex={-1} className="inclusive-alert-card" role={alert.severity === "high" ? "alert" : "status"} aria-labelledby={headingId}>
      <div className="inclusive-alert-head">
        <SeverityChip severity={alert.severity} t={t} />
        <h3 id={headingId}>{typeLabel(alert.type, t)}</h3>
        <StatusChip status={alert.status} t={t} />
      </div>
      <p className="inclusive-alert-explanation">{explanation}</p>
      <div className="callout">{suggestedAction}</div>
      <div className="inclusive-alert-meta">
        <ProviderChip providerId={alert.providerId} providerName={alert.providerName} fallback={alertScopeFallback(alert.type, t)} t={t} />
        <span>{t("confidence")} {(alert.confidence * 100).toFixed(0)}%</span>
      </div>
      <details>
        <summary>{t("evidence")}</summary>
        <dl className="inclusive-alert-signals">
          {Object.entries(alert.evidence.signals).map(([key, value]) => (
            <div key={key}>
              <dt>{key.replaceAll("_", " ")}</dt>
              <dd>{typeof value === "number" ? value.toLocaleString("en-US") : String(value)}</dd>
            </div>
          ))}
        </dl>
      </details>
    </article>
  );
}
