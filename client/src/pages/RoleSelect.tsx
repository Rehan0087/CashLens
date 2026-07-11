import { useState } from "react";
import type { FormEvent } from "react";
import type { Language, Role } from "../api/types";
import { useApp } from "../state";
import { ThemeToggle } from "../components/ThemeToggle";

const LANGS: Array<{ id: Language; label: string }> = [
  { id: "en", label: "EN" },
  { id: "bn", label: "বাংলা" },
  { id: "banglish", label: "Banglish" },
];

const DEMO_USERS: Array<{ username: string; role: Role; label: string }> = [
  { username: "agent.demo", role: "agent", label: "Multi-provider agent" },
  { username: "ops.bkash", role: "provider_ops", label: "bKash operations" },
  { username: "risk.reviewer", role: "risk_analyst", label: "Risk reviewer" },
  { username: "fsp.bkash", role: "financial_service_provider", label: "bKash provider" },
  { username: "management", role: "fsp_management", label: "Operations management" },
];

export function RoleSelect() {
  const { language, setLanguage, login, setLiveOpen, t } = useApp();
  const [username, setUsername] = useState("agent.demo");
  const [password, setPassword] = useState("cashlens-demo");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await login(username, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("invalidCredentials"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="role-screen login-screen">
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
        <div className="sub">{t("loginSubtitle")}</div>
      </div>

      <form className="login-card rise" onSubmit={submit}>
        <div className="eyebrow">{t("loginTitle")}</div>
        <label className="login-field">
          <span>{t("username")}</span>
          <input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" required />
        </label>
        <label className="login-field">
          <span>{t("password")}</span>
          <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required />
        </label>
        {error && <div className="callout warn login-error" role="alert">{error}</div>}
        <button className="btn primary login-submit" type="submit" disabled={busy}>
          {busy ? t("signingIn") : t("signIn")}
        </button>
        <div className="login-hint">{t("demoPasswordHint")}</div>
      </form>

      <div className="demo-users rise">
        <div className="eyebrow">{t("demoAccounts")}</div>
        <div className="demo-user-grid">
          {DEMO_USERS.map((demo) => (
            <button key={demo.username} type="button" className="demo-user" onClick={() => { setUsername(demo.username); setPassword("cashlens-demo"); }}>
              <strong>{demo.label}</strong>
              <span>{demo.username}</span>
            </button>
          ))}
        </div>
      </div>

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
