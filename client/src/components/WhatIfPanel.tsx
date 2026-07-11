import { useEffect, useState } from "react";
import type { Role, WhatIf } from "../api/types";
import { api } from "../api/client";
import { useApp } from "../state";
import { LevelPill } from "./Chips";

/** Read-only demand stress test: recomputes pressure at a chosen multiplier. */
export function WhatIfPanel({ agentId, role }: { agentId: string; role: Role }) {
  const { t, providerId } = useApp();
  const [multiplier, setMultiplier] = useState(1.5);
  const [data, setData] = useState<WhatIf | null>(null);

  useEffect(() => {
    let live = true;
    const handle = setTimeout(() => {
      api
        .whatIf(agentId, multiplier, role, role === "provider_ops" ? providerId : undefined)
        .then((d) => live && setData(d))
        .catch(() => undefined);
    }, 150);
    return () => {
      live = false;
      clearTimeout(handle);
    };
  }, [agentId, multiplier, role, providerId]);

  return (
    <div className="card rise">
      <div className="eyebrow">{t("whatIf")}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <input
          type="range"
          className="whatif-slider"
          min={1}
          max={3}
          step={0.25}
          value={multiplier}
          onChange={(e) => setMultiplier(Number(e.target.value))}
          aria-label={t("whatIf")}
        />
        <span className="big-number" style={{ fontSize: 22 }}>
          {multiplier.toFixed(2)}×
        </span>
      </div>
      <div className="sub-note">{t("whatIfHint")}</div>

      {data && (
        <div className="whatif-compare">
          <div className="whatif-line">
            <span>{t("physicalCash")}</span>
            <LevelPill level={data.base.cashLevel} t={t} />
            <span className="arrow">→</span>
            <LevelPill level={data.scenario.cashLevel} t={t} />
          </div>
          {data.scenario.providers.map((p, i) => (
            <div className="whatif-line" key={p.providerId}>
              <span>
                {p.providerName} {t("eFloat")}
              </span>
              <LevelPill level={data.base.providers[i].level} t={t} />
              <span className="arrow">→</span>
              <LevelPill level={p.level} t={t} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
