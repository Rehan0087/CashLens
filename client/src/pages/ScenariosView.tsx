import { useEffect, useState } from "react";
import type { Language, LocalizedText, Scenario } from "../api/types";
import { api } from "../api/client";
import { useApp } from "../state";

function pickText(lt: LocalizedText, lang: Language) {
  return lt[lang] ?? lt.en;
}

const SCENARIO_ACCENT: Record<string, string> = {
  A: "var(--bkash)",
  B: "var(--sev-high)",
  C: "var(--nagad)",
  D: "var(--rocket)",
};

export function ScenariosView() {
  const { t, language, user, openScenario } = useApp();
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    api.scenarios().then(setScenarios).catch(() => setError(t("dataUnavailable")));
  }, [t]);

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="page-title">{t("scenariosTitle")}</div>
          <div className="page-sub">{t("scenariosSub")}</div>
        </div>
      </div>

      {error && <div className="callout warn">{error}</div>}

      <div className="scenario-grid">
        {scenarios.map((s) => (
          <div className="scenario-card rise" key={s.id} style={{ ["--accent" as string]: SCENARIO_ACCENT[s.id] }}>
            <div className="scenario-card-head">
              <span className="scenario-badge" style={{ background: SCENARIO_ACCENT[s.id] }}>{s.id}</span>
              <div className="scenario-title">{pickText(s.title, language)}</div>
            </div>

            <p className="scenario-brief">{pickText(s.brief, language)}</p>

            <div className="scenario-notice">
              <span className="eyebrow" style={{ marginBottom: 4 }}>{t("scenarioWhatToNotice")}</span>
              {pickText(s.whatToNotice, language)}
            </div>

            {s.facts.length > 0 && (
              <div className="scenario-facts">
                {s.facts.map((f, i) => (
                  <div className="scenario-fact" key={i}>
                    <span className="k">{pickText(f.label, language)}</span>
                    <span className="v">{f.value}</span>
                  </div>
                ))}
              </div>
            )}

            <div className="scenario-card-foot">
              {s.available && s.target.role === user?.role ? (
                <button className="btn primary" onClick={() => openScenario(s)}>{t("scenarioOpen")} →</button>
              ) : s.available ? (
                <span className="chip ghost">{t("scenarioRoleRequired")}</span>
              ) : (
                <span className="chip ghost">{t("scenarioUnavailable")}</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
