import "server-only";
import crypto from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { db } from "./db";
import type { Role, User } from "./types";

const COOKIE = "sq_session";
const SESSION_DAYS = 30;

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64);
  return `scrypt$${salt.toString("hex")}$${hash.toString("hex")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, saltHex, hashHex] = stored.split("$");
  if (scheme !== "scrypt" || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, "hex");
  const actual = crypto.scryptSync(password, Buffer.from(saltHex, "hex"), expected.length);
  return crypto.timingSafeEqual(actual, expected);
}

const sha = (s: string) => crypto.createHash("sha256").update(s).digest("hex");

export function roleForEmail(email: string): Role {
  const admins = (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return admins.includes(email.toLowerCase()) ? "admin" : "customer";
}

export async function startSession(userId: string) {
  const token = crypto.randomBytes(32).toString("base64url");
  const expires = Date.now() + SESSION_DAYS * 86400_000;
  db().prepare("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)").run(sha(token), userId, expires);
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production" && !process.env.INSECURE_COOKIES,
    path: "/",
    expires: new Date(expires),
  });
}

export async function endSession() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) db().prepare("DELETE FROM sessions WHERE token_hash = ?").run(sha(token));
  jar.delete(COOKIE);
}

/** The signed-in user, or null. Deduped per request. */
export const getUser = cache(async (): Promise<User | null> => {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const row = db()
    .prepare(
      `SELECT u.id, u.email, u.name, u.phone, u.role FROM sessions s
       JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ?`,
    )
    .get(sha(token), Date.now()) as User | undefined;
  return row ?? null;
});

export async function requireUser(next?: string): Promise<User> {
  const user = await getUser();
  if (!user) redirect(next ? `/login?next=${encodeURIComponent(next)}` : "/login");
  return user;
}

export async function requireAdmin(): Promise<User> {
  const user = await requireUser("/admin");
  if (user.role !== "admin") redirect("/dashboard");
  return user;
}

/** True when the request carries the back-end agents' API key. */
export function isAgentRequest(req: Request): boolean {
  const key = process.env.AGENT_API_KEY;
  if (!key) return false;
  const given = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const a = Buffer.from(sha(given));
  const b = Buffer.from(sha(key));
  return crypto.timingSafeEqual(a, b);
}

/** Only allow same-site relative redirects after login. */
export function safeNext(next: unknown): string {
  const s = typeof next === "string" ? next : "";
  return s.startsWith("/") && !s.startsWith("//") && !s.includes("\\") ? s : "/dashboard";
}

// ---------- failed-login pause ----------
export const MAX_LOGIN_FAILS = 5;
export const LOGIN_PAUSE_MINUTES = 15;

type Attempts = { fails: number; last_failed_at: number; locked_until: number | null };
const attempts = (email: string) => db().prepare("SELECT fails, last_failed_at, locked_until FROM login_attempts WHERE email = ?").get(email) as Attempts | undefined;

/** Minutes left on a login pause for this email, or 0 if login is allowed. */
export function loginPauseMinutes(email: string): number {
  const until = attempts(email)?.locked_until ?? 0;
  return until > Date.now() ? Math.ceil((until - Date.now()) / 60_000) : 0;
}

/**
 * Records a failed login and returns how many failures in a row that makes.
 * Tracked per email whether or not an account exists, so the response never reveals which emails are registered.
 */
export function recordLoginFailure(email: string): number {
  const now = Date.now();
  const row = attempts(email);
  // A streak ends after a quiet period or once a pause has been served.
  const stale = !row || now - row.last_failed_at > LOGIN_PAUSE_MINUTES * 60_000 || (row.locked_until != null && row.locked_until <= now);
  const fails = stale ? 1 : row.fails + 1;
  const lockedUntil = fails >= MAX_LOGIN_FAILS ? now + LOGIN_PAUSE_MINUTES * 60_000 : null;
  db()
    .prepare(
      `INSERT INTO login_attempts (email, fails, last_failed_at, locked_until) VALUES (?, ?, ?, ?)
       ON CONFLICT(email) DO UPDATE SET fails = excluded.fails, last_failed_at = excluded.last_failed_at, locked_until = excluded.locked_until`,
    )
    .run(email, fails, now, lockedUntil);
  return fails;
}

export function clearLoginFailures(email: string) {
  db().prepare("DELETE FROM login_attempts WHERE email = ?").run(email);
}

// ---------- password reset ----------
export const RESET_LINK_MINUTES = 60;

/** Creates a single-use reset token, or returns null if this account has asked too often in the last hour. */
export function createPasswordReset(userId: string): string | null {
  const now = Date.now();
  db().prepare("DELETE FROM password_resets WHERE expires_at < ?").run(now);
  const recent = db().prepare("SELECT COUNT(*) AS n FROM password_resets WHERE user_id = ? AND created_at > ?").get(userId, now - 3600_000) as { n: number };
  if (recent.n >= 3) return null;
  const token = crypto.randomBytes(32).toString("base64url");
  db().prepare("INSERT INTO password_resets (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)").run(sha(token), userId, now, now + RESET_LINK_MINUTES * 60_000);
  return token;
}

export function userIdForResetToken(token: string): string | null {
  const row = db().prepare("SELECT user_id FROM password_resets WHERE token_hash = ? AND expires_at > ?").get(sha(token), Date.now()) as { user_id: string } | undefined;
  return row?.user_id ?? null;
}

/** Sets the new password, signs the account out everywhere, and lifts any login pause. */
export function resetPassword(token: string, password: string): boolean {
  return db().transaction(() => {
    const userId = userIdForResetToken(token);
    if (!userId) return false;
    const user = db().prepare("SELECT email FROM users WHERE id = ?").get(userId) as { email: string };
    db().prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(hashPassword(password), userId);
    db().prepare("DELETE FROM password_resets WHERE user_id = ?").run(userId);
    db().prepare("DELETE FROM sessions WHERE user_id = ?").run(userId);
    clearLoginFailures(user.email);
    return true;
  })();
}
