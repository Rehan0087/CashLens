import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { AuthUser, Language, Meta, Role, Scenario } from "./api/types";
import { api } from "./api/client";
import { makeT, type TFunc } from "./i18n/ui";

export type Theme = "dark" | "light";

function savedTheme(): Theme {
  const stored = localStorage.getItem("cashlens.theme");
  return stored === "light" || stored === "dark" ? stored : "dark";
}

interface AppState {
  user: AuthUser | null;
  authLoading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  role: Role | null;
  language: Language;
  setLanguage: (l: Language) => void;
  theme: Theme;
  setTheme: (theme: Theme) => void;
  providerId: string;
  setProviderId: (p: string) => void;
  agentId: string;
  setAgentId: (a: string) => void;
  meta: Meta | null;
  t: TFunc;
  scenariosOpen: boolean;
  setScenariosOpen: (open: boolean) => void;
  activeScenario: Scenario | null;
  setActiveScenario: (s: Scenario | null) => void;
  liveOpen: boolean;
  setLiveOpen: (open: boolean) => void;
  focusCaseId: string | null;
  setFocusCaseId: (id: string | null) => void;
  openScenario: (s: Scenario) => void;
}

const Ctx = createContext<AppState | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [language, setLanguage] = useState<Language>((localStorage.getItem("cashlens.lang") as Language) ?? "en");
  const [theme, setTheme] = useState<Theme>(savedTheme);
  const [providerId, setProviderId] = useState("bkash");
  const [agentId, setAgentId] = useState("");
  const [meta, setMeta] = useState<Meta | null>(null);
  const [scenariosOpen, setScenariosOpen] = useState(false);
  const [activeScenario, setActiveScenario] = useState<Scenario | null>(null);
  const [focusCaseId, setFocusCaseId] = useState<string | null>(null);
  const [liveOpen, setLiveOpen] = useState(false);

  useEffect(() => {
    api.me()
      .then(({ user: currentUser }) => {
        setUser(currentUser);
        setProviderId(currentUser.providerId ?? "bkash");
        setAgentId(currentUser.agentId ?? "");
      })
      .catch(() => setUser(null))
      .finally(() => setAuthLoading(false));
  }, []);

  useEffect(() => {
    if (!user) {
      setMeta(null);
      return;
    }
    api.meta().then((m) => {
      setMeta(m);
      if (!user.agentId) setAgentId((prev) => prev || m.agents[4]?.id || m.agents[0]?.id || "");
    });
  }, [user]);

  const login = async (username: string, password: string) => {
    const result = await api.login(username, password);
    setUser(result.user);
    setProviderId(result.user.providerId ?? "bkash");
    setAgentId(result.user.agentId ?? "");
    setScenariosOpen(false);
    setLiveOpen(false);
    setAuthLoading(false);
  };

  const logout = async () => {
    await api.logout();
    setUser(null);
    setMeta(null);
    setScenariosOpen(false);
    setLiveOpen(false);
    setActiveScenario(null);
    setFocusCaseId(null);
  };

  // A scenario cannot change the authenticated user's role. Cross-role scenarios
  // require signing in as the target role from the landing page.
  const openScenario = (s: Scenario) => {
    if (!user || s.target.role !== user.role) return;
    setActiveScenario(s);
    if (s.target.providerId && (!user.providerId || s.target.providerId === user.providerId)) setProviderId(s.target.providerId);
    if (s.target.agentId && (!user.agentId || s.target.agentId === user.agentId)) setAgentId(s.target.agentId);
    setFocusCaseId(s.target.caseId ?? null);
    setScenariosOpen(false);
    setLiveOpen(false);
  };

  useEffect(() => {
    localStorage.setItem("cashlens.lang", language);
  }, [language]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    localStorage.setItem("cashlens.theme", theme);
  }, [theme]);

  const t = useMemo(() => makeT(language), [language]);
  const value: AppState = {
    user,
    authLoading,
    login,
    logout,
    role: user?.role ?? null,
    language,
    setLanguage,
    theme,
    setTheme,
    providerId,
    setProviderId,
    agentId,
    setAgentId,
    meta,
    t,
    scenariosOpen,
    setScenariosOpen,
    activeScenario,
    setActiveScenario,
    liveOpen,
    setLiveOpen,
    focusCaseId,
    setFocusCaseId,
    openScenario,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp(): AppState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useApp outside provider");
  return v;
}

export function formatTaka(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  return `৳${Math.round(n).toLocaleString("en-US")}`;
}

export function formatSimTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}
