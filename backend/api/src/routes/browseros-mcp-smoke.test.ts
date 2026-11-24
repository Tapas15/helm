import { describe, expect, it } from "vitest";
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
});
