import { Hono } from "hono";
import { and, desc, eq } from "drizzle-orm";
import { actionReceipts, browserArtifacts, type Database } from "@helm/db";
import type { AppEnv } from "../types.js";
import { createReadStream, existsSync } from "node:fs";
import { Readable } from "node:stream";
import path from "node:path";

export function artifactRoutes(db: Database) {
  const app = new Hono<AppEnv>();
  app.get("/", async (c) => {
    const userId = c.get("userId");
    const taskId = c.req.query("taskId");
    const where = taskId ? and(eq(browserArtifacts.userId, userId), eq(browserArtifacts.taskId, taskId)) : eq(browserArtifacts.userId, userId);
    const rows = await db.select().from(browserArtifacts).where(where).orderBy(desc(browserArtifacts.createdAt)).limit(100);
    return c.json({ artifacts: rows });
  });
  app.get("/:id/download", async (c) => {
    const userId = c.get("userId");
    const id = c.req.param("id");
    const [row] = await db.select().from(browserArtifacts).where(and(eq(browserArtifacts.id, id), eq(browserArtifacts.userId, userId))).limit(1);
    if (!row) return c.json({ error: { code: "NOT_FOUND", message: "Artifact not found", retryable: false } }, 404);
    const resolved = path.resolve(row.path);
    if (!existsSync(resolved)) return c.json({ error: { code: "NOT_FOUND", message: "Artifact file missing", retryable: false } }, 404);
    c.header("content-type", row.mime || "application/octet-stream");
    c.header("content-disposition", `inline; filename="${path.basename(resolved)}"`);
    return c.body(Readable.toWeb(createReadStream(resolved)) as any);
  });
  return app;
}

export function receiptRoutes(db: Database) {
  const app = new Hono<AppEnv>();
  app.get("/", async (c) => {
    const userId = c.get("userId");
    const taskId = c.req.query("taskId");
    const where = taskId ? and(eq(actionReceipts.userId, userId), eq(actionReceipts.taskId, taskId)) : eq(actionReceipts.userId, userId);
    const rows = await db.select().from(actionReceipts).where(where).orderBy(desc(actionReceipts.createdAt)).limit(100);
    return c.json({ receipts: rows });
  });
  return app;
}


