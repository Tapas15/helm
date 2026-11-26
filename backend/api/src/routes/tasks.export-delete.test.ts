import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import { actionReceipts, approvals, auditLog, browserArtifacts, taskEvents, taskMessages, tasks } from "@helm/db";
import { taskRoutes } from "./tasks.js";

const env = { ...process.env };

function makeDb(opts?: { task?: any; rows?: any[] }) {
  const task = opts?.task ?? { id: "tsk_1", userId: "u1", title: "t", status: "completed", updatedAt: new Date("2026-01-01T00:00:00Z") };
  const rows = opts?.rows ?? [task];
  const inserts: Array<{ table: unknown; value: any }> = [];
  const deletes: Array<{ table: unknown }> = [];
  const txCalls: string[] = [];
  const thenable = (value: any) => {
    const p: any = Promise.resolve(value);
    p.limit = async (n?: number) => (Array.isArray(value) ? value.slice(0, n ?? value.length) : value);
    p.orderBy = () => thenable(value);
    p.where = () => thenable(value);
    p.returning = async () => (Array.isArray(value) ? value : [value]);
    return p;
  };
  const tx = {
    delete: (table: unknown) => ({ where: async () => { txCalls.push(`delete:${(table as any)?.[Symbol.for("drizzle:Name")] ?? "unknown"}`); deletes.push({ table }); return []; } }),
  };
  const db: any = {
    inserts, deletes, txCalls, task,
    select: () => ({
      from: (table: unknown) => ({
        where: () => thenable(table === tasks ? rows.filter((r) => r.id === task.id && r.userId === task.userId) : []),
        orderBy: () => ({
          limit: async (n: number) => (table === tasks ? rows.slice(0, n) : []),
        }),
      }),
    }),
    insert: (table: unknown) => ({ values: async (v: any) => { inserts.push({ table, value: v }); return [v]; } }),
    delete: (table: unknown) => ({ where: async () => { deletes.push({ table }); return []; } }),
    transaction: async (fn: any) => fn(tx),
  };
  return db;
}

function makeApp(db: any, userId = "u1") {
  const app = new Hono();
  app.use("*", async (c, next) => { (c.set as any)("userId", userId); (c.set as any)("requestId", "req_1"); (c.set as any)("correlationId", "cor_1"); await next(); });
  app.route("/v1/tasks", taskRoutes(db));
  return app;
}

describe("task export/delete contracts (P8)", () => {
  beforeEach(() => { process.env = { ...env }; delete process.env.HELM_ALLOW_TASK_DELETE; delete process.env.HELM_TASK_EXPORT_MAX; });
  afterEach(() => { process.env = { ...env }; vi.clearAllMocks(); });

  it("exports owned task detail with bounded related rows", async () => {
    const db = makeDb();
    const res = await makeApp(db).request("/v1/tasks/tsk_1/export");
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.ok).toBe(true);
    expect(body.task.id).toBe("tsk_1");
    expect(Array.isArray(body.messages)).toBe(true);
    expect(Array.isArray(body.events)).toBe(true);
    expect(Array.isArray(body.approvals)).toBe(true);
    expect(Array.isArray(body.receipts)).toBe(true);
    expect(Array.isArray(body.artifacts)).toBe(true);
  });

  it("returns 404 for unowned/missing task export", async () => {
    const db = makeDb({ task: { id: "tsk_1", userId: "u1" }, rows: [] });
    const res = await makeApp(db).request("/v1/tasks/tsk_1/export");
    expect(res.status).toBe(404);
  });

  it("bulk export is user-scoped and caps limit by HELM_TASK_EXPORT_MAX", async () => {
    process.env.HELM_TASK_EXPORT_MAX = "2";
    const db = makeDb({ rows: [{ id: "tsk_1", userId: "u1", updatedAt: new Date() }, { id: "tsk_2", userId: "u1", updatedAt: new Date() }, { id: "tsk_3", userId: "u1", updatedAt: new Date() }] });
    const res = await makeApp(db).request("/v1/tasks/export", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ limit: 99 }) });
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.ok).toBe(true);
    expect(body.max).toBe(2);
    expect(body.count).toBeLessThanOrEqual(2);
    expect(body.tasks.length).toBeLessThanOrEqual(2);
  });

  it("rejects delete when disabled", async () => {
    const db = makeDb();
    const res = await makeApp(db).request("/v1/tasks/tsk_1/delete", { method: "POST", body: "{}" });
    expect(res.status).toBe(403);
    expect(db.txCalls).toHaveLength(0);
  });

  it("rejects delete without explicit confirm header", async () => {
    process.env.HELM_ALLOW_TASK_DELETE = "1";
    const db = makeDb();
    const res = await makeApp(db).request("/v1/tasks/tsk_1/delete", { method: "POST", body: "{}" });
    expect(res.status).toBe(400);
    expect(db.txCalls).toHaveLength(0);
  });

  it("returns 404 for missing owned task on delete", async () => {
    process.env.HELM_ALLOW_TASK_DELETE = "1";
    const db = makeDb({ rows: [] });
    const res = await makeApp(db).request("/v1/tasks/tsk_1/delete", { method: "POST", body: "{}", headers: { "x-helm-confirm-delete": "yes" } });
    expect(res.status).toBe(404);
    expect(db.txCalls).toHaveLength(0);
  });

  it("deletes owned task transactionally and writes audit", async () => {
    process.env.HELM_ALLOW_TASK_DELETE = "1";
    const db = makeDb();
    const res = await makeApp(db).request("/v1/tasks/tsk_1/delete", { method: "POST", body: "{}", headers: { "x-helm-confirm-delete": "yes" } });
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body).toMatchObject({ ok: true, deletedTaskId: "tsk_1" });
    expect(db.txCalls.length).toBe(6);
    const audit = db.inserts.find((i: any) => i.table === auditLog);
    expect(audit?.value).toMatchObject({ action: "task.delete", resourceId: "tsk_1", decision: "allow" });
  });
});
