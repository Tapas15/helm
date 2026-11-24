import { describe, expect, it } from "vitest";
import { BrowserOSMcpAdapter } from "../lib/browser-adapter.js";

const enabled = process.env.HELM_BROWSEROS_MCP_SMOKE === "1";
const mcpUrl = process.env.BROWSEROS_MCP_URL ?? "http://127.0.0.1:9210/mcp";
const testUrl = process.env.BROWSEROS_MCP_SMOKE_URL ?? "https://example.com";

describe.skipIf(!enabled)("BrowserOS MCP adapter smoke (env-gated)", () => {
  it("creates, screenshots, snapshots, and closes a session", async () => {
    const adapter = new BrowserOSMcpAdapter(mcpUrl);
    const session = await adapter.createSession({ initialUrl: testUrl, headless: false });
    expect(session.provider).toBe("browseros");
    expect(session.id).toMatch(/^bos_/);
    try {
      const shot = await adapter.screenshot(session.id, { fullPage: false }) as any;
      expect(shot.ok).toBe(true);
      expect(String(shot.data?.mime ?? "")).toContain("image/png");
      expect(String(shot.data?.base64 ?? "").length).toBeGreaterThan(100);
      const snap = await adapter.snapshot(session.id) as any;
      expect(snap.ok).toBe(true);
      expect(String(snap.data?.text ?? "").length).toBeGreaterThan(0);
    } finally {
      await adapter.close(session.id).catch(() => undefined);
    }
  }, 120_000);
});
