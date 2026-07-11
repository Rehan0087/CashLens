import type { PressureLevel } from "../api/types";
import type { TFunc } from "../i18n/ui";

const LEVEL_COLOR: Record<PressureLevel, string> = {
  low: "var(--ok)",
  medium: "var(--sev-med)",
  high: "var(--sev-high)",
};

/** Half-circle gauge: projected demand vs capacity. 1.0 = demand equals capacity. */
export function PressureDial({ score, level, t }: { score: number; level: PressureLevel; t: TFunc }) {
  // Pressure can exceed capacity internally, but the user-facing score is a
  // bounded 0–100% indicator. The level still remains high when score > 1.
  const boundedScore = Math.max(0, Math.min(score, 1));
  const frac = boundedScore;
  const r = 70;
  const cx = 90;
  const cy = 88;
  const circumference = Math.PI * r;

  const levelKey = level === "high" ? "levelHigh" : level === "medium" ? "levelMedium" : "levelLow";

  return (
    <svg viewBox="0 0 180 110" style={{ width: "100%", maxWidth: 230 }} role="img" aria-label={`${t("cashOutPressure")}: ${t(levelKey)}`}>
      <path
        d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
        fill="none"
        stroke="var(--panel-2)"
        strokeWidth="14"
        strokeLinecap="round"
      />
      <path
        d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
        fill="none"
        stroke={LEVEL_COLOR[level]}
        strokeWidth="14"
        strokeLinecap="round"
        strokeDasharray={`${frac * circumference} ${circumference}`}
        style={{ transition: "stroke-dasharray 0.6s cubic-bezier(0.2,0.7,0.3,1), stroke 0.3s" }}
      />
      {/* capacity marker at score = 1.0 */}
      <line
        x1={cx + (r - 12) * Math.cos(0)}
        y1={cy - (r - 12) * Math.sin(0)}
        x2={cx + (r + 12) * Math.cos(0)}
        y2={cy - (r + 12) * Math.sin(0)}
        stroke="var(--faint)"
        strokeWidth="1.5"
        strokeDasharray="3 3"
      />
      <text
        x={cx}
        y={cy - 14}
        textAnchor="middle"
        fill="var(--paper)"
        style={{ font: "700 26px Sora, sans-serif", fontVariantNumeric: "tabular-nums" }}
      >
        {Math.round(boundedScore * 100)}%
      </text>
      <text x={cx} y={cy + 4} textAnchor="middle" fill={LEVEL_COLOR[level]} style={{ font: "600 11px 'IBM Plex Sans', sans-serif", textTransform: "uppercase", letterSpacing: "0.08em" }}>
        {t(levelKey)}
      </text>
    </svg>
  );
}
