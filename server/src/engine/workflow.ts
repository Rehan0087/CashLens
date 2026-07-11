import type { AlertStatus, AlertType, Role } from "../types.js";

export type CaseAction = "acknowledge" | "escalate" | "resolve";

/**
 * Authority separation, enforced server-side:
 * - Provider ops acknowledge and escalate; they may close operational alerts
 *   (liquidity, imbalance, data quality) but NEVER unusual-transaction cases.
 * - Risk analysts are the only role that can resolve an escalated case, and
 *   the only role that can close an unusual-transaction alert.
 * - Agents and FSP management observe; they act outside the system.
 */
export function allowedActions(status: AlertStatus, role: Role, type: AlertType): CaseAction[] {
  if (role === "provider_ops") {
    const opsCanResolve = type !== "unusual_transaction";
    if (status === "new") return ["acknowledge", "escalate", ...(opsCanResolve ? (["resolve"] as CaseAction[]) : [])];
    if (status === "acknowledged") return ["escalate", ...(opsCanResolve ? (["resolve"] as CaseAction[]) : [])];
    return [];
  }
  if (role === "risk_analyst") {
    return status === "escalated" ? ["resolve"] : [];
  }
  return [];
}

export function nextStatus(action: CaseAction): AlertStatus {
  switch (action) {
    case "acknowledge":
      return "acknowledged";
    case "escalate":
      return "escalated";
    case "resolve":
      return "resolved";
  }
}

/** Escalation hands the case to the risk analyst queue. */
export function nextAssignedRole(action: CaseAction, current: string): string {
  if (action === "escalate") return "risk_analyst";
  return current;
}

/** Escalating and resolving require a written reason — the audit trail is the product. */
export function noteRequired(action: CaseAction): boolean {
  return action === "escalate" || action === "resolve";
}
