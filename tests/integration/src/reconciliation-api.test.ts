import { afterAll, describe, expect, it } from "vitest";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { createDb } from "@helm/db";
import { actionReceipts, tasks, users } from "@helm/db";
import { eq } from "drizzle-orm";

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

    await db.delete(actionReceipts).where(eq(actionReceipts.id, receiptId)); await db.delete(tasks).where(eq(tasks.id, taskId));
  }, 90000);
});
