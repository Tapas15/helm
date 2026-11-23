import { and, eq, gt, isNull } from "drizzle-orm";
import { sessions, type Database } from "@helm/db";
import { createHash } from "node:crypto";

const DEFAULT_DEV_USER_ID = "usr_local_dev";
const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export type ResolvedAuth =
  | { ok: true; userId: string; method: "session_token" | "dev_header"; sessionId?: string }
  | { ok: false; status: 401; message: string };

export async function resolveAuth(db: Database, opts: { authorization?: string | null; xUserId?: string | null; token?: string | null; requireAuth?: boolean; allowDev?: boolean }): Promise<ResolvedAuth> {
  const requireAuth = opts.requireAuth ?? process.env.HELM_REQUIRE_AUTH === "1";
  const allowDev = opts.allowDev ?? process.env.HELM_ALLOW_DEV_AUTH === "1";
  const devUserId = process.env.HELM_AUTH_DEV_USER_ID ?? DEFAULT_DEV_USER_ID;
  const authHeader = opts.authorization?.trim();
  const bearer = authHeader?.toLowerCase().startsWith("bearer ") ? authHeader.slice(7).trim() : "";
  const token = bearer || opts.token?.trim() || "";
  if (token) {
    const tokenHash = hashToken(token);
    const now = new Date();
    const [row] = await db.select({ id: sessions.id, userId: sessions.userId }).from(sessions)
      .where(and(eq(sessions.tokenHash, tokenHash), isNull(sessions.revokedAt), gt(sessions.expiresAt, now))).limit(1);
    if (row) {
      await db.update(sessions).set({ lastSeenAt: now }).where(eq(sessions.id, row.id));
      return { ok: true, userId: row.userId, method: "session_token", sessionId: row.id };
    }
    return { ok: false, status: 401, message: "Invalid or expired session token" };
  }
  const header = opts.xUserId?.trim();
  const devAllowed = allowDev && !requireAuth;
  const userId = header && devAllowed ? header : (!requireAuth && devAllowed ? devUserId : "");
  if (!userId) return { ok: false, status: 401, message: "Authentication required" };
  return { ok: true, userId, method: "dev_header" };
}

export function hashSessionToken(token: string) { return hashToken(token); }
