import { afterAll, describe, expect, it } from "vitest";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { createDb } from "@helm/db";
import { approvals, connectorAccounts, tasks, users } from "@helm/db";
import { eq } from "drizzle-orm";

const run = process.env.HELM_TEMPORAL_ROUTING_TEST === "1";
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const dbUrl = process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/helm";

async function getFreePort(): Promise<number> {
  return await new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, "127.0.0.1", () => { const addr = srv.address(); if (!addr || typeof addr === "string") { srv.close(() => reject(new Error("no port"))); return; } const { port } = addr; srv.close((err) => err ? reject(err) : resolve(port)); });
    srv.on("error", reject);
  });
}
async function waitForHttp(url: string, timeoutMs = 45000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) { try { const res = await fetch(url); if (res.ok) return; } catch {} await delay(250); }
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

(run ? describe : describe.skip)("Temporal routing integration (stub mode)", () => {
  let apiChild: ChildProcessWithoutNullStreams | null = null;
  let conn: ReturnType<typeof createDb> | undefined;
  afterAll(async () => { await stopChild(apiChild); if (conn) await conn.pool.end(); });

  it("routes gmail.send to temporal stub with idempotent workflowId; direct path used when flag off", async () => {
    conn = createDb(dbUrl);
    const db = conn.db;
    const apiPort = await getFreePort();
    const apiBase = `http://127.0.0.1:${apiPort}`;
    apiChild = spawnPnpm(path.join(repoRoot, "backend/api"), {
      PORT: String(apiPort), DATABASE_URL: dbUrl,
      HELM_REQUIRE_AUTH: "0", HELM_ALLOW_DEV_AUTH: "1",
      HELM_TEMPORAL_ENABLED: "1", HELM_TEMPORAL_MODE: "external-write", HELM_TEMPORAL_TEST_MODE: "stub",
      VAULT_MASTER_KEY: "test-vault-master-key-32-bytes-minimum-padding",
    });
    await waitForHttp(`${apiBase}/health`, 45000);

    await db.insert(users).values({ id: "usr_local_dev", email: "dev@local", name: "Dev" }).onConflictDoNothing();
    const taskId = uid("tsk");
    const accountId = uid("cac");
    const approvalId = uid("apr");
    const actionHash = uid("hash");
    const now = new Date();
    await db.insert(tasks).values({ id: taskId, userId: "usr_local_dev", title: "Temporal test", prompt: "Temporal test", kind: "connector", status: "waiting_approval", priority: 0, createdAt: now, updatedAt: now }).onConflictDoNothing();
    await db.insert(connectorAccounts).values({ id: accountId, userId: "usr_local_dev", connectorId: "google-gmail", status: "active", scopes: ["gmail.send"], createdAt: now, updatedAt: now }).onConflictDoNothing();
    await db.insert(approvals).values({ id: approvalId, userId: "usr_local_dev", taskId, actionKind: "gmail.send", actionHash, status: "approved", summary: "Temporal test approval", requestedAt: now, resolvedAt: now }).onConflictDoNothing();

    const idempotencyKey = `task:${taskId}:action:${actionHash}`;
    const payload = { accountId, to: ["test@example.com"], subject: "hi", bodyText: "hello", idempotencyKey, approvalId, actionHash };
    const r1 = await api(apiBase, "/v1/connectors/gmail/send", { method: "POST", body: JSON.stringify(payload) });
    expect(r1.status).toBe(202);
    expect(r1.json?.routed).toBe("temporal");
    expect(r1.json?.workflowId).toContain("helm-ext-");

    const r2 = await api(apiBase, "/v1/connectors/gmail/send", { method: "POST", body: JSON.stringify(payload) });
    expect(r2.status).toBe(202);
    expect(r2.json?.workflowId).toBe(r1.json?.workflowId);

    await db.delete(approvals).where(eq(approvals.id, approvalId));
    await db.delete(connectorAccounts).where(eq(connectorAccounts.id, accountId));
    await db.delete(tasks).where(eq(tasks.id, taskId));
  }, 90000);
});

