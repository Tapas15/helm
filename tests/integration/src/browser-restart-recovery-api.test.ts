import { afterAll, describe, expect, it } from "vitest";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";

const run = process.env.HELM_BROWSER_RECOVERY_API_TEST === "1";
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const dbUrl = process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/helm";

async function getFreePort(): Promise<number> {
  return await new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, "127.0.0.1", () => {
      const addr = srv.address();
      if (!addr || typeof addr === "string") { srv.close(() => reject(new Error("no port"))); return; }
      const { port } = addr;
      srv.close((err) => err ? reject(err) : resolve(port));
    });
    srv.on("error", reject);
  });
}

async function waitForHttp(url: string, headers: Record<string, string>, timeoutMs = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url, { headers });
      if (res.ok) return;
    } catch {}
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
  if (process.platform === "win32") {
    await new Promise<void>((resolve) => {
      const killer = spawn("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" });
      killer.on("exit", () => resolve());
      killer.on("error", () => resolve());
    });
  } else {
    try { child.kill("SIGTERM"); } catch {}
    await Promise.race([new Promise((r) => child.once("exit", r)), delay(5000)]);
    if (child.exitCode === null) try { child.kill("SIGKILL"); } catch {}
  }
  await delay(300);
}

async function api(base: string, path: string, init?: RequestInit, userId = "usr_local_dev") {
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: { "content-type": "application/json", "x-user-id": userId, ...(init?.headers ?? {}) },
  });
  const text = await res.text();
  let json: any = null;
  try { json = JSON.parse(text); } catch {}
  return { status: res.status, json, text };
}

(run ? describe : describe.skip)("Browser restart recovery through API", () => {
  let browserChild: ChildProcessWithoutNullStreams | null = null;
  let apiChild: ChildProcessWithoutNullStreams | null = null;
  let dir = "";

  afterAll(async () => {
    await stopChild(apiChild);
    await stopChild(browserChild);
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  it("recreates browser session through API after browser-worker restart", async () => {
    dir = await mkdtemp(path.join(tmpdir(), "helm-api-bw-recovery-"));
    const browserPort = await getFreePort();
    const apiPort = await getFreePort();
    const browserToken = "test-browser-token";
    const browserBase = `http://127.0.0.1:${browserPort}`;
    const apiBase = `http://127.0.0.1:${apiPort}`;
    const stateDir = path.join(dir, "state");
    const artifactDir = path.join(dir, "artifacts");

    browserChild = spawnPnpm(path.join(repoRoot, "backend/browser-worker"), {
      BROWSER_WORKER_PORT: String(browserPort),
      BROWSER_WORKER_TOKEN: browserToken,
      BROWSER_STATE_DIR: stateDir,
      BROWSER_ARTIFACT_DIR: artifactDir,
    });
    await waitForHttp(`${browserBase}/health`, { authorization: `Bearer ${browserToken}` }, 30000);

    apiChild = spawnPnpm(path.join(repoRoot, "backend/api"), {
      PORT: String(apiPort),
      DATABASE_URL: dbUrl,
      BROWSER_WORKER_URL: browserBase,
      BROWSER_WORKER_TOKEN: browserToken,
      HELM_REQUIRE_AUTH: "0",
      HELM_ALLOW_DEV_AUTH: "1",
    });
    await waitForHttp(`${apiBase}/health`, {}, 45000);

    const createTask = await api(apiBase, "/v1/tasks", { method: "POST", body: JSON.stringify({ prompt: "browser recovery api test", kind: "browser" }) });
    expect(createTask.status).toBe(201);
    const taskId = createTask.json?.task?.id as string;
    expect(taskId).toBeTruthy();

    const createSession = await api(apiBase, "/v1/browser/sessions", { method: "POST", body: JSON.stringify({ taskId, headless: true, initialUrl: "https://example.com" }) });
    expect(createSession.status).toBe(201);
    const sessionId = createSession.json?.session?.id as string;
    expect(sessionId).toBeTruthy();

    const nav = await api(apiBase, `/v1/browser/sessions/${sessionId}/navigate`, { method: "POST", body: JSON.stringify({ url: "https://example.com" }) });
    expect(nav.status).toBe(200);
    expect(nav.json?.ok).toBe(true);

    await stopChild(browserChild);
    browserChild = spawnPnpm(path.join(repoRoot, "backend/browser-worker"), {
      BROWSER_WORKER_PORT: String(browserPort),
      BROWSER_WORKER_TOKEN: browserToken,
      BROWSER_STATE_DIR: stateDir,
      BROWSER_ARTIFACT_DIR: artifactDir,
    });
    await waitForHttp(`${browserBase}/health`, { authorization: `Bearer ${browserToken}` }, 30000);

    const restored = await api(apiBase, `/v1/browser/sessions/${sessionId}`);
    expect(restored.status).toBe(200);
    expect(restored.json?.session?.id).toBe(sessionId);

    const nav2 = await api(apiBase, `/v1/browser/sessions/${sessionId}/navigate`, { method: "POST", body: JSON.stringify({ url: "https://example.com" }) });
    expect(nav2.status).toBe(200);
    expect(nav2.json?.ok).toBe(true);

    const shot = await api(apiBase, `/v1/browser/sessions/${sessionId}/screenshot`, { method: "POST", body: JSON.stringify({ fullPage: false }) });
    expect(shot.status).toBe(200);
    expect(shot.json?.ok).toBe(true);
  }, 180000);
});
