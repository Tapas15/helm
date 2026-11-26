import { Hono } from "hono";
import { and, desc, eq } from "drizzle-orm";
import { approvals, auditLog, taskEvents, tasks, type Database } from "@helm/db";

type AppEnv = { Variables: { userId: string } };

const uid = (pfx: string) => `${pfx}_${crypto.randomUUID().replace(/-/g, "")}`;

export function testHelperRoutes(db: Database) {
  const app = new Hono<AppEnv>();

  app.use("*", async (c, next) => {
    if (process.env.HELM_TEST_MODE !== "1") {
      return c.json({ error: { code: "FORBIDDEN", message: "Test helpers disabled" } }, 403);
    }
    await next();
  });

  app.post("/tasks/:id/seed-approval", async (c) => {
    const userId = c.get("userId");
    const taskId = c.req.param("id");
    const body = await c.req.json().catch(() => ({} as Record<string, unknown>));
    const [task] = await db.select().from(tasks).where(and(eq(tasks.id, taskId), eq(tasks.userId, userId))).limit(1);
    if (!task) return c.json({ error: { code: "NOT_FOUND", message: "Task not found" } }, 404);
    const ts = new Date();
    const approval = {
      id: uid("apr"),
      userId,
      taskId,
      runId: typeof body.runId === "string" ? body.runId : null,
      actionKind: typeof body.actionKind === "string" ? body.actionKind : "browser.external_action",
      actionHash: typeof body.actionHash === "string" ? body.actionHash : uid("ah"),
      status: "pending" as const,
      summary: typeof body.summary === "string" ? body.summary : "E2E seeded approval",
      evidence: (body.evidence ?? { seeded: true }) as Record<string, unknown>,
      requestedAt: ts,
      resolvedAt: null,
      decisionReason: null,
    };
    await db.insert(approvals).values(approval as any);
    await db.update(tasks).set({ status: "waiting_approval" as any, updatedAt: ts }).where(and(eq(tasks.id, taskId), eq(tasks.userId, userId)));
    const nextSeq = async () => (await db.select({ seq: taskEvents.sequence }).from(taskEvents).where(eq(taskEvents.taskId, taskId)).orderBy(desc(taskEvents.sequence)).limit(1).then((r: Array<{ seq: number | null }>) => Number(r[0]?.seq ?? -1) + 1));
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await db.insert(taskEvents).values({
          id: uid("evt"), userId, taskId, runId: approval.runId, sequence: await nextSeq(),
          schemaVersion: 1, ts, source: "api", type: "runtime.approval.requested", correlationId: uid("corr"), causationId: taskId,
          payload: { approvalId: approval.id, seeded: true },
        } as any);
        break;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (attempt === 2 || !/unique|duplicate/i.test(msg)) throw err;
      }
    }
    await db.insert(auditLog).values({
      id: uid("aud"), userId, ts, actorType: "system", actorId: "test-helper", taskId, action: "test.seed_approval",
      resourceType: "approval", resourceId: approval.id, decision: "allow", reason: "e2e", metadata: { seeded: true },
    } as any);
    return c.json({ ok: true, approval });
  });

  app.post("/tasks/:id/set-status", async (c) => {
    const userId = c.get("userId");
    const taskId = c.req.param("id");
    const body = await c.req.json().catch(() => ({} as Record<string, unknown>));
    const status = String(body.status ?? "");
    const allowed = new Set(["queued","planning","running","waiting_approval","waiting_input","paused","completed","failed","cancelled"]);
    if (!allowed.has(status)) return c.json({ error: { code: "VALIDATION_ERROR", message: "Invalid status" } }, 400);
    const ts = new Date();
    const patch: Record<string, unknown> = { status, updatedAt: ts };
    if (body.leaseOwner !== undefined) patch.leaseOwner = body.leaseOwner;
    if (body.leaseUntil !== undefined) patch.leaseUntil = body.leaseUntil ? new Date(String(body.leaseUntil)) : null;
    if (["completed","failed","cancelled"].includes(status)) patch.completedAt = ts;
    const [task] = await db.update(tasks).set(patch as any).where(and(eq(tasks.id, taskId), eq(tasks.userId, userId))).returning();
    if (!task) return c.json({ error: { code: "NOT_FOUND", message: "Task not found" } }, 404);
    await db.insert(taskEvents).values({
      id: uid("evt"), userId, taskId, runId: null,
      sequence: (await db.select({ seq: taskEvents.sequence }).from(taskEvents).where(eq(taskEvents.taskId, taskId)).orderBy(desc(taskEvents.sequence)).limit(1).then((r: Array<{ seq: number | null }>) => Number(r[0]?.seq ?? -1) + 1)),
      schemaVersion: 1, ts, source: "api", type: "task.status.seeded", correlationId: uid("corr"), causationId: taskId,
      payload: { status, seeded: true },
    } as any);
    return c.json({ ok: true, task });
  });

  app.post("/tasks/:id/expire-lease", async (c) => {
    const userId = c.get("userId");
    const taskId = c.req.param("id");
    const body = await c.req.json().catch(() => ({} as Record<string, unknown>));
    const leaseUntil = body.leaseUntil ? new Date(String(body.leaseUntil)) : new Date(Date.now() - 60_000);
    const [task] = await db.update(tasks).set({ status: "queued" as any, leaseOwner: null, leaseUntil, updatedAt: new Date(), completedAt: null }).where(and(eq(tasks.id, taskId), eq(tasks.userId, userId))).returning();
    if (!task) return c.json({ error: { code: "NOT_FOUND", message: "Task not found" } }, 404);
    await db.insert(taskEvents).values({
      id: uid("evt"), userId, taskId, runId: null,
      sequence: (await db.select({ seq: taskEvents.sequence }).from(taskEvents).where(eq(taskEvents.taskId, taskId)).orderBy(desc(taskEvents.sequence)).limit(1).then((r: Array<{ seq: number | null }>) => Number(r[0]?.seq ?? -1) + 1)),
      schemaVersion: 1, ts: new Date(), source: "api", type: "task.lease.expired.seeded", correlationId: uid("corr"), causationId: taskId,
      payload: { leaseUntil: leaseUntil.toISOString(), seeded: true },
    } as any);
    return c.json({ ok: true, task });
  });

  return app;
}
