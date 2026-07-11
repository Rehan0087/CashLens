import { formatSimTime, useApp } from "./state";
import { RoleSelect } from "./pages/RoleSelect";
import { AgentView } from "./pages/AgentView";
import { OpsView } from "./pages/OpsView";
import { RiskView } from "./pages/RiskView";
import { FspView } from "./pages/FspView";
import { MgmtView } from "./pages/MgmtView";
import { ScenariosView } from "./pages/ScenariosView";
import { ScenarioBanner } from "./components/ScenarioBanner";
import { ThemeToggle } from "./components/ThemeToggle";
import { LiveFeedView } from "./pages/LiveFeedView";

export default function App() {
  const { user, authLoading, logout, language, setLanguage, meta, t, scenariosOpen, setScenariosOpen, liveOpen, setLiveOpen } = useApp();

  if (authLoading) return <div className="auth-loading">{t("loading")}</div>;
  if (!user && liveOpen) {
    return (
      <div className="shell public-live-shell">
        <main className="main">
          <button className="app-brand" type="button" onClick={() => setLiveOpen(false)} aria-label={t("backToLanding")}>
            <span className="logo-mark">৳</span>
            <span>
              <div className="logo-name">CashLens</div>
              <div className="logo-tag">{t("tagline")}</div>
            </span>
          </button>
          <LiveFeedView />
        </main>
      </div>
    );
  }
  if (!user) return <RoleSelect />;

  const backToLanding = () => { void logout(); };

  return (
    <div className="shell">
      <main className="main">
        <header className="app-bar">
          <button className="app-brand" type="button" onClick={backToLanding} aria-label={t("backToLanding")} title={t("backToLanding")}>
            <span className="logo-mark">৳</span>
            <span>
              <div className="logo-name">CashLens</div>
              <div className="logo-tag">{t("tagline")}</div>
            </span>
          </button>

          <div className="app-bar-actions">
            {meta && <span className="sim-chip">{t("simulated")} · {formatSimTime(meta.simNow)}</span>}
            <span className="user-chip">{user.displayName}</span>
            {user.role === "agent" && (
              <button className={`btn app-nav-btn${scenariosOpen ? " active" : ""}`} onClick={() => { setScenariosOpen(true); setLiveOpen(false); }}>
                <span aria-hidden="true">🎬</span> {t("guidedScenarios")}
              </button>
            )}
            <button className={`btn app-nav-btn${liveOpen ? " active" : ""}`} onClick={() => { setLiveOpen(true); setScenariosOpen(false); }}>
              <span aria-hidden="true">◉</span> {t("liveFeedNav")}
            </button>
            <ThemeToggle />
            <div className="lang-toggle" role="group" aria-label="Language">
              {(["en", "bn", "banglish"] as const).map((id) => (
                <button key={id} className={language === id ? "active" : ""} onClick={() => setLanguage(id)}>
                  {id === "bn" ? "বাংলা" : id === "banglish" ? "Banglish" : "EN"}
                </button>
              ))}
            </div>
          </div>
        </header>

        {liveOpen ? (
          <LiveFeedView />
        ) : scenariosOpen ? (
          <ScenariosView />
        ) : (
          <>
            <ScenarioBanner />
            {user.role === "agent" && <AgentView />}
            {user.role === "provider_ops" && <OpsView />}
            {user.role === "risk_analyst" && <RiskView />}
            {user.role === "financial_service_provider" && <FspView />}
            {user.role === "fsp_management" && <MgmtView />}
          </>
        )}
      </main>
    </div>
  );
}
