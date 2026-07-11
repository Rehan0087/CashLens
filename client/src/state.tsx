import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Language, Meta, Role, Scenario } from "./api/types";
import { api } from "./api/client";
import { makeT, type TFunc } from "./i18n/ui";

export type Theme = "dark" | "light";

function savedTheme(): Theme {
  const stored = localStorage.getItem("cashlens.theme");
  return stored === "light" || stored === "dark" ? stored : "dark";
}

interface AppState {
  role: Role | null;
  setRole: (r: Role | null) => void;
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
  // Guided demonstration scenarios (A–D)
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
  const [role, setRole] = useState<Role | null>(null);
  const [language, setLanguage] = useState<Language>((localStorage.getItem("cashlens.lang") as Language) ?? "en");
  const [theme, setTheme] = useState<Theme>(savedTheme);
  const [providerId, setProviderId] = useState("bkash");
  const [agentId, setAgentId] = useState("");
  const [meta, setMeta] = useState<Meta | null>(null);
  const [scenariosOpen, setScenariosOpen] = useState(false);
  const [activeScenario, setActiveScenario] = useState<Scenario | null>(null);
  const [focusCaseId, setFocusCaseId] = useState<string | null>(null);
  const [liveOpen, setLiveOpen] = useState(false);

  // Deep-link a guided scenario to the exact role/agent/case that exhibits it.
  const openScenario = (s: Scenario) => {
    setActiveScenario(s);
    if (s.target.providerId) setProviderId(s.target.providerId);
    if (s.target.agentId) setAgentId(s.target.agentId);
    setFocusCaseId(s.target.caseId ?? null);
    setRole(s.target.role);
    setScenariosOpen(false);
    setLiveOpen(false);
  };

  useEffect(() => {
    api.meta().then((m) => {
      setMeta(m);
      // Default demo agent: one with an engineered story beats a random quiet one.
      if (m.agents.length > 0) setAgentId((prev) => prev || m.agents[4]?.id || m.agents[0].id);
    });
  }, []);

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
    role,
    setRole,
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
    focusCaseId,
    setFocusCaseId,
    liveOpen,
    setLiveOpen,
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
