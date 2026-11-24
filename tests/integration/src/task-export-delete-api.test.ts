import { afterAll, afterEach, describe, expect, it } from "vitest";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { createDb } from "@helm/db";
import { taskMessages, tasks, users } from "@helm/db";
import { eq } from "drizzle-orm";

const run = process.env.HELM_TASK_EXPORT_DELETE_API_TEST === "1";
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const dbUrl = process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/helm";

async function getFreePort(): Promise<number> {
  return await new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, "127.0.0.1", () => {
      const addr = srv.address();
      if (!addr || typeof addr === "string") { srv.close(() => reject(new Error("no port"))); return; }
      const { port } = addr; srv.close((err) => (err ? reject(err) : resolve(port)));
    });
    srv.on("error", reject);
  });
}
async function waitForHttp(url: string, timeoutMs = 45000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try { const res = await fetch(url); if (res.ok || res.status < 500) return; } catch {}
    await delay(250);
  }
  throw new Error(`Timed out waiting for ${url}`);
}
function spawnPnpm(cwd: string, env: Record<string, string>) {
  const cmd = process.platform === "win32" ? "cmd.exe" : "pnpm";
  const args = process.platform === "win32" ? ["/d", "/s", "/c", "pnpm", "exec", "tsx", "src/index.ts"] : ["exec", "tsx", "src/index.ts"];
  const child = spawn(cmd, args, { cwd, env: { ...process.env, ...env }, stdio: "pipe" });
  child.stdout.on("data", () => {}); child.stderr.on("data", () => {});
  return child;
}
async function stopChild(child: ChildProcessWithoutNullStreams | null) {
  if (!child?.pid) return;
  if (process.platform === "win32") await new Promise<void>((resolve) => { const k = spawn("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" }); k.on("exit", () => resolve()); k.on("error", () => resolve()); });
  else { try { child.kill("SIGTERM"); } catch {} }
  await delay(300);
}
async function api(base: string, p: string, init?: RequestInit, userId = "usr_local_dev") {
  const res = await fetch(`${base}${p}`, { ...init, headers: { "content-type": "application/json", "x-user-id": userId, ...(init?.headers ?? {}) } });
  const text = await res.text(); let json: any = null; try { json = JSON.parse(text); } catch {}
  return { status: res.status, json, text };
}
const uid = (p: string) => `${p}_${crypto.randomUUID().replace(/-/g, "")}`;

(run ? describe : describe.skip)("Task export/delete API integration (env-gated)", () => {
  let apiChild: ChildProcessWithoutNullStreams | null = null;
  let conn: ReturnType<typeof createDb> | undefined;
  afterEach(async () => { await stopChild(apiChild); apiChild = null; });
  afterAll(async () => { await stopChild(apiChild); if (conn) await conn.pool.end(); });

  it("exports user tasks and enforces guarded delete", async () => {
    conn = createDb(dbUrl); const db = conn.db;
    await db.insert(users).values({ id: "usr_local_dev", email: "dev@local", name: "Dev" }).onConflictDoNothing();
    const taskId = uid("tsk");
    const now = new Date();
    await db.insert(tasks).values({ id: taskId, userId: "usr_local_dev", title: "export-me", prompt: "p", kind: "assistant", status: "completed", priority: 0, createdAt: now, updatedAt: now }).onConflictDoNothing();
    await db.insert(taskMessages).values({ id: uid("msg"), userId: "usr_local_dev", taskId, role: "user", content: "hello", createdAt: now }).onConflictDoNothing();

    const port1 = await getFreePort(); const base1 = `http://127.0.0.1:${port1}`;
    apiChild = spawnPnpm(path.join(repoRoot, "backend/api"), { PORT: String(port1), DATABASE_URL: dbUrl, HELM_REQUIRE_AUTH: "0", HELM_ALLOW_DEV_AUTH: "1" });
    await waitForHttp(`${base1}/health`, 45000);

    const exp = await api(base1, "/v1/tasks/export", { method: "POST", body: JSON.stringify({ limit: 10 }) });
    expect(exp.status).toBe(200);
    expect(exp.json?.ok).toBe(true);
    expect(exp.json?.tasks?.some((t: any) => t.id === taskId)).toBe(true);

    const detailExp = await api(base1, `/v1/tasks/${taskId}/export`);
    expect(detailExp.status).toBe(200);
    expect(detailExp.json?.task?.id).toBe(taskId);
    expect(Array.isArray(detailExp.json?.messages)).toBe(true);

    const delDenied = await api(base1, `/v1/tasks/${taskId}/delete`, { method: "POST", body: "{}" });
    expect(delDenied.status).toBe(403);

    await stopChild(apiChild); apiChild = null;

    const port2 = await getFreePort(); const base2 = `http://127.0.0.1:${port2}`;
    apiChild = spawnPnpm(path.join(repoRoot, "backend/api"), { PORT: String(port2), DATABASE_URL: dbUrl, HELM_REQUIRE_AUTH: "0", HELM_ALLOW_DEV_AUTH: "1", HELM_ALLOW_TASK_DELETE: "1" });
    await waitForHttp(`${base2}/health`, 45000);

    const delNoConfirm = await api(base2, `/v1/tasks/${taskId}/delete`, { method: "POST", body: "{}" });
    expect(delNoConfirm.status).toBe(400);

    const delOk = await api(base2, `/v1/tasks/${taskId}/delete`, { method: "POST", body: "{}", headers: { "x-helm-confirm-delete": "yes" } });
    expect(delOk.status).toBe(200);
    expect(delOk.json?.ok).toBe(true);

    const [after] = await db.select().from(tasks).where(eq(tasks.id, taskId)).limit(1);
    expect(after).toBeUndefined();
  }, 120000);
});
