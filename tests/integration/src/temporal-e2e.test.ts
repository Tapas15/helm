import { afterAll, describe, expect, it } from "vitest";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { Connection, Client } from "@temporalio/client";

const run = process.env.HELM_TEMPORAL_E2E === "1";
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const address = process.env.TEMPORAL_ADDRESS ?? "localhost:7233";
const namespace = process.env.TEMPORAL_NAMESPACE ?? "default";
const taskQueue = process.env.TEMPORAL_TASK_QUEUE ?? "helm-main";

function spawnPnpm(cwd: string, env: Record<string, string>, script = "dev") {
  const cmd = process.platform === "win32" ? "cmd.exe" : "pnpm";
  const args = process.platform === "win32" ? ["/d", "/s", "/c", "pnpm", script] : [script];
  return spawn(cmd, args, { cwd, env: { ...process.env, ...env }, stdio: "pipe" });
}
async function stopChild(child: ChildProcessWithoutNullStreams | null) {
  if (!child?.pid) return;
  if (process.platform === "win32") await new Promise<void>((resolve) => { const k = spawn("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" }); k.on("exit", () => resolve()); k.on("error", () => resolve()); });
  else { try { child.kill("SIGTERM"); } catch {} }
  await delay(500);
}

(run ? describe : describe.skip)("Temporal real E2E", () => {
  let worker: ChildProcessWithoutNullStreams | null = null;
  afterAll(async () => { await stopChild(worker); });

  it("dedupes workflow by idempotency-derived workflowId and reports status", async () => {
    worker = spawnPnpm(path.join(repoRoot, "backend/temporal-worker"), {
      HELM_TEMPORAL_ENABLED: "1", TEMPORAL_ADDRESS: address, TEMPORAL_NAMESPACE: namespace, TEMPORAL_TASK_QUEUE: taskQueue,
      HELM_ALLOW_DEV_AUTH: "1", API_URL: process.env.HELM_API_URL ?? "http://127.0.0.1:8787",
    });
    await delay(4000);
    const connection = await Connection.connect({ address });
    const client = new Client({ connection, namespace });
    const workflowId = `helm-e2e-${Date.now()}`;
    const input = { taskId: "tsk_e2e", userId: "usr_local_dev", actionKind: "gmail.send", actionHash: "hash_e2e", idempotencyKey: workflowId, payload: { accountId: "cac_missing", to: ["a@b.com"], subject: "s", bodyText: "b" } };
    const h1 = await client.workflow.start("helmExternalActionWorkflow", { taskQueue, workflowId, args: [input] });
    await h1.signal("approve", "apr_e2e");
    let threw = false;
    try { await client.workflow.start("helmExternalActionWorkflow", { taskQueue, workflowId, args: [input] }); } catch { threw = true; }
    expect(threw).toBe(true);
    const desc = await h1.describe();
    expect(desc.workflowId).toBe(workflowId);
    await connection.close();
  }, 60000);
});
