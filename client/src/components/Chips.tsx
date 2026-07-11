import type { AlertStatus, AlertType, PressureLevel, Severity } from "../api/types";
import type { TFunc } from "../i18n/ui";

export function providerColor(providerId: string | null | undefined): string {
  switch (providerId) {
    case "bkash":
      return "var(--bkash)";
    case "nagad":
      return "var(--nagad)";
    case "rocket":
      return "var(--rocket)";
    default:
      return "var(--mute)";
  }
}

export function SeverityChip({ severity, t }: { severity: Severity; t: TFunc }) {
  const key = severity === "high" ? "sevHigh" : severity === "medium" ? "sevMedium" : "sevLow";
  return <span className={`chip sev-${severity}`}>{t(key)}</span>;
}

export function StatusChip({ status, t }: { status: AlertStatus; t: TFunc }) {
  const key =
    status === "new" ? "statusNew" : status === "acknowledged" ? "statusAcknowledged" : status === "escalated" ? "statusEscalated" : "statusResolved";
  return <span className={`chip st-${status}`}>{t(key)}</span>;
}

export function ProviderChip({
  providerId,
  providerName,
  fallback,
  t,
}: {
  providerId: string | null;
  providerName: string | null;
  fallback?: string;
  t: TFunc;
}) {
  if (!providerId) return <span className="chip ghost">{fallback ?? t("scopeCross")}</span>;
  return (
    <span className="chip provider">
      <span className="dot" style={{ background: providerColor(providerId) }} />
      {providerName}
    </span>
  );
}

/** Scope label for alerts not tied to one provider: the shared cash drawer vs a cross-float pattern. */
export function alertScopeFallback(type: AlertType, t: TFunc): string {
  return type === "cross_provider_imbalance" ? t("scopeCross") : t("scopeCash");
}

export function LevelPill({ level, t }: { level: PressureLevel; t: TFunc }) {
  const key = level === "high" ? "levelHigh" : level === "medium" ? "levelMedium" : "levelLow";
  return <span className={`pill ${level}`}>{t(key)}</span>;
}

export function typeLabel(type: AlertType, t: TFunc): string {
  switch (type) {
    case "liquidity_pressure":
      return t("typeLiquidity");
    case "cross_provider_imbalance":
      return t("typeImbalance");
    case "unusual_transaction":
      return t("typeUnusual");
    case "data_quality":
      return t("typeDataQuality");
  }
}
