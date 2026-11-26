import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import { actionReceipts, approvals, auditLog, browserArtifacts, taskEvents, taskMessages, tasks } from "@helm/db";
import { taskRoutes } from "./tasks.js";

const env = { ...process.env };

function makeDb(opts?: { task?: any; rows?: any[]; byTable?: Partial<Record<string, any[]>> }) {
  const task = opts?.task ?? { id: "tsk_1", userId: "u1", title: "t", status: "completed", updatedAt: new Date("2026-01-01T00:00:00Z") };
  const rows = opts?.rows ?? [task];
  const byTable = opts?.byTable ?? {};
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
  const tableRows = (table: unknown) => {
    if (table === tasks) return rows.filter((r) => r.userId === task.userId);
    if (table === taskMessages) return byTable.messages ?? [];
    if (table === taskEvents) return byTable.events ?? [];
    if (table === approvals) return byTable.approvals ?? [];
    if (table === actionReceipts) return byTable.receipts ?? [];
    if (table === browserArtifacts) return byTable.artifacts ?? [];
    return [];
  };
  const db: any = {
    inserts, deletes, txCalls, task,
    select: () => ({
      from: (table: unknown) => ({
        where: () => thenable(tableRows(table)),
        orderBy: () => ({
          limit: async (n: number) => (table === tasks ? rows.slice(0, n) : tableRows(table).slice(0, n)),
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

  it("does not leak other-user task rows in bulk export", async () => {
    const db = makeDb({ rows: [{ id: "tsk_1", userId: "u1", updatedAt: new Date() }, { id: "tsk_2", userId: "u2", updatedAt: new Date() }] });
    const res = await makeApp(db, "u1").request("/v1/tasks/export", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ limit: 10 }) });
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.tasks.map((t: any) => t.id)).toEqual(["tsk_1"]);
    expect(JSON.stringify(body)).not.toContain("tsk_2");
  });

  it("rejects cross-user delete as 404 and does not mutate", async () => {
    process.env.HELM_ALLOW_TASK_DELETE = "1";
    const db = makeDb({ task: { id: "tsk_other", userId: "u2" }, rows: [] });
    const res = await makeApp(db, "u1").request("/v1/tasks/tsk_other/delete", { method: "POST", body: "{}", headers: { "x-helm-confirm-delete": "yes" } });
    expect(res.status).toBe(404);
    expect(db.txCalls).toHaveLength(0);
    expect(db.inserts.filter((i: any) => i.table === auditLog)).toHaveLength(0);
  });

  it("does not echo secret env names/values in delete audit metadata", async () => {
    process.env.HELM_ALLOW_TASK_DELETE = "1";
    process.env.HELM_VAULT_MASTER_KEY = "super-secret-test-key";
    const db = makeDb();
    const res = await makeApp(db).request("/v1/tasks/tsk_1/delete", { method: "POST", body: "{}", headers: { "x-helm-confirm-delete": "yes" } });
    expect(res.status).toBe(200);
    const audit = db.inserts.find((i: any) => i.table === auditLog);
    const serialized = JSON.stringify(audit?.value ?? {});
    expect(serialized).not.toContain("super-secret-test-key");
    expect(serialized).not.toContain("HELM_VAULT_MASTER_KEY");
    expect(audit?.value?.metadata).toEqual({ enabled: true, confirm: true });
  });

  it("returns 404 for cross-user single task export without leaking existence", async () => {
    const db = makeDb({ task: { id: "tsk_other", userId: "u2" }, rows: [] });
    const res = await makeApp(db, "u1").request("/v1/tasks/tsk_other/export");
    expect(res.status).toBe(404);
    const body = await res.json() as any;
    expect(body?.error?.code).toBe("NOT_FOUND");
    expect(JSON.stringify(body)).not.toContain("u2");
  });

  it("export payload does not leak sensitive key-shaped fields", async () => {
    process.env.HELM_VAULT_MASTER_KEY = "super-secret-test-key";
    const db = makeDb({
      task: { id: "tsk_1", userId: "u1", title: "t", status: "completed", updatedAt: new Date("2026-01-01T00:00:00Z") },
      rows: [{ id: "tsk_1", userId: "u1", title: "t", status: "completed", updatedAt: new Date("2026-01-01T00:00:00Z") }],
      byTable: {
        messages: [{ id: "msg_1", taskId: "tsk_1", userId: "u1", role: "assistant", content: "ok", metadata: { apiKey: "sk-live-123", nested: { accessToken: "tok-abc" } }, createdAt: new Date() }],
        events: [{ id: "evt_1", taskId: "tsk_1", userId: "u1", type: "runtime.info", payload: { authorization: "Bearer abc", safe: "keep" }, createdAt: new Date() }],
        receipts: [{ id: "rcpt_1", taskId: "tsk_1", userId: "u1", kind: "browser", status: "succeeded", request: { password: "pw123" }, response: { sessionToken: "sess-secret" }, createdAt: new Date() }],
        artifacts: [{ id: "art_1", taskId: "tsk_1", userId: "u1", kind: "screenshot", path: "C:\\Users\\Tapas\\secret\\shot.png", mime: "image/png", sha256: "abc", sizeBytes: 1, metadata: { path: "/home/tapas/secret.txt" }, createdAt: new Date() }],
      },
    });
    const res = await makeApp(db).request("/v1/tasks/tsk_1/export");
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain("sk-live-123");
    expect(serialized).not.toContain("tok-abc");
    expect(serialized).not.toContain("Bearer abc");
    expect(serialized).not.toContain("pw123");
    expect(serialized).not.toContain("sess-secret");
    expect(serialized).not.toContain("super-secret-test-key");
    expect(serialized).not.toContain("C:\\\\Users\\\\Tapas\\\\secret\\\\shot.png");
    expect(serialized).not.toContain("/home/tapas/secret.txt");
    expect(body.artifacts[0].path).toBe("[REDACTED_PATH]");
    expect(body.artifacts[0].metadata.path).toBe("[REDACTED_PATH]");
    expect(serialized).toContain("keep");
    expect(serialized).toContain("[REDACTED]");
  });

  it("single export writes allowlisted audit metadata with no secret leakage", async () => {
    process.env.HELM_VAULT_MASTER_KEY = "super-secret-test-key";
    const db = makeDb();
    const res = await makeApp(db).request("/v1/tasks/tsk_1/export");
    expect(res.status).toBe(200);
    const audit = db.inserts.find((i: any) => i.table === auditLog && i.value?.action === "task.export");
    expect(audit?.value).toMatchObject({ action: "task.export", resourceType: "task", resourceId: "tsk_1", decision: "allow" });
    const serialized = JSON.stringify(audit?.value ?? {});
    expect(serialized).not.toContain("super-secret-test-key");
    expect(serialized).not.toContain("HELM_VAULT_MASTER_KEY");
    expect(audit?.value?.metadata).toEqual({ scope: "single", requestId: "req_1", correlationId: "cor_1" });
  });

  it("bulk export writes allowlisted audit metadata with no secret leakage", async () => {
    process.env.HELM_VAULT_MASTER_KEY = "super-secret-test-key";
    process.env.HELM_TASK_EXPORT_MAX = "2";
    const db = makeDb({ rows: [{ id: "tsk_1", userId: "u1", updatedAt: new Date() }, { id: "tsk_2", userId: "u1", updatedAt: new Date() }] });
    const res = await makeApp(db).request("/v1/tasks/export", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ limit: 99 }) });
    expect(res.status).toBe(200);
    const audit = db.inserts.find((i: any) => i.table === auditLog && i.value?.action === "task.export.bulk");
    expect(audit?.value).toMatchObject({ action: "task.export.bulk", resourceType: "task", resourceId: "user:u1", decision: "allow" });
    const serialized = JSON.stringify(audit?.value ?? {});
    expect(serialized).not.toContain("super-secret-test-key");
    expect(serialized).not.toContain("HELM_VAULT_MASTER_KEY");
    expect(audit?.value?.metadata).toEqual({ scope: "user", count: 2, max: 2, requestId: "req_1", correlationId: "cor_1" });
  });
});
