import type { AlertEvidence } from "../api/types";
import type { TFunc } from "../i18n/ui";

/**
 * Visual for a volume-spike case: the agent's usual range (mean ± 3σ) as a
 * band, with the flagged transaction plotted against it. Makes the z-score
 * legible to a non-statistician in one glance.
 */
export function EvidenceBand({ evidence, t }: { evidence: AlertEvidence; t: TFunc }) {
  if (evidence.kind !== "volume_spike") return null;
  const mean = Number(evidence.signals.baseline_mean ?? 0);
  const std = Number(evidence.signals.baseline_stddev ?? 1);
  const amount = Number(evidence.signals.amount ?? 0);

  const lo = 0;
  const hi = Math.max(mean + 3 * std, amount) * 1.08;
  const X = (v: number) => ((v - lo) / (hi - lo)) * 440 + 10;
  const W = 460;
  const H = 64;
  const y = 26;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%" }} role="img" aria-label={t("evidence")}>
      <line x1={10} y1={y} x2={W - 10} y2={y} stroke="var(--line)" strokeWidth={2} />
      {/* usual range band: mean ± 3σ */}
      <rect x={X(Math.max(mean - 3 * std, 0))} y={y - 8} width={X(mean + 3 * std) - X(Math.max(mean - 3 * std, 0))} height={16} rx={8} fill="var(--cash)" opacity={0.18} />
      <line x1={X(mean)} y1={y - 11} x2={X(mean)} y2={y + 11} stroke="var(--cash)" strokeWidth={2} />
      {/* the flagged transaction */}
      <circle cx={X(amount)} cy={y} r={7} fill="var(--sev-high)" />
      <circle cx={X(amount)} cy={y} r={11} fill="none" stroke="var(--sev-high)" opacity={0.4} />
      <text x={X(mean)} y={y + 28} textAnchor="middle" fill="var(--faint)" style={{ font: "10px 'IBM Plex Mono', monospace" }}>
        {t("baseline")} ৳{Math.round(mean).toLocaleString()}
      </text>
      <text
        x={Math.min(X(amount), W - 60)}
        y={y - 16}
        textAnchor="middle"
        fill="var(--sev-high)"
        style={{ font: "600 11px 'IBM Plex Mono', monospace" }}
      >
        ৳{Math.round(amount).toLocaleString()}
      </text>
    </svg>
  );
}
