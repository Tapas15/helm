import { afterAll, describe, expect, it } from "vitest";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const run = process.env.HELM_BROWSER_RECOVERY_TEST === "1";

async function waitForHealth(base: string, token: string, timeoutMs = 45000, logs?: () => string, child?: ChildProcessWithoutNullStreams | null) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (child && child.exitCode !== null) break;
    try {
      const res = await fetch(`${base}/health`, { headers: { authorization: `Bearer ${token}` } });
      if (res.ok) return;
    } catch {}
    await delay(250);
  }
  const tail = logs?.().slice(-4000) ?? "";
  const exit = child ? ` exitCode=${child.exitCode} signal=${child.signalCode}` : "";
  throw new Error(`browser-worker did not become healthy${exit}${tail ? `\n--- worker logs ---\n${tail}` : ""}`);
}

function startWorker(opts: { port: number; token: string; stateDir: string; artifactDir: string }) {
  const cwd = path.resolve(process.cwd());
  const args = ["exec", "tsx", "src/index.ts"];
  const out: string[] = [];
  const push = (chunk: unknown) => { const s = String(chunk ?? ""); if (s) out.push(s); if (out.length > 200) out.splice(0, out.length - 200); };
  const env = { ...process.env, BROWSER_WORKER_PORT: String(opts.port), BROWSER_WORKER_TOKEN: opts.token, BROWSER_STATE_DIR: opts.stateDir, BROWSER_ARTIFACT_DIR: opts.artifactDir };
  const child = spawn(process.platform === "win32" ? "pnpm.cmd" : "pnpm", args, {
    cwd, env, stdio: "pipe", windowsHide: true, ...(process.platform === "win32" ? { shell: true } : {}),
  });
  child.stdout.on("data", push);
  child.stderr.on("data", push);
  child.on("error", (e) => push(`spawn_error:${e.message}\n`));
  (child as any).__helmLogs = () => out.join("");
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
    await waitForHealth(base, token, 45000, () => (child as any)?.__helmLogs?.() ?? "", child);

    const create = await fetch(`${base}/v1/sessions`, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify({ headless: true, initialUrl: "https://example.com" }) }).then(r => r.json() as any);
    expect(create.session?.id).toBeTruthy();
    const sessionId = create.session.id as string;

    const nav = await fetch(`${base}/v1/sessions/${sessionId}/navigate`, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify({ url: "https://example.com" }) }).then(r => r.json() as any);
    expect(nav.ok).toBe(true);

    await stopWorker(child);
    child = startWorker({ port, token, stateDir, artifactDir });
    await waitForHealth(base, token, 45000, () => (child as any)?.__helmLogs?.() ?? "", child);

    const restored = await fetch(`${base}/v1/sessions/${sessionId}`, { headers: { authorization: `Bearer ${token}` } }).then(r => r.json() as any);
    expect(restored.session?.id).toBe(sessionId);
    expect(restored.session?.status).toBe("ready");

    const nav2 = await fetch(`${base}/v1/sessions/${sessionId}/navigate`, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify({ url: "https://example.com" }) }).then(r => r.json() as any);
    expect(nav2.ok).toBe(true);

    const shot = await fetch(`${base}/v1/sessions/${sessionId}/screenshot`, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify({ fullPage: false }) }).then(r => r.json() as any);
    expect(shot.ok).toBe(true);
    expect(shot.data?.artifact?.artifactId).toBeTruthy();

    const snap = await fetch(`${base}/v1/sessions/${sessionId}/snapshot`, { method: "POST", headers: { authorization: `Bearer ${token}` } }).then(r => r.json() as any);
    expect(snap.ok).toBe(true);

    const status = await fetch(`${base}/v1/sessions/${sessionId}/stream/status`, { headers: { authorization: `Bearer ${token}` } }).then(r => r.json() as any);
    expect(status.ok).toBe(true);

    const missing = await fetch(`${base}/v1/sessions/bs_missing_${Date.now()}`, { headers: { authorization: `Bearer ${token}` } });
    expect(missing.status).toBe(404);
  }, 120000);
});
