import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import type { Request, RequestHandler, Response } from "express";
import { db } from "./db/index.js";
import type { Role } from "./types.js";

const SESSION_COOKIE = "cashlens_session";
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const DEMO_PASSWORD = "cashlens-demo";

export interface AuthUser {
  id: string;
  username: string;
  displayName: string;
  role: Role;
  providerId: string | null;
  agentId: string | null;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
      sessionToken?: string;
    }
  }
}

interface UserRow {
  id: string;
  username: string;
  display_name: string;
  password_hash: string;
  role: Role;
  provider_id: string | null;
  agent_id: string | null;
}

function hashPassword(password: string, salt = randomBytes(16).toString("hex")): string {
  return `${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
}

function passwordMatches(password: string, stored: string): boolean {
  const [salt, expectedHex] = stored.split(":");
  if (!salt || !expectedHex) return false;
  const actual = scryptSync(password, salt, 64);
  const expected = Buffer.from(expectedHex, "hex");
  return expected.length === actual.length && timingSafeEqual(actual, expected);
}

function tokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function userFromRow(row: UserRow): AuthUser {
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    role: row.role,
    providerId: row.provider_id,
    agentId: row.agent_id,
  };
}

function cookieValue(req: Request, name: string): string | null {
  const cookies = req.headers.cookie?.split(";") ?? [];
  const prefix = `${name}=`;
  const item = cookies.map((cookie) => cookie.trim()).find((cookie) => cookie.startsWith(prefix));
  return item ? decodeURIComponent(item.slice(prefix.length)) : null;
}

export function clearSessionCookie(res: Response) {
  res.setHeader("Set-Cookie", `${SESSION_COOKIE}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0`);
}

export function publicUser(user: AuthUser) {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    role: user.role,
    providerId: user.providerId,
    agentId: user.agentId,
  };
}

export function authenticate(username: string, password: string): AuthUser | null {
  const row = db.prepare("SELECT id, username, display_name, password_hash, role, provider_id, agent_id FROM users WHERE username = ?").get(username) as UserRow | undefined;
  return row && passwordMatches(password, row.password_hash) ? userFromRow(row) : null;
}

export function createSession(user: AuthUser): string {
  const token = randomBytes(32).toString("base64url");
  const now = new Date();
  const expires = new Date(now.getTime() + SESSION_TTL_MS);
  db.prepare("DELETE FROM sessions WHERE expires_at <= ?").run(now.toISOString());
  db.prepare("INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)").run(tokenHash(token), user.id, expires.toISOString(), now.toISOString());
  return token;
}

export function userForRequest(req: Request): AuthUser | null {
  const token = cookieValue(req, SESSION_COOKIE);
  if (!token) return null;
  const row = db.prepare(
    `SELECT u.id, u.username, u.display_name, u.password_hash, u.role, u.provider_id, u.agent_id
     FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = ? AND s.expires_at > ?`
  ).get(tokenHash(token), new Date().toISOString()) as UserRow | undefined;
  if (!row) return null;
  req.sessionToken = token;
  const user = userFromRow(row);
  req.user = user;
  return user;
}

export const requireAuth: RequestHandler = (req, res, next) => {
  if (userForRequest(req)) return next();
  res.status(401).json({ error: "Authentication required." });
};

export function logout(req: Request) {
  if (req.sessionToken) db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(tokenHash(req.sessionToken));
}

/** Seed-only demo identities. All use the same documented synthetic password. */
export function ensureDemoUsers() {
  const createdAt = new Date().toISOString();
  const users = [
    ["user-agent-demo", "agent.demo", "Demo agent", "agent", null, null],
    ["user-ops-bkash", "ops.bkash", "bKash operations", "provider_ops", "bkash", null],
    ["user-risk-demo", "risk.reviewer", "Risk reviewer", "risk_analyst", null, null],
    ["user-fsp-bkash", "fsp.bkash", "bKash provider", "financial_service_provider", "bkash", null],
    ["user-management", "management", "Operations management", "fsp_management", null, null],
  ] as const;
  const insert = db.prepare(
    `INSERT OR IGNORE INTO users (id, username, display_name, password_hash, role, provider_id, agent_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  );
  for (const [id, username, displayName, role, providerId, agentId] of users) {
    insert.run(id, username, displayName, hashPassword(DEMO_PASSWORD), role, providerId, agentId, createdAt);
  }
}

export function demoPassword(): string {
  return DEMO_PASSWORD;
}
