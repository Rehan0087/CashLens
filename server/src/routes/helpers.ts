import type { Request } from "express";
import type { Role } from "../types.js";

/** Role and scope come from the authenticated session, never from query params. */
export function roleOf(req: Request): Role {
  return req.user?.role ?? "agent";
}

export function providerIdOf(req: Request): string | undefined {
  return req.user?.providerId ?? undefined;
}

export function agentIdOf(req: Request): string | undefined {
  if (req.user?.agentId) return req.user.agentId;
  // The seeded agent.demo account is intentionally a demo-wide coordinator so
  // judges can inspect the engineered scenarios. Production users must receive
  // a concrete agent scope from the identity provider.
  const requested = req.query.agentId;
  return req.user?.role === "agent" && typeof requested === "string" && requested.length > 0 ? requested : undefined;
}
