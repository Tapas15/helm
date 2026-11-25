import { afterAll, describe, expect, it } from "vitest";
import http from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { PlaywrightBrowserExecutor } from "./playwrightExecutor.js";

const enabled = process.env.HELM_PLAYWRIGHT_PERF_SMOKE === "1";

describe.skipIf(!enabled)("Playwright executor perf/parity baseline (env-gated)", () => {
  let dir = "";
  let server: http.Server | null = null;
  let executor: PlaywrightBrowserExecutor | null = null;

  afterAll(async () => {
    if (executor) {
      for (const s of await executor.listSessions()) await executor.closeSession(s.id).catch(() => undefined);
    }
    if (server) await new Promise<void>((resolve) => server!.close(() => resolve()));
    if (dir) await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  });

  it("controlled local page perf/parity baseline (no external side effects)", async () => {
    dir = await mkdtemp(path.join(tmpdir(), "helm-pw-perf-"));
    const artifactDir = path.join(dir, "artifacts");
    const stateDir = path.join(dir, "state");
    executor = new PlaywrightBrowserExecutor({ artifactDir, stateDir });

    const html = '<html><body><h1>Helm Perf</h1><input id="name" value=""><button id="btn" onclick="document.getElementById(\'out\').textContent=document.getElementById(\'name\').value;">Go</button><div id="out"></div></body></html>';
    server = http.createServer((_req, res) => { res.writeHead(200, { "content-type": "text/html; charset=utf-8" }); res.end(html); });
    await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", () => resolve()));
    const addr = server.address();
    if (!addr || typeof addr === "string") throw new Error("failed to bind local test server");
    const localUrl = `http://127.0.0.1:${addr.port}/`;

    const timings: Record<string, number> = {};
    const measure = async <T>(name: string, fn: () => Promise<T>): Promise<T> => {
      const start = performance.now();
      const out = await fn();
      timings[name] = Math.round(performance.now() - start);
      return out;
    };

    const session = await measure("create", () => executor!.createSession({ headless: true, initialUrl: "about:blank", viewport: { width: 1280, height: 720 } } as any));
    expect(session.provider).toBe("playwright");
    expect(session.status).toBe("ready");

    const nav = await measure("navigate", () => executor!.navigate(session.id, { url: localUrl }));
    expect(nav.ok).toBe(true);

    const snap = await measure("snapshot", () => executor!.snapshot(session.id));
    expect(snap.ok).toBe(true);
    expect(String((snap.data as any)?.text ?? "").length).toBeGreaterThan(0);
    expect((snap.data as any)?.artifact?.kind).toBe("dom_snapshot");
    expect(String((snap.data as any)?.artifact?.sha256 ?? "")).toMatch(/^[a-f0-9]{64}$/);

    const fill = await measure("fill", () => executor!.fill(session.id, { selector: "#name", value: "helm", submit: false }));
    expect(fill.ok).toBe(true);

    const click = await measure("click", () => executor!.click(session.id, { selector: "#btn" }));
    expect(click.ok).toBe(true);

    const take = await measure("takeover_request", () => executor!.requestTakeover!(session.id, { reason: "perf baseline" }));
    expect(take.ok).toBe(true);
    expect((take.data as any)?.control?.owner).toBe("user");

    const resume = await measure("takeover_resume", () => executor!.resumeAgent!(session.id, { note: "perf baseline" }));
    expect(resume.ok).toBe(true);
    expect((resume.data as any)?.control?.owner).toBe("agent");

    const close = await measure("close", () => executor!.closeSession(session.id));
    expect(close.ok).toBe(true);

    console.log(`[playwright-perf-baseline] ${JSON.stringify({ localUrl, timings, at: new Date().toISOString() })}`);
    expect(Object.keys(timings).length).toBeGreaterThanOrEqual(8);
  }, 240_000);
});
