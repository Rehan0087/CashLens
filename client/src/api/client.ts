import type {
  AgentDetail,
  AgentLiquidity,
  AlertListItem,
  CaseAction,
  CaseDetail,
  Meta,
  MetricsReport,
  Observability,
  Overview,
  Role,
  Scenario,
  WhatIf,
  LiveSnapshot,
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
  meta: () => get<Meta>("/api/meta"),
  agents: (role: Role, providerId?: string, agentId?: string) =>
    get<AgentLiquidity[]>(`/api/agents?role=${role}${providerId ? `&providerId=${providerId}` : ""}${agentId ? `&agentId=${agentId}` : ""}`),
  agentDetail: (id: string, role: Role, providerId?: string) =>
    get<AgentDetail>(`/api/agents/${id}?role=${role}${providerId ? `&providerId=${providerId}` : ""}${role === "agent" ? `&agentId=${id}` : ""}`),
  alerts: (role: Role, opts: { providerId?: string; status?: string; agentId?: string } = {}) => {
    const params = new URLSearchParams({ role });
    if (opts.providerId) params.set("providerId", opts.providerId);
    if (opts.status) params.set("status", opts.status);
    if (opts.agentId) params.set("agentId", opts.agentId);
    return get<AlertListItem[]>(`/api/alerts?${params}`);
  },
  caseDetail: (id: string, role: Role, providerId?: string) =>
    get<CaseDetail>(`/api/alerts/${id}?role=${role}${providerId ? `&providerId=${providerId}` : ""}`),
  caseAction: async (id: string, action: CaseAction, role: Role, note: string, providerId?: string) => {
    const params = new URLSearchParams({ role });
    if (providerId) params.set("providerId", providerId);
    const res = await fetch(`/api/alerts/${id}/action?${params}`, {
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
  overview: () => get<Overview>("/api/overview"),
  scenarios: () => get<Scenario[]>("/api/scenarios"),
  metrics: () => get<MetricsReport>("/api/metrics"),
  observability: () => get<Observability>("/api/observability"),
  whatIf: (agentId: string, multiplier: number, role: Role, providerId?: string) =>
    get<WhatIf>(
      `/api/whatif/${agentId}?multiplier=${multiplier}&role=${role}${providerId ? `&providerId=${providerId}` : ""}`
    ),
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
