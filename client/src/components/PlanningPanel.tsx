import { useEffect, useState } from "react";
import type { PlanningContext } from "../api/types";
import { api } from "../api/client";
import { formatTaka, useApp } from "../state";
import { LevelPill, providerColor } from "./Chips";

function duration(minutes: number | null) {
  if (minutes === null) return "—";
  if (minutes < 60) return `${minutes}m`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

function constraintLabel(value: string, t: (key: string) => string) {
  if (value === "provider_e_money") return t("providerEFloat");
  if (value === "shared_physical_cash") return t("sharedPhysicalCash");
  if (value === "insufficient_data") return t("insufficientData");
  return t("noShortageHorizon");
}

export function PlanningPanel() {
  const { t } = useApp();
  const [context, setContext] = useState<PlanningContext | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api.planningContext().then(setContext).catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  if (error) return <div className="card callout warn">{error}</div>;
  if (!context) return <div className="card muted">{t("loading")}</div>;

  return (
    <div className="card rise planning-panel">
      <div className="page-head" style={{ marginBottom: 10 }}>
        <div>
          <div className="eyebrow" style={{ marginBottom: 3 }}>{t("planningTitle")}</div>
          <div className="muted" style={{ fontSize: 12 }}>{t("planningSub")}</div>
        </div>
        <span className="pill low">{t("advisoryOnly")}</span>
      </div>

      <div className="planning-summary">
        <div className="planning-summary-item">
          <span className="muted">{t("sharedPhysicalCash")}</span>
          <strong>{context.sharedCash.exactValuesMasked ? t("planningMasked") : formatTaka(context.sharedCash.totalPhysicalCash)}</strong>
          <small>{t("runsOutIn")} {duration(context.sharedCash.shortageMinutes)}</small>
        </div>
        <div className="planning-summary-item">
          <span className="muted">{t("projectedOutflow")}</span>
          <strong>{context.sharedCash.exactValuesMasked ? "—" : formatTaka(context.sharedCash.projectedOutflow)}</strong>
          <small><LevelPill level={context.sharedCash.level} t={t} /></small>
        </div>
      </div>

      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th>Provider</th>
              <th>{t("providerEFloat")}</th>
              <th>{t("projectedNeed")}</th>
              <th>{t("runsOutIn")}</th>
              <th>{t("bindingConstraint")}</th>
            </tr>
          </thead>
          <tbody>
            {context.providers.map((provider) => {
              const constraint = context.constraints.find((item) => item.providerId === provider.providerId);
              return (
                <tr key={provider.providerId}>
                  <td>
                    <span className="chip provider"><span className="dot" style={{ background: providerColor(provider.providerId) }} />{provider.providerName}</span>
                    <div className="muted" style={{ fontSize: 11 }}>{provider.agentCount} {t("agents")}</div>
                  </td>
                  <td>{provider.exactValuesMasked ? "—" : formatTaka(provider.totalBalance)}</td>
                  <td>{provider.exactValuesMasked ? "—" : formatTaka(provider.projectedInflowNeed)}</td>
                  <td>{duration(provider.shortageMinutes)}</td>
                  <td>
                    <LevelPill level={provider.level} t={t} />
                    <div className="muted" style={{ fontSize: 11 }}>{constraintLabel(constraint?.bindingConstraint ?? "insufficient_data", t)}</div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
