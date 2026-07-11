import type { AgentLiquidity } from "../api/types";
import { formatTaka } from "../state";
import type { TFunc } from "../i18n/ui";
import { providerColor } from "./Chips";

/**
 * The signature element: one physical-cash pool rendered beside three
 * separate provider floats. Proportions are real; segments never merge.
 * Masked segments (other providers, for ops users) show a hatch and no number.
 */
export function DrawerBar({
  liq,
  compact = false,
  legend = true,
  t,
}: {
  liq: AgentLiquidity;
  compact?: boolean;
  legend?: boolean;
  t: TFunc;
}) {
  const cash = liq.physicalCash ?? 0;
  const known = cash + liq.providers.reduce((s, p) => s + (p.balance ?? 0), 0);
  const total = Math.max(known, 1);

  const seg = (value: number | null, masked: boolean) =>
    masked ? { flexGrow: 0, flexBasis: compact ? 14 : 26 } : { flexGrow: Math.max((value ?? 0) / total, 0.02) };

  return (
    <div>
      <div className={`drawer${compact ? " compact" : ""}`} role="img" aria-label={t("totalServiceable")}>
        <div
          className={`drawer-seg${liq.cashMasked ? " masked" : ""}`}
          style={{ ...seg(cash, liq.cashMasked), background: "var(--cash)" }}
          title={`${t("physicalCash")}: ${liq.cashMasked ? "—" : formatTaka(cash)}`}
        />
        {liq.providers.map((p) => (
          <div
            key={p.providerId}
            className={`drawer-seg${p.masked ? " masked" : ""}${p.stale ? " stale" : ""}`}
            style={{ ...seg(p.balance, p.masked), background: providerColor(p.providerId) }}
            title={`${p.providerName}: ${p.masked ? "—" : formatTaka(p.balance)}${p.stale ? ` (${t("unconfirmedFeed")})` : ""}`}
          />
        ))}
      </div>
      {legend && (
        <div className="drawer-legend">
          <span className="legend-item">
            <span className="legend-dot" style={{ background: "var(--cash)" }} />
            <span className="legend-name">{t("physicalCash")}</span>
            <span className="legend-value">{liq.cashMasked ? "—" : formatTaka(cash)}</span>
          </span>
          {liq.providers.map((p) => (
            <span className="legend-item" key={p.providerId}>
              <span className="legend-dot" style={{ background: providerColor(p.providerId) }} />
              <span className="legend-name">{p.providerName}</span>
              <span className="legend-value">{p.masked ? "—" : formatTaka(p.balance)}</span>
              {p.stale && <span className="stale-badge">{p.staleMinutes === null ? t(p.dataState === "missing" ? "feedMissing" : "feedInconsistent") : `${p.staleMinutes} ${t("minAgo")}`}</span>}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
