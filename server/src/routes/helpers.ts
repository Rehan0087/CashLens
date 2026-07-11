import type { Request } from "express";
import type { Role } from "../types.js";

const ROLES: Role[] = ["agent", "provider_ops", "risk_analyst", "financial_service_provider", "fsp_management"];

/**
 * Roles are simulated: the client sends its selected role as a query param.
 * This stands in for real authentication, which is out of scope for the
 * prototype — the point is that the API applies the boundary, not the UI.
 */
export function roleOf(req: Request): Role {
  const r = String(req.query.role ?? "");
  return (ROLES as string[]).includes(r) ? (r as Role) : "agent";
}

export function providerIdOf(req: Request): string | undefined {
  const p = req.query.providerId;
  return typeof p === "string" && p.length > 0 ? p : undefined;
}
