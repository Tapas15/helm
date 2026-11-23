import { Hono } from "hono";
import { and, eq, gt, isNull } from "drizzle-orm";
import { connectorAccounts, oauthStates, auditLog, type Database } from "@helm/db";
import { HELM_ERROR_CODES, OAuthStartInput } from "@helm/shared";
import type { AppEnv } from "../types.js";
import { DbCredentialBroker, encryptVaultValue, decryptVaultValue } from "../lib/vault.js";
import { buildGoogleAuthUrl, buildPkce, randomBase64Url, sha256Base64Url } from "../lib/oauth.js";

const uid = (p: string) => `${p}_${crypto.randomUUID().replace(/-/g, "")}`;
const err = (code: string, message: string, retryable = false, details?: unknown) => ({ error: { code, message, retryable, ...(details !== undefined ? { details } : {}) } });

const CONNECTORS = [
  { id: "google-gmail", kind: "oauth", displayName: "Gmail (Google)", capabilities: ["gmail.read", "gmail.send"], scopes: ["https://www.googleapis.com/auth/gmail.readonly"], enabled: true },
  { id: "google-calendar", kind: "oauth", displayName: "Google Calendar", capabilities: ["calendar.read", "calendar.write"], scopes: ["https://www.googleapis.com/auth/calendar.readonly"], enabled: true },
] as const;

async function exchangeGoogleCode(input: { code: string; clientId: string; clientSecret: string; redirectUri: string; codeVerifier: string }) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code: input.code,
      client_id: input.clientId,
      client_secret: input.clientSecret,
      redirect_uri: input.redirectUri,
      grant_type: "authorization_code",
      code_verifier: input.codeVerifier,
    }),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(json?.error_description ?? json?.error ?? `Google token exchange failed (${res.status})`);
  return json as { access_token: string; refresh_token?: string; expires_in?: number; scope?: string; token_type?: string };
}

export function connectorRoutes(db: Database) {
  const app = new Hono<AppEnv>();
  const vault = new DbCredentialBroker(db);

  app.get("/", (c) => c.json({ connectors: CONNECTORS }));

  app.get("/accounts", async (c) => {
    const userId = c.get("userId");
    const rows = await db.select().from(connectorAccounts).where(eq(connectorAccounts.userId, userId));
    return c.json({ accounts: rows });
  });

  app.post("/oauth/start", async (c) => {
    const userId = c.get("userId");
    const body = await c.req.json().catch(() => ({}));
    const parsed = OAuthStartInput.safeParse(body);
    if (!parsed.success) return c.json(err(HELM_ERROR_CODES.VALIDATION_ERROR, "Invalid OAuth start input", false, parsed.error.flatten()), 400);
    const connector = CONNECTORS.find((x) => x.id === parsed.data.connectorId);
    if (!connector) return c.json(err(HELM_ERROR_CODES.NOT_FOUND, "Connector not found"), 404);
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const redirectUri = parsed.data.redirectUri ?? process.env.GOOGLE_REDIRECT_URI ?? "http://localhost:8787/v1/connectors/google/callback";
    if (!clientId) return c.json(err(HELM_ERROR_CODES.DEPENDENCY_ERROR, "GOOGLE_CLIENT_ID not configured", false), 503);
    const scopes = parsed.data.scopes.length ? parsed.data.scopes : [...connector.scopes];
    const state = randomBase64Url(24);
    const pkce = buildPkce();
    const id = uid("oauth");
    const now = new Date();
    await db.insert(oauthStates).values({
      id, userId, connectorId: connector.id, stateHash: sha256Base64Url(state), pkceVerifierEncrypted: encryptVaultValue(pkce.verifier),
      redirectUri, scopes, expiresAt: new Date(now.getTime() + 10 * 60_000), createdAt: now,
    });
    const url = buildGoogleAuthUrl({ clientId, redirectUri, state, codeChallenge: pkce.challenge, scopes });
    await db.insert(auditLog).values({ id: uid("aud"), userId, ts: now, actorType: "user", actorId: userId, action: "connector.oauth.start", resourceType: "connector", resourceId: connector.id, decision: "allow", reason: "user_requested", metadata: { scopes, redirectUri } });
    return c.json({ ok: true, connectorId: connector.id, authUrl: url, stateId: id, expiresAt: new Date(now.getTime() + 10 * 60_000).toISOString() });
  });

  app.get("/google/callback", async (c) => {
    const state = c.req.query("state");
    const code = c.req.query("code");
    const error = c.req.query("error");
    if (error) return c.json(err(HELM_ERROR_CODES.DEPENDENCY_ERROR, `OAuth error: ${error}`, false), 400);
    if (!state || !code) return c.json(err(HELM_ERROR_CODES.VALIDATION_ERROR, "state and code required", false), 400);
    const stateHash = sha256Base64Url(state);
    const [row] = await db.select().from(oauthStates).where(and(eq(oauthStates.stateHash, stateHash), isNull(oauthStates.consumedAt), gt(oauthStates.expiresAt, new Date()))).limit(1);
    if (!row) return c.json(err(HELM_ERROR_CODES.NOT_FOUND, "OAuth state not found/expired"), 404);
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    if (!clientId || !clientSecret) return c.json(err(HELM_ERROR_CODES.DEPENDENCY_ERROR, "Google OAuth client not configured", false), 503);
    const verifier = decryptVaultValue(row.pkceVerifierEncrypted);
    const token = await exchangeGoogleCode({ code, clientId, clientSecret, redirectUri: row.redirectUri, codeVerifier: verifier });
    await db.update(oauthStates).set({ consumedAt: new Date() }).where(eq(oauthStates.id, row.id));
    const accountId = uid("conn");
    const secretName = `google-oauth:${accountId}`;
    const secretRef = await vault.putSecret({ ownerUserId: row.userId, provider: "google", name: secretName, value: JSON.stringify(token), metadata: { connectorId: row.connectorId, scopes: row.scopes } });
    await db.insert(connectorAccounts).values({ id: accountId, userId: row.userId, connectorId: row.connectorId, status: "active", secretRefId: secretRef.id, scopes: row.scopes, metadata: { tokenType: token.token_type ?? null, hasRefreshToken: !!token.refresh_token }, createdAt: new Date(), updatedAt: new Date() });
    await db.insert(auditLog).values({ id: uid("aud"), userId: row.userId, ts: new Date(), actorType: "user", actorId: row.userId, action: "connector.oauth.callback", resourceType: "connector_account", resourceId: accountId, decision: "allow", reason: "oauth_callback", metadata: { connectorId: row.connectorId, scopes: row.scopes } });
    return c.json({ ok: true, accountId, connectorId: row.connectorId, status: "active" });
  });

  app.post("/accounts/:id/revoke", async (c) => {
    const userId = c.get("userId");
    const id = c.req.param("id");
    const [row] = await db.select().from(connectorAccounts).where(and(eq(connectorAccounts.id, id), eq(connectorAccounts.userId, userId))).limit(1);
    if (!row) return c.json(err(HELM_ERROR_CODES.NOT_FOUND, "Connector account not found"), 404);
    await db.update(connectorAccounts).set({ status: "revoked", updatedAt: new Date() }).where(eq(connectorAccounts.id, id));
    if (row.secretRefId) await vault.revokeSecret({ ownerUserId: userId, secretId: row.secretRefId, reason: "user_revoke" });
    await db.insert(auditLog).values({ id: uid("aud"), userId, ts: new Date(), actorType: "user", actorId: userId, action: "connector.account.revoke", resourceType: "connector_account", resourceId: id, decision: "allow", reason: "user_requested", metadata: {} });
    return c.json({ ok: true, accountId: id, status: "revoked" });
  });

  return app;
}
