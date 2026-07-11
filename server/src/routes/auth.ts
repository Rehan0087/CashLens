import { Router } from "express";
import { authenticate, clearSessionCookie, createSession, logout, publicUser, requireAuth, userForRequest } from "../auth.js";

export const authRouter = Router();

authRouter.post("/login", (req, res) => {
  const username = typeof req.body?.username === "string" ? req.body.username.trim() : "";
  const password = typeof req.body?.password === "string" ? req.body.password : "";
  if (!username || !password) return res.status(400).json({ error: "Username and password are required." });

  const user = authenticate(username, password);
  if (!user) return res.status(401).json({ error: "Invalid username or password." });

  const token = createSession(user);
  res.setHeader("Set-Cookie", `cashlens_session=${encodeURIComponent(token)}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${8 * 60 * 60}`);
  res.json({ user: publicUser(user) });
});

authRouter.get("/me", requireAuth, (req, res) => {
  res.json({ user: publicUser(req.user!) });
});

authRouter.post("/logout", (req, res) => {
  userForRequest(req);
  logout(req);
  clearSessionCookie(res);
  res.json({ ok: true });
});
