import { describe, expect, it } from "vitest";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import http from "node:http";
import { createDb } from "@helm/db";
import { approvals, connectorAccounts, tasks, users } from "@helm/db";

const run = process.env.HELM_TEMPORAL_ROLLBACK_E2E === "1";
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const dbUrl = process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/helm";

async function getFreePort(): Promise<number> {
  return await new Promise((resolve, reject) => { const srv = net.createServer(); srv.listen(0, "127.0.0.1", () => { const a = srv.address(); if (!a || typeof a === "string") { srv.close(() => reject(new Error("no port"))); return; } const { port } = a; srv.close((e) => e ? reject(e) : resolve(port)); }); srv.on("error", reject); });
}
async function waitForHttp(url: string, timeoutMs = 45000) { const start = Date.now(); while (Date.now() - start < timeoutMs) { try { const r = await fetch(url); if (r.ok) return; } catch {} await delay(250); } throw new Error(`timeout ${url}`); }
function spawnPnpm(cwd: string, env: Record<string, string>) { const cmd = process.platform === "win32" ? "cmd.exe" : "pnpm"; const args = process.platform === "win32" ? ["/d", "/s", "/c", "pnpm", "exec", "tsx", "src/index.ts"] : ["exec", "tsx", "src/index.ts"]; const c = spawn(cmd, args, { cwd, env: { ...process.env, ...env }, stdio: "pipe" }); c.stdout.on("data",()=>{}); c.stderr.on("data",()=>{}); return c; }
async function stopChild(child: ChildProcessWithoutNullStreams | null) { if (!child?.pid) return; if (process.platform === "win32") await new Promise<void>((r)=>{ const k=spawn("taskkill",["/PID",String(child.pid),"/T","/F"],{stdio:"ignore"}); k.on("exit",()=>r()); k.on("error",()=>r()); }); else { try{child.kill("SIGTERM")}catch{} } await delay(500); }
async function api(base: string, p: string, init?: RequestInit, userId = "usr_local_dev") { const res = await fetch(`${base}${p}`, { ...init, headers: { "content-type": "application/json", "x-user-id": userId, ...(init?.headers ?? {}) } }); const text = await res.text(); let json:any=null; try{json=JSON.parse(text)}catch{} return { status: res.status, json, text }; }
const uid = (p: string) => `${p}_${crypto.randomUUID().replace(/-/g, "")}`;

(run ? describe : describe.skip)("Temporal rollback runtime E2E", () => {
  it("routes direct when HELM_TEMPORAL_ENABLED=0, routes temporal when enabled", async () => {
    let sends = 0;
    const mockPort = await getFreePort();
    const mock = http.createServer(async (req, res) => {
      if (req.method === "POST" && req.url?.includes("/gmail/v1/users/me/messages/send")) {
        sends += 1;
        res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify({ id: `msg_${sends}`, threadId: "thr_1" })); return;
      }
      res.writeHead(404); res.end();
    });
    await new Promise<void>((r) => mock.listen(mockPort, "127.0.0.1", () => r()));

    const conn = createDb(dbUrl); const db = conn.db;
    await db.insert(users).values({ id: "usr_local_dev", email: "dev@local", name: "Dev" }).onConflictDoNothing();

    // Flag OFF - direct path
    const apiPort1 = await getFreePort(); const apiBase1 = `http://127.0.0.1:${apiPort1}`;
    const api1 = spawnPnpm(path.join(repoRoot, "backend/api"), {
      PORT: String(apiPort1), DATABASE_URL: dbUrl, HELM_REQUIRE_AUTH: "0", HELM_ALLOW_DEV_AUTH: "1",
      HELM_TEMPORAL_ENABLED: "0", HELM_GMAIL_API_BASE: `http://127.0.0.1:${mockPort}`, HELM_TEST_CONNECTOR_HTTP: "1",
      VAULT_MASTER_KEY: "test-vault-master-key-32-bytes-minimum-padding",
    });
    await waitForHttp(`${apiBase1}/health`);
    const taskId1 = uid("tsk"); const accountId1 = uid("cac"); const approvalId1 = uid("apr"); const actionHash1 = uid("hash"); const now = new Date();
    await db.insert(tasks).values({ id: taskId1, userId: "usr_local_dev", title: "t", prompt: "p", kind: "connector", status: "waiting_approval", priority: 0, createdAt: now, updatedAt: now }).onConflictDoNothing();
    await db.insert(connectorAccounts).values({ id: accountId1, userId: "usr_local_dev", connectorId: "google-gmail", status: "active", scopes: ["gmail.send"], createdAt: now, updatedAt: now }).onConflictDoNothing();
    await db.insert(approvals).values({ id: approvalId1, userId: "usr_local_dev", taskId: taskId1, actionKind: "gmail.send", actionHash: actionHash1, status: "approved", summary: "s", requestedAt: now, resolvedAt: now }).onConflictDoNothing();
    const r1 = await api(apiBase1, "/v1/connectors/gmail/send", { method: "POST", body: JSON.stringify({ accountId: accountId1, to: ["a@b.com"], subject: "s", bodyText: "b", idempotencyKey: `task:${taskId1}:action:${actionHash1}`, approvalId: approvalId1, actionHash: actionHash1 }) });
    expect(r1.status).toBe(200);
    expect(r1.json?.routed).toBeUndefined();
    expect(r1.json?.ok).toBe(true);
    await stopChild(api1);

    // Flag ON - temporal stub path
    const apiPort2 = await getFreePort(); const apiBase2 = `http://127.0.0.1:${apiPort2}`;
    const api2 = spawnPnpm(path.join(repoRoot, "backend/api"), {
      PORT: String(apiPort2), DATABASE_URL: dbUrl, HELM_REQUIRE_AUTH: "0", HELM_ALLOW_DEV_AUTH: "1",
      HELM_TEMPORAL_ENABLED: "1", HELM_TEMPORAL_MODE: "external-write", HELM_TEMPORAL_TEST_MODE: "stub",
      HELM_GMAIL_API_BASE: `http://127.0.0.1:${mockPort}`, HELM_TEST_CONNECTOR_HTTP: "1",
      VAULT_MASTER_KEY: "test-vault-master-key-32-bytes-minimum-padding",
    });
    await waitForHttp(`${apiBase2}/health`);
    const taskId2 = uid("tsk"); const accountId2 = uid("cac"); const approvalId2 = uid("apr"); const actionHash2 = uid("hash");
    await db.insert(tasks).values({ id: taskId2, userId: "usr_local_dev", title: "t2", prompt: "p2", kind: "connector", status: "waiting_approval", priority: 0, createdAt: now, updatedAt: now }).onConflictDoNothing();
    await db.insert(connectorAccounts).values({ id: accountId2, userId: "usr_local_dev", connectorId: "google-gmail", status: "active", scopes: ["gmail.send"], createdAt: now, updatedAt: now }).onConflictDoNothing();
    await db.insert(approvals).values({ id: approvalId2, userId: "usr_local_dev", taskId: taskId2, actionKind: "gmail.send", actionHash: actionHash2, status: "approved", summary: "s", requestedAt: now, resolvedAt: now }).onConflictDoNothing();
    const r2 = await api(apiBase2, "/v1/connectors/gmail/send", { method: "POST", body: JSON.stringify({ accountId: accountId2, to: ["a@b.com"], subject: "s", bodyText: "b", idempotencyKey: `task:${taskId2}:action:${actionHash2}`, approvalId: approvalId2, actionHash: actionHash2 }) });
    expect(r2.status).toBe(202);
    expect(r2.json?.routed).toBe("temporal");
    await stopChild(api2);

    await new Promise<void>((r) => mock.close(() => r())); await conn.pool.end();
  }, 180000);
});
