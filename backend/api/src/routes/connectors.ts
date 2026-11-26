import { Hono } from "hono";
import { and, eq, gt, isNull } from "drizzle-orm";
import { connectorAccounts, oauthStates, auditLog, type Database } from "@helm/db";
import { HELM_ERROR_CODES, OAuthStartInput } from "@helm/shared";
import type { AppEnv } from "../types.js";
import { DbCredentialBroker, encryptVaultValue, decryptVaultValue, saveGoogleToken } from "../lib/vault.js";
import { buildGoogleAuthUrl, buildPkce, randomBase64Url, sha256Base64Url } from "../lib/oauth.js";

const uid = (p: string) => `${p}_${crypto.randomUUID().replace(/-/g, "")}`;
const err = (code: string, message: string, retryable = false, details?: unknown) => ({ error: { code, message, retryable, ...(details !== undefined ? { details } : {}) } });
const SENSITIVE_KEYS = new Set(["authorization", "cookie", "set-cookie", "password", "passwd", "secret", "token", "accesstoken", "refreshtoken", "apikey", "credential", "credentials", "privatekey", "clientsecret", "sessiontoken", "vaultkey", "encryptedvalue", "pkceverifier", "pkceverifierencrypted"]);
const redactConnectorValue = (value: unknown, keyHint = ""): unknown => {
  const lower = keyHint.toLowerCase();
  if (SENSITIVE_KEYS.has(lower)) return "[REDACTED]";
  if (lower.includes("path") && typeof value === "string" && (/^[/\\]/.test(value) || /^[A-Za-z]:[\\/]/.test(value))) return "[REDACTED_PATH]";
  if (Array.isArray(value)) return value.map((v) => redactConnectorValue(v));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, redactConnectorValue(v, k)]));
  return value;
};
const safeConnectorAccount = (row: any, extra?: Record<string, unknown>) => ({
  id: row.id,
  userId: row.userId,
  connectorId: row.connectorId,
  status: row.status,
  scopes: Array.isArray(row.scopes) ? row.scopes : [],
  metadata: redactConnectorValue(row.metadata ?? {}),
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
  ...(extra ?? {}),
});

const CONNECTORS = [
  { id: "google-gmail", kind: "oauth", displayName: "Gmail (Google)", capabilities: ["gmail.read", "gmail.send"], scopes: ["https://www.googleapis.com/auth/gmail.readonly", "https://www.googleapis.com/auth/gmail.send"], enabled: true },
  { id: "google-calendar", kind: "oauth", displayName: "Google Calendar", capabilities: ["calendar.read", "calendar.write"], scopes: ["https://www.googleapis.com/auth/calendar.readonly", "https://www.googleapis.com/auth/calendar.events"], enabled: true },
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
  return { ...(json as Record<string, unknown>), obtained_at: Date.now() } as Record<string, unknown>;
}

export function connectorRoutes(db: Database) {
  const app = new Hono<AppEnv>();
  const vault = new DbCredentialBroker(db);

  app.get("/", (c) => c.json({ connectors: CONNECTORS }));

  app.get("/accounts", async (c) => {
    const userId = c.get("userId");
    const rows = await db.select().from(connectorAccounts).where(eq(connectorAccounts.userId, userId));
    const accounts = await Promise.all(rows.map(async (row) => {
      const raw = await vault.getSecretValue({ ownerUserId: userId, provider: "google", name: `google-oauth:${row.id}` });
      let hasRefreshToken = false;
      let expiresAt: string | null = null;
      let tokenExpired = false;
      if (raw) {
        try {
          const token = JSON.parse(raw) as Record<string, unknown>;
          hasRefreshToken = !!token.refresh_token;
          const obtained = Number(token.obtained_at ?? 0);
          const expiresIn = Number(token.expires_in ?? 0);
          if (obtained && expiresIn) {
            const exp = obtained + expiresIn * 1000;
            expiresAt = new Date(exp).toISOString();
            tokenExpired = Date.now() + 60_000 >= exp;
          }
        } catch {}
      }
      return safeConnectorAccount(row, { hasRefreshToken, expiresAt, tokenExpired });
    }));
    return c.json({ accounts });
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
    const webUrl = process.env.WEB_URL ?? "http://localhost:5173";
    const redirectToWeb = (params: Record<string, string>) => {
      const url = new URL(webUrl);
      for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
      return c.redirect(url.toString(), 302);
    };
    const state = c.req.query("state");
    const code = c.req.query("code");
    const error = c.req.query("error");
    if (error) return redirectToWeb({ oauth: "error", message: `OAuth error: ${error}` });
    if (!state || !code) return redirectToWeb({ oauth: "error", message: "state and code required" });
    const stateHash = sha256Base64Url(state);
    const [row] = await db.select().from(oauthStates).where(and(eq(oauthStates.stateHash, stateHash), isNull(oauthStates.consumedAt), gt(oauthStates.expiresAt, new Date()))).limit(1);
    if (!row) return redirectToWeb({ oauth: "error", message: "OAuth state not found/expired" });
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    if (!clientId || !clientSecret) return redirectToWeb({ oauth: "error", message: "Google OAuth client not configured" });
    const verifier = decryptVaultValue(row.pkceVerifierEncrypted);
    try {
      const token = await exchangeGoogleCode({ code, clientId, clientSecret, redirectUri: row.redirectUri, codeVerifier: verifier });
      await db.update(oauthStates).set({ consumedAt: new Date() }).where(eq(oauthStates.id, row.id));
      const accountId = uid("conn");
      await saveGoogleToken(vault, row.userId, accountId, token, { connectorId: row.connectorId, scopes: row.scopes });
      const secretRef = await vault.getSecretRef({ ownerUserId: row.userId, provider: "google", name: `google-oauth:${accountId}` });
      await db.insert(connectorAccounts).values({ id: accountId, userId: row.userId, connectorId: row.connectorId, status: "active", secretRefId: secretRef?.id ?? null, scopes: row.scopes, metadata: { tokenType: (token as any).token_type ?? null, hasRefreshToken: !!(token as any).refresh_token }, createdAt: new Date(), updatedAt: new Date() });
      await db.insert(auditLog).values({ id: uid("aud"), userId: row.userId, ts: new Date(), actorType: "user", actorId: row.userId, action: "connector.oauth.callback", resourceType: "connector_account", resourceId: accountId, decision: "allow", reason: "oauth_callback", metadata: { connectorId: row.connectorId, scopes: row.scopes } });
      return redirectToWeb({ oauth: "success", accountId, connectorId: row.connectorId });
    } catch (e) {
      const message = e instanceof Error ? e.message : "OAuth callback failed";
      return redirectToWeb({ oauth: "error", message });
    }
  });

  app.post("/accounts/:id/revoke", async (c) => {
    const userId = c.get("userId");
    const id = c.req.param("id");
    const [row] = await db.select().from(connectorAccounts).where(and(eq(connectorAccounts.id, id), eq(connectorAccounts.userId, userId))).limit(1);
    if (!row) return c.json(err(HELM_ERROR_CODES.NOT_FOUND, "Connector account not found"), 404);
    const token = await vault.getSecretValue({ ownerUserId: userId, provider: "google", name: `google-oauth:${id}` });
    let revokeOk = false;
    if (token) {
      try {
        const parsed = JSON.parse(token) as Record<string, unknown>;
        const revokeToken = (parsed.refresh_token ?? parsed.access_token) as string | undefined;
        if (revokeToken) {
          const revokeBase = process.env.GOOGLE_REVOKE_BASE ?? "https://oauth2.googleapis.com/revoke";
          const rr = await fetch(`${revokeBase}?token=${encodeURIComponent(revokeToken)}`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" } }).catch(() => null);
          revokeOk = !!rr?.ok;
        }
      } catch {}
    }
    await db.update(connectorAccounts).set({ status: "revoked", updatedAt: new Date() }).where(eq(connectorAccounts.id, id));
    if (row.secretRefId) await vault.revokeSecret({ ownerUserId: userId, secretId: row.secretRefId, reason: "user_revoke" });
    await db.insert(auditLog).values({ id: uid("aud"), userId, ts: new Date(), actorType: "user", actorId: userId, action: "connector.account.revoke", resourceType: "connector_account", resourceId: id, decision: "allow", reason: "user_requested", metadata: { providerRevoked: revokeOk } });
    return c.json({ ok: true, accountId: id, status: "revoked", providerRevoked: revokeOk });
  });

  return app;
}
