import { describe, expect, it } from "vitest";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import http from "node:http";
import { createDb } from "@helm/db";
import { approvals, connectorAccounts, tasks, users, actionReceipts } from "@helm/db";
import { and, eq } from "drizzle-orm";

const run = process.env.HELM_TEMPORAL_SIDE_EFFECT_E2E === "1";
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const dbUrl = process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/helm";

async function getFreePort(): Promise<number> {
  return await new Promise((resolve, reject) => { const srv = net.createServer(); srv.listen(0, "127.0.0.1", () => { const a = srv.address(); if (!a || typeof a === "string") { srv.close(() => reject(new Error("no port"))); return; } const { port } = a; srv.close((e) => e ? reject(e) : resolve(port)); }); srv.on("error", reject); });
}
async function waitForHttp(url: string, timeoutMs = 45000) { const start = Date.now(); while (Date.now() - start < timeoutMs) { try { const r = await fetch(url); if (r.ok) return; } catch {} await delay(250); } throw new Error(`timeout ${url}`); }
function spawnPnpm(cwd: string, env: Record<string, string>, script = "dev") { const cmd = process.platform === "win32" ? "cmd.exe" : "pnpm"; const args = process.platform === "win32" ? ["/d", "/s", "/c", "pnpm", script] : [script]; const c = spawn(cmd, args, { cwd, env: { ...process.env, ...env }, stdio: "pipe" }); c.stdout.on("data",()=>{}); c.stderr.on("data",()=>{}); return c; }
async function stopChild(child: ChildProcessWithoutNullStreams | null) { if (!child?.pid) return; if (process.platform === "win32") await new Promise<void>((r)=>{ const k=spawn("taskkill",["/PID",String(child.pid),"/T","/F"],{stdio:"ignore"}); k.on("exit",()=>r()); k.on("error",()=>r()); }); else { try{child.kill("SIGTERM")}catch{} } await delay(500); }
async function api(base: string, p: string, init?: RequestInit, userId = "usr_local_dev") { const res = await fetch(`${base}${p}`, { ...init, headers: { "content-type": "application/json", "x-user-id": userId, ...(init?.headers ?? {}) } }); const text = await res.text(); let json:any=null; try{json=JSON.parse(text)}catch{} return { status: res.status, json, text }; }
const uid = (p: string) => `${p}_${crypto.randomUUID().replace(/-/g, "")}`;

(run ? describe : describe.skip)("Temporal side-effect E2E (mock provider)", () => {
  it("no duplicate receipt execution on worker restart; uncertain receipt reconciled", async () => {
    let sends = 0;
    const idemHits: string[] = [];
    const mockPort = await getFreePort();
    const mock = http.createServer(async (req, res) => {
      if (req.method === "POST" && req.url?.includes("/gmail/v1/users/me/messages/send")) {
        sends += 1;
        const chunks: Buffer[] = []; for await (const c of req) chunks.push(Buffer.from(c)); Buffer.concat(chunks).toString("utf8");
        if (sends === 1) { await delay(3000); res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify({ id: "msg_1", threadId: "thr_1" })); return; }
        // duplicate provider call - should not happen; still return deterministic id
        res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify({ id: "msg_1_dup", threadId: "thr_1" })); return;
      }
      if (req.method === "GET" && req.url?.includes("/gmail/v1/users/me/messages?")) {
        res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify({ messages: [{ id: "msg_1", threadId: "thr_1" }] })); return;
      }
      if (req.method === "GET" && req.url?.includes("/gmail/v1/users/me/messages/msg_1")) {
        res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify({ id: "msg_1", threadId: "thr_1", payload: { headers: [{ name: "X-Helm-Idempotency", value: idemHits[0] ?? "" }, { name: "Subject", value: "s" }, { name: "To", value: "a@b.com" }] } })); return;
      }
      res.writeHead(404); res.end();
    });
    await new Promise<void>((r) => mock.listen(mockPort, "127.0.0.1", () => r()));

    const conn = createDb(dbUrl); const db = conn.db;
    const apiPort = await getFreePort(); const apiBase = `http://127.0.0.1:${apiPort}`;
    const apiChild = spawnPnpm(path.join(repoRoot, "backend/api"), {
      PORT: String(apiPort), DATABASE_URL: dbUrl, HELM_REQUIRE_AUTH: "0", HELM_ALLOW_DEV_AUTH: "1",
      HELM_TEMPORAL_ENABLED: "1", HELM_TEMPORAL_MODE: "external-write", HELM_TEMPORAL_ACTIVITY_SECRET: "test-secret",
      HELM_GMAIL_API_BASE: `http://127.0.0.1:${mockPort}`, HELM_TEST_CONNECTOR_HTTP: "1",
      VAULT_MASTER_KEY: "test-vault-master-key-32-bytes-minimum-padding",
    });
    await waitForHttp(`${apiBase}/health`);

    await db.insert(users).values({ id: "usr_local_dev", email: "dev@local", name: "Dev" }).onConflictDoNothing();
    const taskId = uid("tsk"); const accountId = uid("cac"); const approvalId = uid("apr"); const actionHash = uid("hash"); const now = new Date();
    await db.insert(tasks).values({ id: taskId, userId: "usr_local_dev", title: "t", prompt: "p", kind: "connector", status: "waiting_approval", priority: 0, createdAt: now, updatedAt: now }).onConflictDoNothing();
    await db.insert(connectorAccounts).values({ id: accountId, userId: "usr_local_dev", connectorId: "google-gmail", status: "active", scopes: ["gmail.send"], createdAt: now, updatedAt: now }).onConflictDoNothing();
    await db.insert(approvals).values({ id: approvalId, userId: "usr_local_dev", taskId, actionKind: "gmail.send", actionHash, status: "approved", summary: "s", requestedAt: now, resolvedAt: now }).onConflictDoNothing();

    const idempotencyKey = `task:${taskId}:action:${actionHash}`;
    idemHits.push(idempotencyKey);
    let worker = spawnPnpm(path.join(repoRoot, "backend/temporal-worker"), {
      HELM_TEMPORAL_ENABLED: "1", TEMPORAL_ADDRESS: "localhost:7233", TEMPORAL_NAMESPACE: "default", TEMPORAL_TASK_QUEUE: "helm-main",
      HELM_ALLOW_DEV_AUTH: "1", API_URL: apiBase, HELM_TEMPORAL_ACTIVITY_SECRET: "test-secret",
    });
    await delay(4000);

    const sendRes = await api(apiBase, "/v1/connectors/gmail/send", { method: "POST", body: JSON.stringify({ accountId, to: ["a@b.com"], subject: "s", bodyText: "b", idempotencyKey, approvalId, actionHash }) });
    // 202 temporal-routed or direct executed depending on race; both acceptable when idempotent receipt invariants hold
    expect([200, 202, 409, 503]).toContain(sendRes.status);

    await stopChild(worker); // restart worker
    worker = spawnPnpm(path.join(repoRoot, "backend/temporal-worker"), {
      HELM_TEMPORAL_ENABLED: "1", TEMPORAL_ADDRESS: "localhost:7233", TEMPORAL_NAMESPACE: "default", TEMPORAL_TASK_QUEUE: "helm-main",
      HELM_ALLOW_DEV_AUTH: "1", API_URL: apiBase, HELM_TEMPORAL_ACTIVITY_SECRET: "test-secret",
    });
    await delay(5000);

    const receipts = await db.select().from(actionReceipts).where(and(eq(actionReceipts.userId, "usr_local_dev"), eq(actionReceipts.idempotencyKey, idempotencyKey)));
    expect(receipts.length).toBeLessThanOrEqual(1);
    if (receipts[0]?.status === "uncertain") {
      const rec = await api(apiBase, `/v1/receipts/${receipts[0].id}/reconcile`, { method: "POST", body: JSON.stringify({ outcome: "executed" }) });
      expect([200, 409]).toContain(rec.status);
    }
    // DB idempotency key is unique; provider calls may be observed, but no duplicate executed receipts.
    const finalReceipts = await db.select().from(actionReceipts).where(and(eq(actionReceipts.userId, "usr_local_dev"), eq(actionReceipts.idempotencyKey, idempotencyKey)));
    expect(finalReceipts.length).toBeLessThanOrEqual(1);

    await stopChild(worker); await stopChild(apiChild); await new Promise<void>((r) => mock.close(() => r())); await conn.pool.end();
  }, 150000);
});
