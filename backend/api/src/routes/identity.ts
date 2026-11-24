import { Hono } from "hono";
import { and, desc, eq } from "drizzle-orm";
import { identities, identityPolicies, type Database } from "@helm/db";
import { HELM_ERROR_CODES, IdentityClass } from "@helm/shared";
import type { AppEnv } from "../types.js";

const uid = (p: string) => `${p}_${crypto.randomUUID().replace(/-/g, "")}`;
const err = (code: string, message: string, retryable = false, details?: unknown) => ({ error: { code, message, retryable, ...(details !== undefined ? { details } : {}) } });

export function identityRoutes(db: Database) {
  const app = new Hono<AppEnv>();
  app.get("/status", async (c) => {
    const userId = c.get("userId");
    const rows = await db.select().from(identities).where(eq(identities.userId, userId)).orderBy(desc(identities.createdAt)).limit(20);
    return c.json({
      ok: true,
      defaultIdentityClass: "helm-owned",
      personalCredentialSharing: false,
      identities: rows,
      delegated: { supported: false, note: "User-delegated bridge requires explicit approval and narrow scopes; not enabled by default." },
    });
  });
  app.get("/", async (c) => {
    const userId = c.get("userId");
    const rows = await db.select().from(identities).where(eq(identities.userId, userId)).orderBy(desc(identities.createdAt)).limit(100);
    return c.json({ ok: true, identities: rows });
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
    return c.json({ ok: true, identity: row }, 201);
  });
  app.get("/:id/policy", async (c) => {
    const userId = c.get("userId");
    const id = c.req.param("id");
    const [row] = await db.select().from(identityPolicies).where(and(eq(identityPolicies.id, id), eq(identityPolicies.userId, userId))).limit(1);
    if (!row) {
      const [byIdentity] = await db.select().from(identityPolicies).where(and(eq(identityPolicies.identityId, id), eq(identityPolicies.userId, userId))).limit(1);
      if (!byIdentity) return c.json(err(HELM_ERROR_CODES.NOT_FOUND, "Identity policy not found"), 404);
      return c.json({ ok: true, policy: byIdentity });
    }
    return c.json({ ok: true, policy: row });
  });
  return app;
}
