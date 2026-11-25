import { describe, expect, it } from "vitest";
import http from "node:http";
import { BrowserOSMcpAdapter } from "../lib/browser-adapter.js";

const enabled = process.env.HELM_BROWSEROS_MCP_SMOKE === "1";
const mcpUrl = process.env.BROWSEROS_MCP_URL ?? "http://127.0.0.1:9210/mcp";
const testUrl = process.env.BROWSEROS_MCP_SMOKE_URL ?? "https://example.com";

describe.skipIf(!enabled)("BrowserOS MCP adapter smoke (env-gated)", () => {
  it("capabilities + create/navigate/snapshot/optional screenshot/close", async () => {
    const adapter = new BrowserOSMcpAdapter(mcpUrl);
    const capsRes = await adapter.request("/v1/capabilities", { method: "GET" });
    expect(capsRes.status).toBe(200);
    const caps = JSON.parse(capsRes.text);
    expect(caps.provider).toBe("browseros-mcp");
    expect(Array.isArray(caps.tools)).toBe(true);
    expect(caps.missing).toEqual([]);

    const session = await adapter.createSession({ initialUrl: testUrl, headless: false });
    expect(session.provider).toBe("browseros");
    expect(session.id).toMatch(/^bos_/);
    try {
      const nav = await adapter.navigate(session.id, { url: testUrl }) as any;
      expect(nav.ok).toBe(true);

      const snap = await adapter.snapshot(session.id) as any;
      expect(snap.ok).toBe(true);
      expect(String(snap.data?.text ?? "").length).toBeGreaterThan(0);

      try {
        const shot = await adapter.screenshot(session.id, { fullPage: false }) as any;
        if (shot.ok) {
          expect(String(shot.data?.mime ?? "")).toContain("image/png");
          expect(String(shot.data?.base64 ?? "").length).toBeGreaterThan(100);
        } else {
          expect(["BROWSEROS_TIMEOUT", "BROWSEROS_ACTION_FAILED", "BROWSEROS_UNAVAILABLE"]).toContain(shot.error?.code);
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        expect(msg).toMatch(/BROWSEROS_TIMEOUT|timed out|BROWSEROS_ACTION_FAILED|BROWSEROS_UNAVAILABLE/i);
      }
    } finally {
      const closed = await adapter.close(session.id) as any;
      expect(closed?.ok).toBe(true);
    }
  }, 180_000);

  it("reports structured error for unknown session", async () => {
    const adapter = new BrowserOSMcpAdapter(mcpUrl);
    const r = await adapter.request("/v1/sessions/bos_missing/snapshot", { method: "POST", body: "{}" });
    expect([400,404]).toContain(r.status);
    const body = JSON.parse(r.text);
    expect(body.ok).toBe(false);
    expect(typeof body.error?.code).toBe("string");
  });

  it("reports structured selector error for click/fill", async () => {
    const adapter = new BrowserOSMcpAdapter(mcpUrl);
    const session = await adapter.createSession({ initialUrl: testUrl, headless: false });
    try {
      const click = await adapter.request(`/v1/sessions/${session.id}/click`, { method: "POST", body: JSON.stringify({ selector: "#helm-definitely-missing" }) });
      expect(click.status).toBe(400);
      const clickBody = JSON.parse(click.text);
      expect(clickBody.ok).toBe(false);
      expect(["SELECTOR_NOT_FOUND","BROWSEROS_ACTION_FAILED","BROWSEROS_TIMEOUT"]).toContain(clickBody.error?.code);

      const fill = await adapter.request(`/v1/sessions/${session.id}/fill`, { method: "POST", body: JSON.stringify({ selector: "#helm-definitely-missing", value: "x", submit: false }) });
      expect(fill.status).toBe(400);
      const fillBody = JSON.parse(fill.text);
      expect(fillBody.ok).toBe(false);
      expect(["SELECTOR_NOT_FOUND","BROWSEROS_ACTION_FAILED","BROWSEROS_TIMEOUT"]).toContain(fillBody.error?.code);
    } finally {
      await adapter.close(session.id).catch(() => undefined);
    }
  }, 180_000);

  it("positive click/fill on controlled local page (no external side effects)", async () => {
    const adapter = new BrowserOSMcpAdapter(mcpUrl);
    const html = '<html><body><input id="name" value=""><button id="btn" onclick="document.getElementById(\'out\').textContent=\'clicked\';">Go</button><div id="out"></div></body></html>';
    const server = http.createServer((_req, res) => { res.writeHead(200, { "content-type": "text/html; charset=utf-8" }); res.end(html); });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
    const addr = server.address();
    if (!addr || typeof addr === "string") throw new Error("failed to bind local test server");
    const localUrl = `http://127.0.0.1:${addr.port}/`;
    const session = await adapter.createSession({ initialUrl: "about:blank", headless: false });
    try {
      const nav = await adapter.navigate(session.id, { url: localUrl }) as any;
      expect(nav.ok).toBe(true);

      const fill = await adapter.request(`/v1/sessions/${session.id}/fill`, { method: "POST", body: JSON.stringify({ selector: "#name", value: "helm", submit: false }) });
      expect(fill.status).toBe(200);
      expect(JSON.parse(fill.text).ok).toBe(true);

      const click = await adapter.request(`/v1/sessions/${session.id}/click`, { method: "POST", body: JSON.stringify({ selector: "#btn" }) });
      expect(click.status).toBe(200);
      expect(JSON.parse(click.text).ok).toBe(true);

      const snap = await adapter.snapshot(session.id) as any;
      expect(snap.ok).toBe(true);
      expect(String(snap.data?.text ?? "").length).toBeGreaterThan(0);
    } finally {
      await adapter.close(session.id).catch(() => undefined);
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  }, 180_000);

  it("takeover request/resume parity (adapter-level, no external side effects)", async () => {
    const adapter = new BrowserOSMcpAdapter(mcpUrl);
    const session = await adapter.createSession({ initialUrl: "about:blank", headless: false });
    try {
      const take = await adapter.request(`/v1/sessions/${session.id}/takeover/request`, { method: "POST", body: JSON.stringify({ reason: "smoke test" }) });
      expect(take.status).toBe(200);
      const takeBody = JSON.parse(take.text);
      expect(takeBody.ok).toBe(true);
      expect(takeBody.data?.control?.owner).toBe("user");

      const statusDuring = await adapter.request(`/v1/sessions/${session.id}/stream/status`, { method: "GET" });
      expect(statusDuring.status).toBe(200);
      const statusBody = JSON.parse(statusDuring.text);
      expect(statusBody.ok).toBe(true);
      expect(statusBody.data?.control?.owner).toBe("user");

      const resume = await adapter.request(`/v1/sessions/${session.id}/takeover/resume`, { method: "POST", body: JSON.stringify({ note: "resume smoke" }) });
      expect(resume.status).toBe(200);
      const resumeBody = JSON.parse(resume.text);
      expect(resumeBody.ok).toBe(true);
      expect(resumeBody.data?.control?.owner).toBe("agent");
    } finally {
      await adapter.close(session.id).catch(() => undefined);
    }
  }, 180_000);
});
