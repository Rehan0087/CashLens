import type { HourFlow } from "../api/types";
import type { TFunc } from "../i18n/ui";

/** Grouped bars of today's cash-in (green) vs cash-out (pink) per hour. */
export function HourlyBars({ timeline, t }: { timeline: HourFlow[]; t: TFunc }) {
  if (timeline.length === 0) return <div className="muted">{t("loading")}</div>;

  const W = 460;
  const H = 130;
  const padB = 18;
  const max = Math.max(...timeline.map((h) => Math.max(h.cashIn, h.cashOut)), 1);
  const slot = W / timeline.length;
  const barW = Math.min(14, slot / 2.6);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%" }} role="img" aria-label={t("todaysFlow")}>
      {timeline.map((h, i) => {
        const x = i * slot + slot / 2;
        const inH = (h.cashIn / max) * (H - padB - 8);
        const outH = (h.cashOut / max) * (H - padB - 8);
        return (
          <g key={h.hour}>
            <rect x={x - barW - 1.5} y={H - padB - inH} width={barW} height={inH} rx={2.5} fill="var(--cash)" opacity={0.9}>
              <title>{`${String(h.hour).padStart(2, "0")}:00 cash-in ৳${h.cashIn.toLocaleString()}`}</title>
            </rect>
            <rect x={x + 1.5} y={H - padB - outH} width={barW} height={outH} rx={2.5} fill="var(--sev-high)" opacity={0.85}>
              <title>{`${String(h.hour).padStart(2, "0")}:00 cash-out ৳${h.cashOut.toLocaleString()}`}</title>
            </rect>
            <text x={x} y={H - 4} textAnchor="middle" fill="var(--faint)" style={{ font: "10px 'IBM Plex Mono', monospace" }}>
              {String(h.hour).padStart(2, "0")}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
