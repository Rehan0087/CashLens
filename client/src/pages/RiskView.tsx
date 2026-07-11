import { useCallback, useEffect, useState } from "react";
import type { AlertListItem, Language } from "../api/types";
import { api } from "../api/client";
import { useApp } from "../state";
import { CasePanel } from "../components/CasePanel";
import { SeverityChip, StatusChip, typeLabel } from "../components/Chips";
import { PlanningPanel } from "../components/PlanningPanel";

function pickText(lt: { en: string; bn: string; banglish: string }, lang: Language) {
  return lt[lang] ?? lt.en;
}

export function RiskView() {
  const { t, language } = useApp();
  const [cases, setCases] = useState<AlertListItem[]>([]);
  const [selected, setSelected] = useState<string | null>(null);

  const reload = useCallback(() => {
    api.alerts("risk_analyst").then((rows) => {
      setCases(rows);
      setSelected((prev) => prev ?? rows.find((r) => r.status === "escalated")?.id ?? rows[0]?.id ?? null);
    });
  }, []);

  useEffect(reload, [reload]);

  const queue = cases.filter((c) => c.status === "escalated");
  const closed = cases.filter((c) => c.status === "resolved");

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="page-title">{t("roleRisk")}</div>
          <div className="page-sub">{t("riskQueueNote")}</div>
        </div>
      </div>

      <div className="grid risk-layout">
        <PlanningPanel />
        <div style={{ display: "grid", gap: 12 }}>
          <div className="card rise">
            <div className="eyebrow">
              {t("escalatedCases")} · {queue.length}
            </div>
            {queue.length === 0 && <div className="muted">{t("noAlerts")}</div>}
            {queue.map((c) => (
              <button
                key={c.id}
                className="alert-row"
                style={{ width: "100%", textAlign: "left", background: selected === c.id ? "var(--panel-2)" : "transparent", borderRadius: 8, padding: "10px 8px" }}
                onClick={() => setSelected(c.id)}
              >
                <SeverityChip severity={c.severity} t={t} />
                <div className="body">
                  <strong style={{ fontSize: 12.5 }}>{typeLabel(c.type, t)}</strong>
                  <div className="muted" style={{ fontSize: 11.5 }}>
                    {c.agentName} · {c.area}
                  </div>
                  <div className="exp" style={{ fontSize: 12, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
                    {pickText(c.evidence.explanation, language)}
                  </div>
                </div>
              </button>
            ))}
          </div>

          {closed.length > 0 && (
            <div className="card rise">
              <div className="eyebrow">{t("statusResolved")} · {closed.length}</div>
              {closed.map((c) => (
                <button
                  key={c.id}
                  className="alert-row"
                  style={{ width: "100%", textAlign: "left", background: selected === c.id ? "var(--panel-2)" : "transparent", borderRadius: 8, padding: "8px" }}
                  onClick={() => setSelected(c.id)}
                >
                  <StatusChip status={c.status} t={t} />
                  <div className="body">
                    <strong style={{ fontSize: 12.5 }}>{typeLabel(c.type, t)}</strong>
                    <div className="muted" style={{ fontSize: 11.5 }}>{c.agentName}</div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {selected ? (
          <CasePanel caseId={selected} role="risk_analyst" onChanged={reload} inline />
        ) : (
          <div className="card muted">{t("noAlerts")}</div>
        )}
      </div>
    </div>
  );
}
