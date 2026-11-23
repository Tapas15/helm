import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { createDb, taskEvents, tasks, users } from "@helm/db";

const dbUrl = process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/helm";
const run = process.env.HELM_INTEGRATION === "1";
const maybe = run ? describe : describe.skip;

maybe("Phase 0 integration", () => {
  const { db, pool } = createDb(dbUrl);
  const userId = "usr_local_dev";
  const uid = (p: string) => `${p}_${randomUUID().replace(/-/g, "")}`;

  beforeAll(async () => {
    await db.insert(users).values({ id: userId, email: "dev@helm.local", name: "Local Dev" }).onConflictDoNothing({ target: users.id });
  });
  afterAll(async () => { await pool.end(); });

  async function createTask(idempotencyKey?: string) {
    const id = uid("task");
    const ts = new Date();
    const [task] = await db.insert(tasks).values({
      id, userId, title: "itest", prompt: "itest prompt", kind: "assistant", status: "queued",
      state: idempotencyKey ? { idempotencyKey } : {}, attempts: 0, maxAttempts: 3, createdAt: ts, updatedAt: ts,
    }).returning();
    await db.insert(taskEvents).values({ id: uid("evt"), userId, taskId: id, sequence: 0, schemaVersion: 1, ts, source: "test", type: "task.created", payload: { idempotencyKey: idempotencyKey ?? null } });
    return task!;
  }

  it("idempotency key replays same task", async () => {
    const key = uid("idem");
    const first = await createTask(key);
    const found = await db.select().from(tasks).where(and(eq(tasks.userId, userId), sql`${tasks.state} ->> 'idempotencyKey' = ${key}`)).limit(1);
    expect(found[0]?.id).toBe(first.id);
  });

  it("event sequence unique constraint rejects duplicates", async () => {
    const task = await createTask();
    const ts = new Date();
    await db.insert(taskEvents).values({ id: uid("evt"), userId, taskId: task.id, sequence: 5, schemaVersion: 1, ts, source: "test", type: "a", payload: {} });
    await expect(db.insert(taskEvents).values({ id: uid("evt"), userId, taskId: task.id, sequence: 5, schemaVersion: 1, ts, source: "test", type: "b", payload: {} })).rejects.toBeTruthy();
  });

  it("worker lease claim is CAS-safe", async () => {
    const task = await createTask();
    const now = new Date();
    const leaseUntil = new Date(now.getTime() + 30000);
    const [claimed] = await db.update(tasks).set({ status: "running", leaseOwner: "worker_a", leaseUntil, updatedAt: now })
      .where(and(eq(tasks.id, task.id), eq(tasks.status, "queued"), sql`(${tasks.leaseUntil} is null or ${tasks.leaseUntil} <= ${now})`)).returning();
    expect(claimed?.leaseOwner).toBe("worker_a");
    const [second] = await db.update(tasks).set({ status: "running", leaseOwner: "worker_b", leaseUntil, updatedAt: now })
      .where(and(eq(tasks.id, task.id), eq(tasks.status, "queued"))).returning();
    expect(second).toBeUndefined();
  });

  it("control transition guard rejects invalid from-state", async () => {
    const task = await createTask(); // queued
    const [paused] = await db.update(tasks).set({ status: "paused", updatedAt: new Date() })
      .where(and(eq(tasks.id, task.id), eq(tasks.status, "running"))).returning();
    expect(paused).toBeUndefined();
    const [ok] = await db.update(tasks).set({ status: "paused", updatedAt: new Date() })
      .where(and(eq(tasks.id, task.id), eq(tasks.status, "queued"))).returning();
    expect(ok?.status).toBe("paused");
  });
});
