import { Hono } from "hono";
import { and, desc, eq } from "drizzle-orm";
import { connectorAccounts, identities, identityPolicies, type Database } from "@helm/db";
import { HELM_ERROR_CODES, IdentityClass } from "@helm/shared";
import type { AppEnv } from "../types.js";
import { redactSensitive } from "../lib/redaction.js";

const uid = (p: string) => `${p}_${crypto.randomUUID().replace(/-/g, "")}`;
const err = (code: string, message: string, retryable = false, details?: unknown) => ({ error: { code, message, retryable, ...(details !== undefined ? { details } : {}) } });
const redactIdentityValue = (value: unknown) => redactSensitive(value);
const safeConnectorAccount = (row: any) => ({
  id: row.id, userId: row.userId, connectorId: row.connectorId, status: row.status,
  scopes: Array.isArray(row.scopes) ? row.scopes : [],
  metadata: redactIdentityValue(row.metadata ?? {}),
  createdAt: row.createdAt, updatedAt: row.updatedAt,
});
const safeIdentity = (row: any) => row ? ({
  id: row.id, userId: row.userId, class: row.class, label: row.label, email: row.email, provider: row.provider,
  scopes: Array.isArray(row.scopes) ? row.scopes : [],
  status: row.status,
  metadata: redactIdentityValue(row.metadata ?? {}),
  createdAt: row.createdAt, updatedAt: row.updatedAt,
}) : row;

export function identityRoutes(db: Database) {
  const app = new Hono<AppEnv>();
  app.get("/status", async (c) => {
    const userId = c.get("userId");
    const rows = await db.select().from(identities).where(eq(identities.userId, userId)).orderBy(desc(identities.createdAt)).limit(20);
    return c.json({
      ok: true,
      defaultIdentityClass: "helm-owned",
      personalCredentialSharing: false,
      identities: rows.map(safeIdentity),
      delegated: { supported: false, note: "User-delegated bridge requires explicit approval and narrow scopes; not enabled by default." },
    });
  });
  app.get("/", async (c) => {
    const userId = c.get("userId");
    const rows = await db.select().from(identities).where(eq(identities.userId, userId)).orderBy(desc(identities.createdAt)).limit(100);
    return c.json({ ok: true, identities: rows.map(safeIdentity) });
  });
  app.post("/", async (c) => {
    const userId = c.get("userId");
    const body = await c.req.json().catch(() => ({} as any));
    const cls = IdentityClass.safeParse(body?.class ?? "helm-owned");
    if (!cls.success || cls.data !== "helm-owned") return c.json(err(HELM_ERROR_CODES.VALIDATION_ERROR, "Only helm-owned identity can be created in this slice"), 400);
    const label = typeof body?.label === "string" && body.label.trim() ? body.label.trim().slice(0, 200) : "Helm Agent";
    const email = typeof body?.email === "string" && body.email.includes("@") ? body.email.trim().slice(0, 320) : null;
    const now = new Date();
        const [row] = await db.insert(identities).values({ id: uid("idn"), userId, class: "helm-owned", label, email, provider: "helm", scopes: [], status: "active", metadata: { createdBy: "api" }, createdAt: now, updatedAt: now }).returning();
    if (row) await db.insert(identityPolicies).values({ id: uid("idp"), userId, identityId: row.id, allowedDomains: [], allowedRecipients: [], allowExternalWrites: false, requireApproval: true, createdAt: now, updatedAt: now }).onConflictDoNothing();
    return c.json({ ok: true, identity: safeIdentity(row) }, 201);
  });
  app.get("/:id/policy", async (c) => {
    const userId = c.get("userId");
    const id = c.req.param("id");
    const [row] = await db.select().from(identityPolicies).where(and(eq(identityPolicies.id, id), eq(identityPolicies.userId, userId))).limit(1);
    if (!row) {
      const [byIdentity] = await db.select().from(identityPolicies).where(and(eq(identityPolicies.identityId, id), eq(identityPolicies.userId, userId))).limit(1);
      if (!byIdentity) return c.json(err(HELM_ERROR_CODES.NOT_FOUND, "Identity policy not found"), 404);
      return c.json({ ok: true, policy: redactIdentityValue(byIdentity) });
    }
    return c.json({ ok: true, policy: redactIdentityValue(row) });
  });
  app.patch("/:id/policy", async (c) => {
    const userId = c.get("userId");
    const identityId = c.req.param("id");
    const body = await c.req.json().catch(() => ({} as any));
    const [identity] = await db.select({ id: identities.id }).from(identities).where(and(eq(identities.id, identityId), eq(identities.userId, userId))).limit(1);
    if (!identity) return c.json(err(HELM_ERROR_CODES.NOT_FOUND, "Identity not found"), 404);
    const [existing] = await db.select().from(identityPolicies).where(and(eq(identityPolicies.identityId, identityId), eq(identityPolicies.userId, userId))).limit(1);
    if (!existing) return c.json(err(HELM_ERROR_CODES.NOT_FOUND, "Identity policy not found"), 404);
    const asStringArray = (v: unknown, max = 50): string[] | null => Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").map((x) => x.trim().slice(0, 320)).filter(Boolean).slice(0, max) : null;
    const patch: Partial<{ allowedDomains: string[]; allowedRecipients: string[]; allowExternalWrites: boolean; requireApproval: boolean; updatedAt: Date }> = { updatedAt: new Date() };
    const allowedDomains = asStringArray(body?.allowedDomains);
    const allowedRecipients = asStringArray(body?.allowedRecipients);
    if (allowedDomains) patch.allowedDomains = allowedDomains;
    if (allowedRecipients) patch.allowedRecipients = allowedRecipients;
    if (typeof body?.allowExternalWrites === "boolean") patch.allowExternalWrites = body.allowExternalWrites;
    if (typeof body?.requireApproval === "boolean") patch.requireApproval = body.requireApproval;
    if (Object.keys(patch).length === 1) return c.json(err(HELM_ERROR_CODES.VALIDATION_ERROR, "No valid policy fields to update"), 400);
    if (patch.allowExternalWrites === true && (patch.requireApproval === false || (patch.requireApproval === undefined && existing.requireApproval === false))) {
      return c.json(err(HELM_ERROR_CODES.FORBIDDEN, "External writes require requireApproval=true"), 403);
    }
    const [updated] = await db.update(identityPolicies).set(patch).where(and(eq(identityPolicies.id, existing.id), eq(identityPolicies.userId, userId))).returning();
    return c.json({ ok: true, policy: redactIdentityValue(updated) });
  });
  app.post("/:id/bind-connector-account", async (c) => {
    const userId = c.get("userId");
    const identityId = c.req.param("id");
    const body = await c.req.json().catch(() => ({} as any));
    const accountId = typeof body?.accountId === "string" ? body.accountId.trim() : "";
    if (!accountId) return c.json(err(HELM_ERROR_CODES.VALIDATION_ERROR, "accountId required"), 400);
    const [identity] = await db.select({ id: identities.id }).from(identities).where(and(eq(identities.id, identityId), eq(identities.userId, userId))).limit(1);
    if (!identity) return c.json(err(HELM_ERROR_CODES.NOT_FOUND, "Identity not found"), 404);
    const [account] = await db.select().from(connectorAccounts).where(and(eq(connectorAccounts.id, accountId), eq(connectorAccounts.userId, userId))).limit(1);
    if (!account) return c.json(err(HELM_ERROR_CODES.NOT_FOUND, "Connector account not found"), 404);
    const metadata = { ...(account.metadata as Record<string, unknown> ?? {}), identityId };
    const [updated] = await db.update(connectorAccounts).set({ metadata, updatedAt: new Date() }).where(and(eq(connectorAccounts.id, accountId), eq(connectorAccounts.userId, userId))).returning();
    return c.json({ ok: true, account: safeConnectorAccount(updated) });
  });
  return app;
}
