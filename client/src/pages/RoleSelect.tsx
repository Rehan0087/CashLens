import type { Language, Role } from "../api/types";
import { useApp } from "../state";
import { ThemeToggle } from "../components/ThemeToggle";

const LANGS: Array<{ id: Language; label: string }> = [
  { id: "en", label: "EN" },
  { id: "bn", label: "বাংলা" },
  { id: "banglish", label: "Banglish" },
];

export function RoleSelect() {
  const { setRole, language, setLanguage, setLiveOpen, t } = useApp();

  const roles: Array<{ id: Role; icon: string; name: string; desc: string }> = [
    { id: "agent", icon: "🏪", name: t("roleAgent"), desc: t("roleAgentDesc") },
    { id: "provider_ops", icon: "🛰️", name: t("roleOps"), desc: t("roleOpsDesc") },
    { id: "risk_analyst", icon: "🔍", name: t("roleRisk"), desc: t("roleRiskDesc") },
    { id: "financial_service_provider", icon: "🏦", name: t("roleFsp"), desc: t("roleFspDesc") },
    { id: "fsp_management", icon: "🗺️", name: t("roleMgmt"), desc: t("roleMgmtDesc") },
  ];

  return (
    <div className="role-screen">
      <div className="role-controls">
        <ThemeToggle />
        <div className="lang-toggle" role="group" aria-label="Language">
          {LANGS.map((l) => (
            <button key={l.id} className={language === l.id ? "active" : ""} onClick={() => setLanguage(l.id)}>
              {l.label}
            </button>
          ))}
        </div>
      </div>

      <div className="role-hero rise">
        <div className="logo-mark">৳</div>
        <h1>CashLens</h1>
        <div className="tag">{t("tagline")}</div>
        <div className="sub">{t("pickRole")}</div>
      </div>

      <div className="role-grid">
        {roles.map((r) => (
          <button key={r.id} className="role-card rise" onClick={() => setRole(r.id)}>
            <span className="icon">{r.icon}</span>
            <span className="name">{r.name}</span>
            <span className="desc">{r.desc}</span>
          </button>
        ))}
        <div className="role-card customer-card rise" aria-disabled="true">
          <span className="icon">👥</span>
          <span className="name">
            {t("roleCustomers")} <span className="beneficiary-tag">{t("customersBeneficiary")}</span>
          </span>
          <span className="desc">{t("roleCustomersDesc")}</span>
        </div>
      </div>

      <div className="customers-note rise">{t("customersNote")}</div>

      <button className="scenarios-cta live-cta rise" onClick={() => setLiveOpen(true)}>
        <span className="icon">◉</span>
        <span>
          <strong>{t("liveFeedNav")}</strong>
          <span className="desc">{t("liveFeedSubtitle")}</span>
        </span>
        <span className="arrow">→</span>
      </button>

      <div className="role-foot">{t("syntheticFooter")}</div>
    </div>
  );
}
