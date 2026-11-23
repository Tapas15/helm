import { afterAll, describe, expect, it } from "vitest";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const run = process.env.HELM_BROWSER_RECOVERY_TEST === "1";

async function waitForHealth(base: string, token: string, timeoutMs = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${base}/health`, { headers: { authorization: `Bearer ${token}` } });
      if (res.ok) return;
    } catch {}
    await delay(250);
  }
  throw new Error("browser-worker did not become healthy");
}

function startWorker(opts: { port: number; token: string; stateDir: string; artifactDir: string }) {
  const cwd = path.resolve(process.cwd());
  const cmd = process.platform === "win32" ? "cmd.exe" : "pnpm";
  const args = process.platform === "win32" ? ["/d", "/s", "/c", "pnpm", "exec", "tsx", "src/index.ts"] : ["exec", "tsx", "src/index.ts"];
  const child = spawn(cmd, args, {
    cwd,
    env: {
      ...process.env,
      BROWSER_WORKER_PORT: String(opts.port),
      BROWSER_WORKER_TOKEN: opts.token,
      BROWSER_STATE_DIR: opts.stateDir,
      BROWSER_ARTIFACT_DIR: opts.artifactDir,
    },
    stdio: "pipe",
  });
  child.stdout.on("data", () => {});
  child.stderr.on("data", () => {});
  return child;
}

async function stopWorker(child: ChildProcessWithoutNullStreams | null) {
  if (!child) return;
  const pid = child.pid;
  if (!pid) return;
  if (process.platform === "win32") {
    await new Promise<void>((resolve) => {
      const killer = spawn("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore" });
      killer.on("exit", () => resolve());
      killer.on("error", () => resolve());
    });
  } else {
    try { child.kill("SIGTERM"); } catch {}
    await Promise.race([new Promise((r) => child.once("exit", r)), delay(5000)]);
    if (!child.killed) try { child.kill("SIGKILL"); } catch {}
  }
  await delay(500);
}

(run ? describe : describe.skip)("browser-worker restart recovery", () => {
  let child: ChildProcessWithoutNullStreams | null = null;
  let dir = "";
  const port = 8799;
  const token = "test-browser-token";
  const base = `http://127.0.0.1:${port}`;

  afterAll(async () => {
    await stopWorker(child);
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  it("restores persisted session after worker restart", async () => {
    dir = await mkdtemp(path.join(tmpdir(), "helm-bw-recovery-"));
    const stateDir = path.join(dir, "state");
    const artifactDir = path.join(dir, "artifacts");
    child = startWorker({ port, token, stateDir, artifactDir });
    await waitForHealth(base, token);

    const create = await fetch(`${base}/v1/sessions`, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify({ headless: true, initialUrl: "https://example.com" }) }).then(r => r.json() as any);
    expect(create.session?.id).toBeTruthy();
    const sessionId = create.session.id as string;

    const nav = await fetch(`${base}/v1/sessions/${sessionId}/navigate`, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify({ url: "https://example.com" }) }).then(r => r.json() as any);
    expect(nav.ok).toBe(true);

    await stopWorker(child);
    child = startWorker({ port, token, stateDir, artifactDir });
    await waitForHealth(base, token);

    const restored = await fetch(`${base}/v1/sessions/${sessionId}`, { headers: { authorization: `Bearer ${token}` } }).then(r => r.json() as any);
    expect(restored.session?.id).toBe(sessionId);
    expect(restored.session?.status).toBe("ready");

    const nav2 = await fetch(`${base}/v1/sessions/${sessionId}/navigate`, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify({ url: "https://example.com" }) }).then(r => r.json() as any);
    expect(nav2.ok).toBe(true);

    const shot = await fetch(`${base}/v1/sessions/${sessionId}/screenshot`, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify({ fullPage: false }) }).then(r => r.json() as any);
    expect(shot.ok).toBe(true);
    expect(shot.data?.artifact?.artifactId).toBeTruthy();
  }, 120000);
});
