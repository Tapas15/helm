import { afterAll, afterEach, describe, expect, it } from "vitest";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { createDb } from "@helm/db";
import { actionReceipts, sessions, taskEvents, tasks, users } from "@helm/db";
import { eq } from "drizzle-orm";
import { createHash } from "node:crypto";

const run = process.env.HELM_RECONCILIATION_API_TEST === "1";
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const dbUrl = process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/helm";

async function getFreePort(): Promise<number> {
  return await new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, "127.0.0.1", () => {
      const addr = srv.address();
      if (!addr || typeof addr === "string") { srv.close(() => reject(new Error("no port"))); return; }
      const { port } = addr;
      srv.close((err) => (err ? reject(err) : resolve(port)));
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
  child.stdout.on("data", () => {});
  child.stderr.on("data", () => {});
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

(run ? describe : describe.skip)("Reconciliation API integration (env-gated)", () => {
  let apiChild: ChildProcessWithoutNullStreams | null = null;
  let mockChild: ChildProcessWithoutNullStreams | null = null;
  let conn: ReturnType<typeof createDb> | undefined;
  afterEach(async () => { await stopChild(apiChild); apiChild = null; await stopChild(mockChild); mockChild = null; });
  afterAll(async () => { await stopChild(apiChild); await stopChild(mockChild); if (conn) await conn.pool.end(); });

  it("records lookup attempt for uncertain gmail receipt without blind retry", async () => {
    conn = createDb(dbUrl); const db = conn.db;
    await db.insert(users).values({ id: "usr_local_dev", email: "dev@local", name: "Dev" }).onConflictDoNothing();

    const mockPort = await getFreePort();
    const mockBase = `http://127.0.0.1:${mockPort}`;
    const mockCode = [
      "const http=require('node:http');",
      "http.createServer((req,res)=>{",
      " if(req.url && req.url.startsWith('/gmail/v1/users/me/messages?')){res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({messages:[]}));return;}",
      " res.writeHead(404,{'content-type':'application/json'});res.end(JSON.stringify({error:{message:'not found'}}));",
      `}).listen(${mockPort},'127.0.0.1');`,
    ].join("");
    mockChild = spawn(process.execPath, ["-e", mockCode], { stdio: "pipe" }) as ChildProcessWithoutNullStreams; mockChild.stdout.on("data",()=>{}); mockChild.stderr.on("data",()=>{});
    await delay(300);

    const apiPort = await getFreePort();
    const apiBase = `http://127.0.0.1:${apiPort}`;
    apiChild = spawnPnpm(path.join(repoRoot, "backend/api"), {
      PORT: String(apiPort), DATABASE_URL: dbUrl,
      HELM_REQUIRE_AUTH: "0", HELM_ALLOW_DEV_AUTH: "1",
      HELM_GMAIL_API_BASE: mockBase,
      VAULT_MASTER_KEY: "test-vault-master-key-32-bytes-minimum-padding",
      HELM_TEST_CONNECTOR_HTTP: "1",
    });
    await waitForHttp(`${apiBase}/health`, 45000);

    const taskId = uid("tsk");
    const receiptId = uid("rcpt");
    const now = new Date(Date.now() - 120_000);
    await db.insert(tasks).values({ id: taskId, userId: "usr_local_dev", title: "recon", prompt: "recon", kind: "connector", status: "failed", priority: 0, createdAt: now, updatedAt: now }).onConflictDoNothing();
    await db.insert(actionReceipts).values({
      id: receiptId, userId: "usr_local_dev", taskId, actionKind: "gmail.send", actionHash: "ah_recon",
      idempotencyKey: `task:${taskId}:action:ah_recon:${receiptId}`, status: "uncertain",
      evidence: { accountId: "cac_test", subject: "hi", to: ["a@b.com"] },
      createdAt: now,
    }).onConflictDoNothing();

    const r1 = await api(apiBase, "/v1/reconciliation/run", { method: "POST", body: JSON.stringify({ olderThanMs: 0, limit: 10 }) });
    expect(r1.status).toBe(200);
    expect(r1.json?.ok).toBe(true);

    const [after1] = await db.select().from(actionReceipts).where(eq(actionReceipts.id, receiptId)).limit(1);
    expect(after1?.status).toBe("uncertain");
    const ev = (after1?.evidence ?? {}) as Record<string, unknown>;
    expect(typeof ev.lastReconcileAttemptAt).toBe("string");

    await db.delete(actionReceipts).where(eq(actionReceipts.id, receiptId)); await db.delete(taskEvents).where(eq(taskEvents.taskId, taskId)); await db.delete(tasks).where(eq(tasks.id, taskId));
  }, 90000);

  it("marks uncertain gmail receipt executed when lookup proves external message", async () => {
    conn = createDb(dbUrl); const db = conn.db;
    await db.insert(users).values({ id: "usr_local_dev", email: "dev@local", name: "Dev" }).onConflictDoNothing();
    const taskId = uid("tsk");
    const receiptId = uid("rcpt");
    const idem = `task:${taskId}:action:ah_recon:${receiptId}`;
    const mockPort = await getFreePort();
    const mockBase = `http://127.0.0.1:${mockPort}`;
    const mockCode = [
      "const http=require('node:http');",
      "http.createServer((req,res)=>{",
      " const u=req.url||'';",
      " if(u.startsWith('/gmail/v1/users/me/messages?')){res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({messages:[{id:'msg_1',threadId:'thr_1'}]}));return;}",
      " if(u.startsWith('/gmail/v1/users/me/messages/msg_1')){res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({id:'msg_1',threadId:'thr_1',payload:{headers:[{name:'X-Helm-Idempotency',value:process.env.EXPECT_IDEM},{name:'Subject',value:'hi'},{name:'To',value:'a@b.com'}]}}));return;}",
      " res.writeHead(404,{'content-type':'application/json'});res.end(JSON.stringify({error:{message:'not found'}}));",
      `}).listen(${mockPort},'127.0.0.1');`,
    ].join("");
    mockChild = spawn(process.execPath, ["-e", mockCode], { env: { ...process.env, EXPECT_IDEM: idem }, stdio: "pipe" }) as ChildProcessWithoutNullStreams;
    mockChild.stdout.on("data",()=>{}); mockChild.stderr.on("data",()=>{});
    await delay(300);
    const apiPort = await getFreePort();
    const apiBase = `http://127.0.0.1:${apiPort}`;
    apiChild = spawnPnpm(path.join(repoRoot, "backend/api"), {
      PORT: String(apiPort), DATABASE_URL: dbUrl,
      HELM_REQUIRE_AUTH: "0", HELM_ALLOW_DEV_AUTH: "1",
      HELM_GMAIL_API_BASE: mockBase,
      HELM_TEST_CONNECTOR_HTTP: "1",
      VAULT_MASTER_KEY: "test-vault-master-key-32-bytes-minimum-padding",
    });
    await waitForHttp(`${apiBase}/health`, 45000);
    const now = new Date(Date.now() - 120_000);
    await db.insert(tasks).values({ id: taskId, userId: "usr_local_dev", title: "recon2", prompt: "recon2", kind: "connector", status: "failed", priority: 0, createdAt: now, updatedAt: now }).onConflictDoNothing();
    await db.insert(actionReceipts).values({
      id: receiptId, userId: "usr_local_dev", taskId, actionKind: "gmail.send", actionHash: "ah_recon2",
      idempotencyKey: idem, status: "uncertain",
      evidence: { accountId: "cac_test", subject: "hi", to: ["a@b.com"] },
      createdAt: now,
    }).onConflictDoNothing();
    const r1 = await api(apiBase, "/v1/reconciliation/run", { method: "POST", body: JSON.stringify({ olderThanMs: 0, limit: 10 }) });
    expect(r1.status).toBe(200);
    expect(r1.json?.ok).toBe(true);
    expect(r1.json?.reconciled).toBeGreaterThanOrEqual(1);
    const [after1] = await db.select().from(actionReceipts).where(eq(actionReceipts.id, receiptId)).limit(1);
    expect(after1?.status).toBe("executed");
    expect(after1?.externalRef).toBe("msg_1");
    const ev = (after1?.evidence ?? {}) as Record<string, unknown>;
    expect(ev.reconciled).toBe(true);
    expect(ev.reconcileOutcome).toBe("executed");
    await db.delete(actionReceipts).where(eq(actionReceipts.id, receiptId)); await db.delete(taskEvents).where(eq(taskEvents.taskId, taskId)); await db.delete(tasks).where(eq(tasks.id, taskId));
  }, 90000);

  it("marks uncertain calendar receipt executed when lookup proves external event", async () => {
    conn = createDb(dbUrl); const db = conn.db;
    await db.insert(users).values({ id: "usr_local_dev", email: "dev@local", name: "Dev" }).onConflictDoNothing();
    const taskId = uid("tsk");
    const receiptId = uid("rcpt");
    const idem = `task:${taskId}:action:ah_cal:${receiptId}`;
    const mockPort = await getFreePort();
    const mockBase = `http://127.0.0.1:${mockPort}`;
    const mockCode = [
      "const http=require('node:http');",
      "http.createServer((req,res)=>{",
      " const u=req.url||'';",
      " if(u.startsWith('/calendar/v3/calendars/primary/events')){res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({items:[{id:'evt_1',summary:'Standup',start:{dateTime:'2026-11-25T10:00:00Z'},end:{dateTime:'2026-11-25T10:30:00Z'},htmlLink:'https://calendar/e/1'}]}));return;}",
      " res.writeHead(404,{'content-type':'application/json'});res.end(JSON.stringify({error:{message:'not found'}}));",
      `}).listen(${mockPort},'127.0.0.1');`,
    ].join("");
    mockChild = spawn(process.execPath, ["-e", mockCode], { stdio: "pipe" }) as ChildProcessWithoutNullStreams;
    mockChild.stdout.on("data",()=>{}); mockChild.stderr.on("data",()=>{});
    await delay(300);
    const apiPort = await getFreePort();
    const apiBase = `http://127.0.0.1:${apiPort}`;
    apiChild = spawnPnpm(path.join(repoRoot, "backend/api"), {
      PORT: String(apiPort), DATABASE_URL: dbUrl,
      HELM_REQUIRE_AUTH: "0", HELM_ALLOW_DEV_AUTH: "1",
      HELM_CALENDAR_API_BASE: mockBase,
      HELM_TEST_CONNECTOR_HTTP: "1",
      VAULT_MASTER_KEY: "test-vault-master-key-32-bytes-minimum-padding",
    });
    await waitForHttp(`${apiBase}/health`, 45000);
    const now = new Date(Date.now() - 120_000);
    await db.insert(tasks).values({ id: taskId, userId: "usr_local_dev", title: "recon-cal", prompt: "recon-cal", kind: "connector", status: "failed", priority: 0, createdAt: now, updatedAt: now }).onConflictDoNothing();
    await db.insert(actionReceipts).values({
      id: receiptId, userId: "usr_local_dev", taskId, actionKind: "calendar.create_event", actionHash: "ah_cal",
      idempotencyKey: idem, status: "uncertain",
      evidence: { accountId: "cac_test", summary: "Standup", startIso: "2026-11-25T10:00:00Z", endIso: "2026-11-25T10:30:00Z" },
      createdAt: now,
    }).onConflictDoNothing();
    const r1 = await api(apiBase, "/v1/reconciliation/run", { method: "POST", body: JSON.stringify({ olderThanMs: 0, limit: 10 }) });
    expect(r1.status).toBe(200);
    expect(r1.json?.ok).toBe(true);
    expect(r1.json?.reconciled).toBeGreaterThanOrEqual(1);
    const [after1] = await db.select().from(actionReceipts).where(eq(actionReceipts.id, receiptId)).limit(1);
    expect(after1?.status).toBe("executed");
    expect(after1?.externalRef).toBe("evt_1");
    const ev = (after1?.evidence ?? {}) as Record<string, unknown>;
    expect(ev.reconciled).toBe(true);
    expect(ev.reconcileOutcome).toBe("executed");
    await db.delete(actionReceipts).where(eq(actionReceipts.id, receiptId)); await db.delete(taskEvents).where(eq(taskEvents.taskId, taskId)); await db.delete(tasks).where(eq(tasks.id, taskId));
  }, 90000);

  it("reports status and enforces scope=all dev-only guard", async () => {
    conn = createDb(dbUrl); const db = conn.db;
    await db.insert(users).values({ id: "usr_local_dev", email: "dev@local", name: "Dev" }).onConflictDoNothing();
    const apiPort = await getFreePort();
    const apiBase = `http://127.0.0.1:${apiPort}`;
    apiChild = spawnPnpm(path.join(repoRoot, "backend/api"), {
      PORT: String(apiPort), DATABASE_URL: dbUrl,
      HELM_REQUIRE_AUTH: "0", HELM_ALLOW_DEV_AUTH: "1",
      HELM_RECONCILIATION_ENABLED: "0",
      VAULT_MASTER_KEY: "test-vault-master-key-32-bytes-minimum-padding",
    });
    await waitForHttp(`${apiBase}/health`, 45000);
    const st = await api(apiBase, "/v1/reconciliation/status");
    expect(st.status).toBe(200);
    expect(st.json?.ok).toBe(true);
    expect(st.json?.enabled).toBe(false);
    const r = await api(apiBase, "/v1/reconciliation/run", { method: "POST", body: JSON.stringify({ scope: "all", olderThanMs: 0, limit: 1 }) });
    expect(r.status).toBe(200);
    expect(r.json?.ok).toBe(true);
  }, 90000);

  it("rejects scope=all when not in dev/internal mode", async () => {
    conn = createDb(dbUrl); const db = conn.db;
    await db.insert(users).values({ id: "usr_local_dev", email: "dev@local", name: "Dev" }).onConflictDoNothing();
    const token = `hls_${crypto.randomUUID().replace(/-/g, "")}`;
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const now = new Date();
    const expiresAt = new Date(Date.now() + 60 * 60_000);
    await db.insert(sessions).values({ id: uid("ses"), userId: "usr_local_dev", tokenHash, expiresAt, createdAt: now, lastSeenAt: now }).onConflictDoNothing();
    const apiPort = await getFreePort();
    const apiBase = `http://127.0.0.1:${apiPort}`;
    apiChild = spawnPnpm(path.join(repoRoot, "backend/api"), {
      PORT: String(apiPort), DATABASE_URL: dbUrl,
      HELM_REQUIRE_AUTH: "1", HELM_ALLOW_DEV_AUTH: "0",
      VAULT_MASTER_KEY: "test-vault-master-key-32-bytes-minimum-padding",
    });
    await waitForHttp(`${apiBase}/health`, 45000);
    const res = await fetch(`${apiBase}/v1/reconciliation/run`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify({ scope: "all", olderThanMs: 0, limit: 1 }) });
    const json = await res.json().catch(() => null);
    expect(res.status).toBe(403);
    expect(json?.error?.code).toBe("FORBIDDEN");
  }, 90000);

  it("scheduler tick reconciles uncertain gmail receipt when enabled", async () => {
    conn = createDb(dbUrl); const db = conn.db;
    await db.insert(users).values({ id: "usr_local_dev", email: "dev@local", name: "Dev" }).onConflictDoNothing();
    const taskId = uid("tsk");
    const receiptId = uid("rcpt");
    const idem = `task:${taskId}:action:ah_sched:${receiptId}`;
    const mockPort = await getFreePort();
    const mockBase = `http://127.0.0.1:${mockPort}`;
    const mockCode = [
      "const http=require('node:http');",
      "http.createServer((req,res)=>{",
      " const u=req.url||'';",
      " if(u.startsWith('/gmail/v1/users/me/messages?')){res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({messages:[{id:'msg_sched',threadId:'thr_sched'}]}));return;}",
      " if(u.startsWith('/gmail/v1/users/me/messages/msg_sched')){res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({id:'msg_sched',threadId:'thr_sched',payload:{headers:[{name:'X-Helm-Idempotency',value:process.env.EXPECT_IDEM},{name:'Subject',value:'hi'},{name:'To',value:'a@b.com'}]}}));return;}",
      " res.writeHead(404,{'content-type':'application/json'});res.end(JSON.stringify({error:{message:'not found'}}));",
      `}).listen(${mockPort},'127.0.0.1');`,
    ].join("");
    mockChild = spawn(process.execPath, ["-e", mockCode], { env: { ...process.env, EXPECT_IDEM: idem }, stdio: "pipe" }) as ChildProcessWithoutNullStreams;
    mockChild.stdout.on("data",()=>{}); mockChild.stderr.on("data",()=>{});
    await delay(300);
    const apiPort = await getFreePort();
    const apiBase = `http://127.0.0.1:${apiPort}`;
    apiChild = spawnPnpm(path.join(repoRoot, "backend/api"), {
      PORT: String(apiPort), DATABASE_URL: dbUrl,
      HELM_REQUIRE_AUTH: "0", HELM_ALLOW_DEV_AUTH: "1",
      HELM_GMAIL_API_BASE: mockBase,
      HELM_TEST_CONNECTOR_HTTP: "1",
      HELM_RECONCILIATION_ENABLED: "1",
      HELM_RECONCILIATION_INTERVAL_MS: "10000",
      HELM_RECONCILIATION_OLDER_THAN_MS: "0",
      HELM_RECONCILIATION_LIMIT: "10",
      VAULT_MASTER_KEY: "test-vault-master-key-32-bytes-minimum-padding",
    });
    await waitForHttp(`${apiBase}/health`, 45000);
    const now = new Date(Date.now() - 120_000);
    await db.insert(tasks).values({ id: taskId, userId: "usr_local_dev", title: "recon-sched", prompt: "recon-sched", kind: "connector", status: "failed", priority: 0, createdAt: now, updatedAt: now }).onConflictDoNothing();
    await db.insert(actionReceipts).values({
      id: receiptId, userId: "usr_local_dev", taskId, actionKind: "gmail.send", actionHash: "ah_sched",
      idempotencyKey: idem, status: "uncertain",
      evidence: { accountId: "cac_test", subject: "hi", to: ["a@b.com"] },
      createdAt: now,
    }).onConflictDoNothing();
    const deadline = Date.now() + 30_000;
    let status = "uncertain";
    while (Date.now() < deadline) {
      const [row] = await db.select().from(actionReceipts).where(eq(actionReceipts.id, receiptId)).limit(1);
      status = row?.status ?? status;
      if (status === "executed") break;
      await delay(1000);
    }
    expect(status).toBe("executed");
    const [finalRow] = await db.select().from(actionReceipts).where(eq(actionReceipts.id, receiptId)).limit(1);
    expect(finalRow?.externalRef).toBe("msg_sched");
    await db.delete(actionReceipts).where(eq(actionReceipts.id, receiptId)); await db.delete(taskEvents).where(eq(taskEvents.taskId, taskId)); await db.delete(tasks).where(eq(tasks.id, taskId));
  }, 120000);

  it("reconciles uncertain calendar delete as executed when event is absent", async () => {
    conn = createDb(dbUrl); const db = conn.db;
    await db.insert(users).values({ id: "usr_local_dev", email: "dev@local", name: "Dev" }).onConflictDoNothing();
    const taskId = uid("tsk");
    const receiptId = uid("rcpt");
    const idem = `task:${taskId}:action:ah_caldel:${receiptId}`;
    const mockPort = await getFreePort();
    const mockBase = `http://127.0.0.1:${mockPort}`;
    const mockCode = [
      "const http=require('node:http');",
      "http.createServer((req,res)=>{",
      " const u=req.url||'';",
      " if(u.includes('/calendar/v3/calendars/primary/events/evt_gone')){res.writeHead(404,{'content-type':'application/json'});res.end(JSON.stringify({error:{code:404,message:'Not Found'}}));return;}",
      " res.writeHead(404,{'content-type':'application/json'});res.end(JSON.stringify({error:{message:'not found'}}));",
      `}).listen(${mockPort},'127.0.0.1');`,
    ].join("");
    mockChild = spawn(process.execPath, ["-e", mockCode], { stdio: "pipe" }) as ChildProcessWithoutNullStreams;
    mockChild.stdout.on("data",()=>{}); mockChild.stderr.on("data",()=>{});
    await delay(300);
    const apiPort = await getFreePort();
    const apiBase = `http://127.0.0.1:${apiPort}`;
    apiChild = spawnPnpm(path.join(repoRoot, "backend/api"), {
      PORT: String(apiPort), DATABASE_URL: dbUrl,
      HELM_REQUIRE_AUTH: "0", HELM_ALLOW_DEV_AUTH: "1",
      HELM_CALENDAR_API_BASE: mockBase,
      HELM_TEST_CONNECTOR_HTTP: "1",
      VAULT_MASTER_KEY: "test-vault-master-key-32-bytes-minimum-padding",
    });
    await waitForHttp(`${apiBase}/health`, 45000);
    const now = new Date(Date.now() - 120_000);
    await db.insert(tasks).values({ id: taskId, userId: "usr_local_dev", title: "recon-caldel", prompt: "recon-caldel", kind: "connector", status: "failed", priority: 0, createdAt: now, updatedAt: now }).onConflictDoNothing();
    await db.insert(actionReceipts).values({
      id: receiptId, userId: "usr_local_dev", taskId, actionKind: "calendar.delete_event", actionHash: "ah_caldel",
      idempotencyKey: idem, status: "uncertain",
      evidence: { accountId: "cac_test", calendarId: "primary", eventId: "evt_gone" },
      createdAt: now,
    }).onConflictDoNothing();
    const r1 = await api(apiBase, "/v1/reconciliation/run", { method: "POST", body: JSON.stringify({ olderThanMs: 0, limit: 10 }) });
    expect(r1.status).toBe(200);
    const [after1] = await db.select().from(actionReceipts).where(eq(actionReceipts.id, receiptId)).limit(1);
    expect(after1?.status).toBe("executed");
    expect(after1?.externalRef).toBe("evt_gone");
    await db.delete(actionReceipts).where(eq(actionReceipts.id, receiptId)); await db.delete(taskEvents).where(eq(taskEvents.taskId, taskId)); await db.delete(tasks).where(eq(tasks.id, taskId));
  }, 90000);

  it("reconciles uncertain calendar update as executed when event exists", async () => {
    conn = createDb(dbUrl); const db = conn.db;
    await db.insert(users).values({ id: "usr_local_dev", email: "dev@local", name: "Dev" }).onConflictDoNothing();
    const taskId = uid("tsk");
    const receiptId = uid("rcpt");
    const idem = `task:${taskId}:action:ah_calupd:${receiptId}`;
    const mockPort = await getFreePort();
    const mockBase = `http://127.0.0.1:${mockPort}`;
    const mockCode = [
      "const http=require('node:http');",
      "http.createServer((req,res)=>{",
      " const u=req.url||'';",
      " if(u.includes('/calendar/v3/calendars/primary/events/evt_present')){res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({id:'evt_present',summary:'Standup',htmlLink:'https://calendar/e/p'}));return;}",
      " res.writeHead(404,{'content-type':'application/json'});res.end(JSON.stringify({error:{message:'not found'}}));",
      `}).listen(${mockPort},'127.0.0.1');`,
    ].join("");
    mockChild = spawn(process.execPath, ["-e", mockCode], { stdio: "pipe" }) as ChildProcessWithoutNullStreams;
    mockChild.stdout.on("data",()=>{}); mockChild.stderr.on("data",()=>{});
    await delay(300);
    const apiPort = await getFreePort();
    const apiBase = `http://127.0.0.1:${apiPort}`;
    apiChild = spawnPnpm(path.join(repoRoot, "backend/api"), {
      PORT: String(apiPort), DATABASE_URL: dbUrl,
      HELM_REQUIRE_AUTH: "0", HELM_ALLOW_DEV_AUTH: "1",
      HELM_CALENDAR_API_BASE: mockBase,
      HELM_TEST_CONNECTOR_HTTP: "1",
      VAULT_MASTER_KEY: "test-vault-master-key-32-bytes-minimum-padding",
    });
    await waitForHttp(`${apiBase}/health`, 45000);
    const now = new Date(Date.now() - 120_000);
    await db.insert(tasks).values({ id: taskId, userId: "usr_local_dev", title: "recon-calupd", prompt: "recon-calupd", kind: "connector", status: "failed", priority: 0, createdAt: now, updatedAt: now }).onConflictDoNothing();
    await db.insert(actionReceipts).values({
      id: receiptId, userId: "usr_local_dev", taskId, actionKind: "calendar.update_event", actionHash: "ah_calupd",
      idempotencyKey: idem, status: "uncertain",
      evidence: { accountId: "cac_test", calendarId: "primary", eventId: "evt_present" },
      createdAt: now,
    }).onConflictDoNothing();
    const r1 = await api(apiBase, "/v1/reconciliation/run", { method: "POST", body: JSON.stringify({ olderThanMs: 0, limit: 10 }) });
    expect(r1.status).toBe(200);
    const [after1] = await db.select().from(actionReceipts).where(eq(actionReceipts.id, receiptId)).limit(1);
    expect(after1?.status).toBe("executed");
    expect(after1?.externalRef).toBe("evt_present");
    await db.delete(actionReceipts).where(eq(actionReceipts.id, receiptId)); await db.delete(taskEvents).where(eq(taskEvents.taskId, taskId)); await db.delete(tasks).where(eq(tasks.id, taskId));
  }, 90000);

  it("keeps uncertain calendar delete uncertain when event still exists", async () => {
    conn = createDb(dbUrl); const db = conn.db;
    await db.insert(users).values({ id: "usr_local_dev", email: "dev@local", name: "Dev" }).onConflictDoNothing();
    const taskId = uid("tsk");
    const receiptId = uid("rcpt");
    const idem = `task:${taskId}:action:ah_caldel2:${receiptId}`;
    const mockPort = await getFreePort();
    const mockBase = `http://127.0.0.1:${mockPort}`;
    const mockCode = [
      "const http=require('node:http');",
      "http.createServer((req,res)=>{",
      " const u=req.url||'';",
      " if(u.includes('/calendar/v3/calendars/primary/events/evt_still_there')){res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({id:'evt_still_there',summary:'Standup'}));return;}",
      " res.writeHead(404,{'content-type':'application/json'});res.end(JSON.stringify({error:{message:'not found'}}));",
      `}).listen(${mockPort},'127.0.0.1');`,
    ].join("");
    mockChild = spawn(process.execPath, ["-e", mockCode], { stdio: "pipe" }) as ChildProcessWithoutNullStreams;
    mockChild.stdout.on("data",()=>{}); mockChild.stderr.on("data",()=>{});
    await delay(300);
    const apiPort = await getFreePort();
    const apiBase = `http://127.0.0.1:${apiPort}`;
    apiChild = spawnPnpm(path.join(repoRoot, "backend/api"), {
      PORT: String(apiPort), DATABASE_URL: dbUrl,
      HELM_REQUIRE_AUTH: "0", HELM_ALLOW_DEV_AUTH: "1",
      HELM_CALENDAR_API_BASE: mockBase,
      HELM_TEST_CONNECTOR_HTTP: "1",
      VAULT_MASTER_KEY: "test-vault-master-key-32-bytes-minimum-padding",
    });
    await waitForHttp(`${apiBase}/health`, 45000);
    const now = new Date(Date.now() - 120_000);
    await db.insert(tasks).values({ id: taskId, userId: "usr_local_dev", title: "recon-caldel2", prompt: "recon-caldel2", kind: "connector", status: "failed", priority: 0, createdAt: now, updatedAt: now }).onConflictDoNothing();
    await db.insert(actionReceipts).values({
      id: receiptId, userId: "usr_local_dev", taskId, actionKind: "calendar.delete_event", actionHash: "ah_caldel2",
      idempotencyKey: idem, status: "uncertain",
      evidence: { accountId: "cac_test", calendarId: "primary", eventId: "evt_still_there" },
      createdAt: now,
    }).onConflictDoNothing();
    const r1 = await api(apiBase, "/v1/reconciliation/run", { method: "POST", body: JSON.stringify({ olderThanMs: 0, limit: 10 }) });
    expect(r1.status).toBe(200);
    const [after1] = await db.select().from(actionReceipts).where(eq(actionReceipts.id, receiptId)).limit(1);
    expect(after1?.status).toBe("uncertain");
    const ev = (after1?.evidence ?? {}) as Record<string, unknown>;
    expect(ev.lastReconcileAttemptAt).toBeTruthy();
    expect((ev.lastReconcileLookup as any)?.reason).toBe("event_still_present");
    await db.delete(actionReceipts).where(eq(actionReceipts.id, receiptId)); await db.delete(taskEvents).where(eq(taskEvents.taskId, taskId)); await db.delete(tasks).where(eq(tasks.id, taskId));
  }, 90000);

  it("dry-run lists uncertain candidates without mutating receipts", async () => {
    conn = createDb(dbUrl); const db = conn.db;
    await db.insert(users).values({ id: "usr_local_dev", email: "dev@local", name: "Dev" }).onConflictDoNothing();
    const taskId = uid("tsk");
    const receiptId = uid("rcpt");
    const idem = `task:${taskId}:action:ah_dryrun:${receiptId}`;
    const apiPort = await getFreePort();
    const apiBase = `http://127.0.0.1:${apiPort}`;
    apiChild = spawnPnpm(path.join(repoRoot, "backend/api"), {
      PORT: String(apiPort), DATABASE_URL: dbUrl,
      HELM_REQUIRE_AUTH: "0", HELM_ALLOW_DEV_AUTH: "1",
      HELM_TEST_CONNECTOR_HTTP: "1",
      VAULT_MASTER_KEY: "test-vault-master-key-32-bytes-minimum-padding",
    });
    await waitForHttp(`${apiBase}/health`, 45000);
    const now = new Date(Date.now() - 120_000);
    await db.insert(tasks).values({ id: taskId, userId: "usr_local_dev", title: "recon-dry", prompt: "recon-dry", kind: "connector", status: "failed", priority: 0, createdAt: now, updatedAt: now }).onConflictDoNothing();
    await db.insert(actionReceipts).values({
      id: receiptId, userId: "usr_local_dev", taskId, actionKind: "gmail.send", actionHash: "ah_dryrun",
      idempotencyKey: idem, status: "uncertain",
      evidence: { accountId: "cac_test", to: "a@example.com" },
      createdAt: now,
    }).onConflictDoNothing();
    const r = await api(apiBase, "/v1/reconciliation/dry-run", { method: "POST", body: JSON.stringify({ olderThanMs: 0, limit: 10 }) });
    expect(r.status).toBe(200);
    const j = await r.json() as any;
    expect(j.ok).toBe(true);
    expect(j.dryRun).toBe(true);
    expect(j.scanned).toBeGreaterThanOrEqual(1);
    expect(j.candidates.some((c: any) => c.id === receiptId)).toBe(true);
    const [after] = await db.select().from(actionReceipts).where(eq(actionReceipts.id, receiptId)).limit(1);
    expect(after?.status).toBe("uncertain");
    expect((after?.evidence as any)?.lastReconcileAttemptAt).toBeFalsy();
    await db.delete(actionReceipts).where(eq(actionReceipts.id, receiptId)); await db.delete(taskEvents).where(eq(taskEvents.taskId, taskId)); await db.delete(tasks).where(eq(tasks.id, taskId));
  }, 90000);
});
