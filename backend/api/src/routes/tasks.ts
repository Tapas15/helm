import { Hono } from "hono";
import { eq, desc, and, sql } from "drizzle-orm";
import { tasks, taskEvents, taskMessages, auditLog, type Database } from "@helm/db";
import {
  CreateTaskInput,
  HELM_ERROR_CODES,
  TERMINAL_TASK_STATUSES,
  TaskControlAction,
  getTaskControlTransition,
  type TaskStatus,
} from "@helm/shared";
import { z } from "zod";
import type { AppEnv } from "../types.js";

const uid = (p: string) => `${p}_${crypto.randomUUID().replace(/-/g, "")}`;
const FollowUpInput = z.object({ content: z.string().trim().min(1).max(20000) });

async function nextSequence(db: Database, taskId: string): Promise<number> {
  const rows = await db
    .select({ max: sql<number>`coalesce(max(${taskEvents.sequence}), -1)` })
    .from(taskEvents)
    .where(eq(taskEvents.taskId, taskId));
  return Number(rows[0]?.max ?? -1) + 1;
}

async function insertEventWithRetry(
  db: Database,
  values: typeof taskEvents.$inferInsert,
  maxAttempts = 3,
): Promise<void> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await db.insert(taskEvents).values(values);
      return;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const isUnique = message.includes("task_events_task_seq_uidx") || message.toLowerCase().includes("unique");
      if (!isUnique || attempt === maxAttempts) throw err;
      const next = await nextSequence(db, values.taskId);
      values = { ...values, id: uid("evt"), sequence: next };
    }
  }
}

function errorBody(code: string, message: string, retryable: boolean, details?: unknown) {
  return { error: { code, message, retryable, ...(details !== undefined ? { details } : {}) } };
}

export function taskRoutes(db: Database) {
  const app = new Hono<AppEnv>();

  app.post("/", async (c) => {
    const body = await c.req.json().catch(() => null);
    const parsed = CreateTaskInput.safeParse(body);
    if (!parsed.success) {
      return c.json(
        errorBody(HELM_ERROR_CODES.VALIDATION_ERROR, "Invalid task input", false, parsed.error.flatten()),
        400,
      );
    }
    const userId = c.get("userId");
    const requestId = c.get("requestId");
    const correlationId = c.get("correlationId");
    const idemKey = c.req.header("idempotency-key")?.trim();
    const input = parsed.data;
    const id = uid("task");
    const title = input.title ?? input.prompt.slice(0, 80);
    const ts = new Date();

    if (idemKey) {
      const existing = await db
        .select()
        .from(tasks)
        .where(and(eq(tasks.userId, userId), sql`${tasks.state} ->> 'idempotencyKey' = ${idemKey}`))
        .limit(1);
      if (existing[0]) {
        c.header("idempotency-replayed", "true");
        return c.json({ task: existing[0] }, 200);
      }
    }

    const [task] = await db
      .insert(tasks)
      .values({
        id,
        userId,
        threadId: input.threadId ?? null,
        goalId: input.goalId ?? null,
        title,
        prompt: input.prompt,
        kind: input.kind,
        status: "queued",
        priority: 0,
        state: idemKey ? { idempotencyKey: idemKey } : {},
        attempts: 0,
        maxAttempts: 3,
        createdAt: ts,
        updatedAt: ts,
      })
      .returning();

    await db.insert(taskMessages).values({
      id: uid("msg"),
      userId,
      taskId: id,
      role: "user",
      content: input.prompt,
      metadata: { source: "api", requestId, correlationId, idempotencyKey: idemKey ?? null },
      createdAt: ts,
    });

    const seq = await nextSequence(db, id);
    await insertEventWithRetry(db, {
      id: uid("evt"),
      userId,
      taskId: id,
      sequence: seq,
      schemaVersion: 1,
      ts,
      source: "api",
      type: "task.created",
      correlationId,
      causationId: requestId,
      payload: { taskId: id, title, kind: input.kind, status: "queued", requestId, correlationId, idempotencyKey: idemKey ?? null },
    });
    await db.insert(auditLog).values({
      id: uid("aud"),
      userId,
      ts,
      actorType: "user",
      actorId: userId,
      taskId: id,
      action: "task.create",
      resourceType: "task",
      resourceId: id,
      decision: "allow",
      reason: "user_requested",
      metadata: { kind: input.kind, requestId, correlationId, idempotencyKey: idemKey ?? null },
    });

    c.get("logger").info({ taskId: id, requestId, correlationId, idempotencyKey: idemKey ?? null }, "task created");
    return c.json({ task }, 201);
  });

  app.get("/", async (c) => {
    const userId = c.get("userId");
    const status = c.req.query("status");
    const limit = Math.min(Number(c.req.query("limit") ?? 50), 200);
    const where = status ? and(eq(tasks.userId, userId), eq(tasks.status, status)) : eq(tasks.userId, userId);
    const rows = await db.select().from(tasks).where(where).orderBy(desc(tasks.updatedAt)).limit(limit);
    return c.json({ tasks: rows });
  });

  app.get("/:id", async (c) => {
    const userId = c.get("userId");
    const id = c.req.param("id");
    const [task] = await db
      .select()
      .from(tasks)
      .where(and(eq(tasks.id, id), eq(tasks.userId, userId)))
      .limit(1);
    if (!task) return c.json(errorBody(HELM_ERROR_CODES.NOT_FOUND, "Task not found", false), 404);
    return c.json({ task });
  });

  app.get("/:id/messages", async (c) => {
    const userId = c.get("userId");
    const id = c.req.param("id");
    const [task] = await db.select({ id: tasks.id }).from(tasks).where(and(eq(tasks.id, id), eq(tasks.userId, userId))).limit(1);
    if (!task) return c.json(errorBody(HELM_ERROR_CODES.NOT_FOUND, "Task not found", false), 404);
    const rows = await db.select().from(taskMessages).where(and(eq(taskMessages.taskId, id), eq(taskMessages.userId, userId))).orderBy(taskMessages.createdAt);
    return c.json({ messages: rows });
  });

  app.post("/:id/messages", async (c) => {
    const userId = c.get("userId");
    const requestId = c.get("requestId");
    const correlationId = c.get("correlationId");
    const id = c.req.param("id");
    const body = await c.req.json().catch(() => null);
    const parsed = FollowUpInput.safeParse(body);
    if (!parsed.success) return c.json(errorBody(HELM_ERROR_CODES.VALIDATION_ERROR, "Invalid message input", false, parsed.error.flatten()), 400);
    const [task] = await db.select().from(tasks).where(and(eq(tasks.id, id), eq(tasks.userId, userId))).limit(1);
    if (!task) return c.json(errorBody(HELM_ERROR_CODES.NOT_FOUND, "Task not found", false), 404);
    if (["running", "planning"].includes(task.status)) return c.json(errorBody(HELM_ERROR_CODES.CONFLICT, `Task is ${task.status}; wait before follow-up`, true), 409);
    if (task.status === "cancelled") return c.json(errorBody(HELM_ERROR_CODES.INVALID_TRANSITION, "Cancelled task cannot accept follow-up; create a new task", false), 409);
    const ts = new Date();
    await db.insert(taskMessages).values({ id: uid("msg"), userId, taskId: id, role: "user", content: parsed.data.content, metadata: { source: "api.followup", requestId, correlationId }, createdAt: ts });
    const [updated] = await db.update(tasks).set({
      prompt: parsed.data.content, status: "queued", updatedAt: ts, completedAt: null,
      leaseOwner: null, leaseUntil: null, errorCode: null, errorMessage: null,
      result: null, attempts: 0,
    }).where(and(eq(tasks.id, id), eq(tasks.userId, userId))).returning();
    const seq = await nextSequence(db, id);
    await insertEventWithRetry(db, { id: uid("evt"), userId, taskId: id, sequence: seq, schemaVersion: 1, ts, source: "api", type: "task.followup", correlationId, causationId: requestId, payload: { requestId, correlationId, status: "queued" } });
    await db.insert(auditLog).values({ id: uid("aud"), userId, ts, actorType: "user", actorId: userId, taskId: id, action: "task.followup", resourceType: "task", resourceId: id, decision: "allow", metadata: { requestId, correlationId } });
    return c.json({ task: updated }, 200);
  });

  app.get("/:id/events", async (c) => {
    const userId = c.get("userId");
    const id = c.req.param("id");
    const afterRaw = c.req.query("after");
    const after = afterRaw === undefined ? -1 : Number(afterRaw);
    const limitRaw = c.req.query("limit");
    const limitNum = limitRaw === undefined ? 200 : Number(limitRaw);
    if (!Number.isInteger(after) || after < -1) return c.json(errorBody(HELM_ERROR_CODES.VALIDATION_ERROR, "after must be an integer >= -1", false), 400);
    if (!Number.isInteger(limitNum) || limitNum < 1) return c.json(errorBody(HELM_ERROR_CODES.VALIDATION_ERROR, "limit must be an integer >= 1", false), 400);
    const limit = Math.min(limitNum, 500);
    const [task] = await db
      .select({ id: tasks.id })
      .from(tasks)
      .where(and(eq(tasks.id, id), eq(tasks.userId, userId)))
      .limit(1);
    if (!task) return c.json(errorBody(HELM_ERROR_CODES.NOT_FOUND, "Task not found", false), 404);
    const rows = await db
      .select()
      .from(taskEvents)
      .where(and(eq(taskEvents.taskId, id), sql`${taskEvents.sequence} > ${after}`))
      .orderBy(taskEvents.sequence)
      .limit(limit);
    return c.json({ events: rows, after, limit });
  });

  app.post("/:id/control", async (c) => {
    const userId = c.get("userId");
    const requestId = c.get("requestId");
    const correlationId = c.get("correlationId");
    const id = c.req.param("id");
    const body = await c.req.json().catch(() => null);
    const action = TaskControlAction.safeParse(body?.action);
    if (!action.success) {
      return c.json(errorBody(HELM_ERROR_CODES.VALIDATION_ERROR, "Invalid control action", false), 400);
    }
    const [task] = await db
      .select()
      .from(tasks)
      .where(and(eq(tasks.id, id), eq(tasks.userId, userId)))
      .limit(1);
    if (!task) return c.json(errorBody(HELM_ERROR_CODES.NOT_FOUND, "Task not found", false), 404);

    const transition = getTaskControlTransition(action.data);
    const from = task.status as TaskStatus;
    if (!transition.from.includes(from)) {
      return c.json(
        errorBody(HELM_ERROR_CODES.INVALID_TRANSITION, `Cannot ${action.data} task from status ${from}`, false, {
          from,
          action: action.data,
          allowedFrom: [...transition.from],
        }),
        409,
      );
    }

    const ts = new Date();
    const [updated] = await db
      .update(tasks)
      .set({
        status: transition.to,
        updatedAt: ts,
        completedAt: transition.to === "cancelled" ? ts : TERMINAL_TASK_STATUSES.has(transition.to) ? ts : task.completedAt,
        leaseOwner: transition.to === "queued" ? null : task.leaseOwner,
        leaseUntil: transition.to === "queued" ? null : task.leaseUntil,
        errorCode: transition.to === "queued" ? null : task.errorCode,
        errorMessage: transition.to === "queued" ? null : task.errorMessage,
      })
      .where(and(eq(tasks.id, id), eq(tasks.status, from)))
      .returning();
    if (!updated) {
      return c.json(errorBody(HELM_ERROR_CODES.CONFLICT, "Task state changed; retry control action", true), 409);
    }
    const seq = await nextSequence(db, id);
    await insertEventWithRetry(db, {
      id: uid("evt"),
      userId,
      taskId: id,
      sequence: seq,
      schemaVersion: 1,
      ts,
      source: "api",
      type: `task.${action.data}`,
      correlationId,
      causationId: requestId,
      payload: { action: action.data, from, to: transition.to, requestId, correlationId },
    });
    await db.insert(auditLog).values({
      id: uid("aud"),
      userId,
      ts,
      actorType: "user",
      actorId: userId,
      taskId: id,
      action: `task.${action.data}`,
      resourceType: "task",
      resourceId: id,
      decision: "allow",
      metadata: { from, to: transition.to, requestId, correlationId },
    });
    c.get("logger").info({ taskId: id, action: action.data, from, to: transition.to, requestId, correlationId }, "task control");
    return c.json({ task: updated });
  });

  return app;
}
