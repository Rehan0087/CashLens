import type {
  AgentDetail,
  AgentLiquidity,
  FeedbackOutcome,
  AlertListItem,
  CaseAction,
  CaseDetail,
  Meta,
  MetricsReport,
  Observability,
  Overview,
  PlanningContext,
  Role,
  Scenario,
  WhatIf,
  LiveSnapshot,
  AuthUser,
} from "./types";

async function get<T>(path: string): Promise<T> {
  const res = await fetch(path);
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  login: async (username: string, password: string) => {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(body.error ?? "Sign in failed");
    }
    return res.json() as Promise<{ user: AuthUser }>;
  },
  me: () => get<{ user: AuthUser }>("/api/auth/me"),
  logout: async () => {
    await fetch("/api/auth/logout", { method: "POST" });
  },
  meta: () => get<Meta>("/api/meta"),
  agents: (_role: Role, _providerId?: string, _agentId?: string) => get<AgentLiquidity[]>("/api/agents"),
  agentDetail: (id: string, _role: Role, _providerId?: string) => get<AgentDetail>(`/api/agents/${id}`),
  alerts: (role: Role, opts: { providerId?: string; status?: string; agentId?: string } = {}) => {
    const params = new URLSearchParams();
    if (opts.status) params.set("status", opts.status);
    if (role === "agent" && opts.agentId) params.set("agentId", opts.agentId);
    return get<AlertListItem[]>(`/api/alerts${params.toString() ? `?${params}` : ""}`);
  },
  caseDetail: (id: string, _role: Role, _providerId?: string) => get<CaseDetail>(`/api/alerts/${id}`),
  caseAction: async (id: string, action: CaseAction, _role: Role, note: string, _providerId?: string) => {
    const res = await fetch(`/api/alerts/${id}/action`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, note }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(body.error ?? `Action failed (${res.status})`);
    }
    return res.json() as Promise<{ ok: true; id: string; status: string }>;
  },
  caseFeedback: async (id: string, outcome: FeedbackOutcome, note: string) => {
    const res = await fetch(`/api/alerts/${id}/feedback`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ outcome, note }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(body.error ?? `Feedback failed (${res.status})`);
    }
    return res.json() as Promise<{ ok: true; id: string; outcome: FeedbackOutcome; ruleVersion: string }>;
  },
  overview: () => get<Overview>("/api/overview"),
  planningContext: () => get<PlanningContext>("/api/planning/context"),
  scenarios: () => get<Scenario[]>("/api/scenarios"),
  metrics: () => get<MetricsReport>("/api/metrics"),
  observability: () => get<Observability>("/api/observability"),
  whatIf: (agentId: string, multiplier: number, _role: Role, _providerId?: string) => get<WhatIf>(`/api/whatif/${agentId}?multiplier=${multiplier}`),
  liveSnapshot: () => get<LiveSnapshot>("/api/live-feed/snapshot"),
  liveControl: async (action: "pause" | "resume" | "inject_liquidity_drain" | "inject_anomaly_attack") => {
    const res = await fetch("/api/live-feed/control", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    if (!res.ok) throw new Error("Live stream control failed");
    return res.json() as Promise<{ ok: true; snapshot: LiveSnapshot }>;
  },
};
