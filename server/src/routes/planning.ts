import { Router } from "express";
import { requireAuth } from "../auth.js";
import { computePlanningContext, maskPlanningForRole } from "../engine/planning.js";
import { roleOf, providerIdOf } from "./helpers.js";

export const planningRouter = Router();
planningRouter.use(requireAuth);

/**
 * Provider-aware operational context. It compares independent provider
 * e-money forecasts with the shared physical-cash forecast. It never merges
 * balances and never recommends an automatic movement between providers.
 */
planningRouter.get("/context", (req, res) => {
  const role = roleOf(req);
  if (role === "agent") return res.status(403).json({ error: "Planning context is available to operational and review roles only." });

  const context = computePlanningContext();
  res.json(maskPlanningForRole(context, role, providerIdOf(req)));
});
