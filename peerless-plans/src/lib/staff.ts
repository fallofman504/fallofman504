import "server-only";
import crypto from "node:crypto";
import { cookies } from "next/headers";

export const ADMIN_COOKIE = "pp_admin";

const safeEqual = (a: string, b: string) => {
  const x = crypto.createHash("sha256").update(a).digest();
  const y = crypto.createHash("sha256").update(b).digest();
  return crypto.timingSafeEqual(x, y);
};

export const adminPasscode = () => process.env.ADMIN_PASSCODE?.trim() || null;
/** What the browser holds after signing in. Changing the passcode signs everyone out. */
export const adminToken = (passcode: string) => crypto.createHash("sha256").update(`peerless-admin:${passcode}`).digest("hex");
export const passcodeMatches = (given: string) => {
  const p = adminPasscode();
  return !!p && safeEqual(given, p);
};

/** The founder, signed in to the review queue. */
export async function isAdmin(): Promise<boolean> {
  // Read the cookie first so pages that call this are always rendered per request, never prebuilt.
  const cookie = (await cookies()).get(ADMIN_COOKIE)?.value;
  const p = adminPasscode();
  if (!p) return false;
  return !!cookie && safeEqual(cookie, adminToken(p));
}

/** A drafting agent calling with "Authorization: Bearer <AGENT_API_KEY>". */
export function isAgentRequest(req: Request): boolean {
  const key = process.env.AGENT_API_KEY?.trim();
  const given = /^Bearer (.+)$/.exec(req.headers.get("authorization") ?? "")?.[1];
  return !!key && !!given && safeEqual(given, key);
}

export const isStaff = async (req: Request) => isAgentRequest(req) || (await isAdmin());
export const unauthorized = () => Response.json({ error: "Unauthorized" }, { status: 401 });
