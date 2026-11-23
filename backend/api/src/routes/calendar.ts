import { Hono } from "hono";
import { and, eq } from "drizzle-orm";
import { connectorAccounts, auditLog, type Database } from "@helm/db";
import { HELM_ERROR_CODES } from "@helm/shared";
import type { AppEnv } from "../types.js";
import { DbCredentialBroker } from "../lib/vault.js";
import { getValidGoogleAccessToken } from "./connector-accounts.js";

const uid = (p: string) => `${p}_${crypto.randomUUID().replace(/-/g, "")}`;
const err = (code: string, message: string, retryable = false, details?: unknown) => ({ error: { code, message, retryable, ...(details !== undefined ? { details } : {}) } });

export function calendarRoutes(db: Database) {
  const app = new Hono<AppEnv>();
  const vault = new DbCredentialBroker(db);

  app.get("/accounts/:accountId/events", async (c) => {
    const userId = c.get("userId");
    const accountId = c.req.param("accountId");
    const [account] = await db.select().from(connectorAccounts).where(and(eq(connectorAccounts.id, accountId), eq(connectorAccounts.userId, userId))).limit(1);
    if (!account) return c.json(err(HELM_ERROR_CODES.NOT_FOUND, "Connector account not found"), 404);
    if (account.connectorId !== "google-calendar" || account.status !== "active") return c.json(err(HELM_ERROR_CODES.CONFLICT, "Calendar account not active"), 409);
    const token = await getValidGoogleAccessToken(vault, userId, accountId);
    if (!token.token) return c.json(err(HELM_ERROR_CODES.NOT_FOUND, token.reason ?? "Calendar token not found"), 404);
    const maxResults = Math.min(Number(c.req.query("maxResults") ?? 10), 25);
    const timeMin = c.req.query("timeMin") ?? new Date().toISOString();
    const url = new URL("https://www.googleapis.com/calendar/v3/calendars/primary/events");
    url.searchParams.set("maxResults", String(maxResults));
    url.searchParams.set("singleEvents", "true");
    url.searchParams.set("orderBy", "startTime");
    url.searchParams.set("timeMin", timeMin);
    const res = await fetch(url, { headers: { authorization: `Bearer ${token.token}` } });
    const json = await res.json().catch(() => null);
    if (!res.ok) return c.json(err(HELM_ERROR_CODES.DEPENDENCY_ERROR, json?.error?.message ?? "Calendar read failed", res.status >= 500), res.status as any);
    await db.insert(auditLog).values({ id: uid("aud"), userId, ts: new Date(), actorType: "user", actorId: userId, action: "calendar.read", resourceType: "connector_account", resourceId: accountId, decision: "allow", reason: "read_first", metadata: { maxResults, timeMin } });
    return c.json({ ok: true, events: json?.items ?? [], nextPageToken: json?.nextPageToken ?? null });
  });

  return app;
}
