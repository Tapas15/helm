import { Hono } from "hono";
import { and, eq } from "drizzle-orm";
import { connectorAccounts, type Database } from "@helm/db";
import { HELM_ERROR_CODES } from "@helm/shared";
import type { AppEnv } from "../types.js";
import { DbCredentialBroker } from "../lib/vault.js";
import { isGoogleTokenExpired, refreshGoogleAccessToken, type GoogleToken } from "../lib/oauth.js";

const err = (code: string, message: string, retryable = false, details?: unknown) => ({ error: { code, message, retryable, ...(details !== undefined ? { details } : {}) } });

export async function getValidGoogleAccessToken(vault: DbCredentialBroker, userId: string, accountId: string): Promise<{ token: string | null; reason?: string }> {
  const raw = await vault.getSecretValue({ ownerUserId: userId, provider: "google", name: `google-oauth:${accountId}` });
  if (!raw) return { token: null, reason: "missing_secret" };
  let parsed: GoogleToken & Record<string, unknown>;
  try { parsed = JSON.parse(raw) as GoogleToken & Record<string, unknown>; } catch { return { token: null, reason: "invalid_secret" }; }
  const access = typeof parsed.access_token === "string" ? parsed.access_token : "";
  const refresh = typeof parsed.refresh_token === "string" ? parsed.refresh_token : "";
  if (access && !isGoogleTokenExpired(parsed)) return { token: access };
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!refresh || !clientId || !clientSecret) return { token: access || null, reason: refresh ? "missing_client_config" : "missing_refresh_token" };
  try {
    const refreshed = await refreshGoogleAccessToken({ clientId, clientSecret, refreshToken: refresh });
    const merged = { ...parsed, ...refreshed, refresh_token: refreshed.refresh_token ?? refresh, obtained_at: Date.now() };
    await vault.putSecret({ ownerUserId: userId, provider: "google", name: `google-oauth:${accountId}`, value: JSON.stringify(merged) });
    return { token: typeof merged.access_token === "string" ? merged.access_token : null };
  } catch (e) {
    return { token: access || null, reason: e instanceof Error ? e.message : "refresh_failed" };
  }
}

export function connectorAccountRoutes(db: Database) {
  const app = new Hono<AppEnv>();
  const vault = new DbCredentialBroker(db);

  app.get("/:id/status", async (c) => {
    const userId = c.get("userId");
    const id = c.req.param("id");
    const [account] = await db.select().from(connectorAccounts).where(and(eq(connectorAccounts.id, id), eq(connectorAccounts.userId, userId))).limit(1);
    if (!account) return c.json(err(HELM_ERROR_CODES.NOT_FOUND, "Connector account not found"), 404);
    const raw = await vault.getSecretValue({ ownerUserId: userId, provider: "google", name: `google-oauth:${id}` });
    let hasRefreshToken = false;
    let expiresAt: string | null = null;
    let scope: string | null = null;
    if (raw) {
      try {
        const token = JSON.parse(raw) as GoogleToken;
        hasRefreshToken = !!token.refresh_token;
        scope = typeof token.scope === "string" ? token.scope : null;
        if (token.obtained_at && token.expires_in) expiresAt = new Date(token.obtained_at + token.expires_in * 1000).toISOString();
      } catch {}
    }
    return c.json({ ok: true, account: { id: account.id, connectorId: account.connectorId, status: account.status, scopes: account.scopes, hasRefreshToken, expiresAt, scope, updatedAt: account.updatedAt } });
  });

  app.post("/:id/test", async (c) => {
    const userId = c.get("userId");
    const id = c.req.param("id");
    const [account] = await db.select().from(connectorAccounts).where(and(eq(connectorAccounts.id, id), eq(connectorAccounts.userId, userId))).limit(1);
    if (!account) return c.json(err(HELM_ERROR_CODES.NOT_FOUND, "Connector account not found"), 404);
    if (account.status !== "active") return c.json(err(HELM_ERROR_CODES.CONFLICT, "Connector account not active"), 409);
    const { token, reason } = await getValidGoogleAccessToken(vault, userId, id);
    if (!token) return c.json(err(HELM_ERROR_CODES.DEPENDENCY_ERROR, reason ?? "No valid token", false), 503);
    if (account.connectorId === "google-gmail") {
      const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/profile", { headers: { authorization: `Bearer ${token}` } });
      const json = await res.json().catch(() => null);
      if (!res.ok) return c.json(err(HELM_ERROR_CODES.DEPENDENCY_ERROR, json?.error?.message ?? "Gmail test failed", res.status >= 500), res.status as any);
      return c.json({ ok: true, connectorId: account.connectorId, profile: { emailAddress: json?.emailAddress ?? null, messagesTotal: json?.messagesTotal ?? null } });
    }
    return c.json({ ok: true, connectorId: account.connectorId, message: "No test implemented for connector" });
  });

  return app;
}
