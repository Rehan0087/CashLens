import type { Language, LocalizedText } from "../api/types";
import { useApp } from "../state";

function pickText(lt: LocalizedText, lang: Language) {
  return lt[lang] ?? lt.en;
}

/**
 * Persistent banner shown on a role view while a guided scenario is active.
 * Keeps the judge oriented: which scenario, what to notice, and a way back.
 */
export function ScenarioBanner() {
  const { activeScenario, language, t, setScenariosOpen, setActiveScenario, setFocusCaseId } = useApp();
  if (!activeScenario) return null;

  return (
    <div className="scenario-banner rise">
      <span className="scenario-banner-badge">{activeScenario.id}</span>
      <div className="scenario-banner-body">
        <div className="scenario-banner-title">
          <span className="eyebrow" style={{ margin: 0 }}>
            {t("scenarioActive")} {activeScenario.id}
          </span>
          {pickText(activeScenario.title, language)}
        </div>
        <div className="scenario-banner-notice">{pickText(activeScenario.whatToNotice, language)}</div>
      </div>
      <div className="scenario-banner-actions">
        <button className="btn" onClick={() => setScenariosOpen(true)}>
          ← {t("scenarioBackToList")}
        </button>
        <button
          className="btn ghost-btn"
          onClick={() => {
            setActiveScenario(null);
            setFocusCaseId(null);
          }}
        >
          {t("scenarioExit")}
        </button>
      </div>
    </div>
  );
}
