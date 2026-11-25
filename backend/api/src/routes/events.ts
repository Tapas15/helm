import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { and, eq, sql } from "drizzle-orm";
import { taskEvents, tasks, type Database } from "@helm/db";
import type { AppEnv } from "../types.js";

export function eventRoutes(db: Database) {
  const app = new Hono<AppEnv>();

  // SSE stream: GET /v1/events/stream?taskId=&after=
  app.get("/stream", async (c) => {
    const userId = c.get("userId");
    const taskId = c.req.query("taskId");
    const afterRaw = c.req.query("after");
    const lastEventIdRaw = c.req.header("last-event-id");
    const lastEventId = lastEventIdRaw !== undefined && /^-?\d+$/.test(lastEventIdRaw) ? Number(lastEventIdRaw) : undefined;
    const after = afterRaw !== undefined ? Number(afterRaw) : (Number.isInteger(lastEventId) ? Number(lastEventId) : -1);
    if (!taskId) return c.json({ error: { code: "VALIDATION_ERROR", message: "taskId required", retryable: false } }, 400);
    if (!Number.isInteger(after) || after < -1) return c.json({ error: { code: "VALIDATION_ERROR", message: "after must be an integer >= -1", retryable: false } }, 400);
    const [task] = await db.select({ id: tasks.id }).from(tasks).where(and(eq(tasks.id, taskId), eq(tasks.userId, userId))).limit(1);
    if (!task) return c.json({ error: { code: "NOT_FOUND", message: "Task not found", retryable: false } }, 404);

    return streamSSE(c, async (stream) => {
      let cursor = after;
      let alive = true;
      stream.onAbort(() => { alive = false; });
      while (alive) {
        const rows = await db.select().from(taskEvents)
          .where(and(eq(taskEvents.taskId, taskId), sql`${taskEvents.sequence} > ${cursor}`))
          .orderBy(taskEvents.sequence).limit(100);
        for (const evt of rows) {
          cursor = Math.max(cursor, Number(evt.sequence));
          await stream.writeSSE({ event: "event", data: JSON.stringify(evt), id: String(evt.sequence) });
        }
        await stream.writeSSE({ event: "heartbeat", data: JSON.stringify({ ts: new Date().toISOString(), taskId, after: cursor }) });
        await stream.sleep(1500);
      }
    });
  });

  return app;
}
