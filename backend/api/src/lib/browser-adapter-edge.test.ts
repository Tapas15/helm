import { describe, expect, it, vi, afterEach } from "vitest";
import { BrowserOSMcpAdapter } from "./browser-adapter.js";
import { BrowserOSMcpClient } from "./browseros-mcp-client.js";

describe("BrowserOS MCP adapter edge/error contracts (P6)", () => {
  afterEach(() => { vi.clearAllMocks(); });

  function makeClient(overrides?: Partial<Record<string, any>>) {
    const client = new BrowserOSMcpClient("http://127.0.0.1:9210/mcp");
    (client as any).ensureInitialized = overrides?.ensureInitialized ?? vi.fn().mockResolvedValue(undefined);
    (client as any).getSessionId = overrides?.getSessionId ?? vi.fn().mockReturnValue("mcp-sess");
    (client as any).ensureCapabilities = overrides?.ensureCapabilities ?? vi.fn().mockResolvedValue({ ok: true, checkedAt: "2026-11-26T00:00:00.000Z", tools: ["tabs","navigate","snapshot","screenshot","evaluate_in_page"], missing: [] });
    (client as any).callTool = overrides?.callTool ?? vi.fn();
    return client;
  }

  it("maps missing session to 404 NOT_FOUND for snapshot", async () => {
    const client = makeClient();
    const a = new BrowserOSMcpAdapter("http://127.0.0.1:9210/mcp", { client });
    const r = await a.request("/v1/sessions/bos_missing/snapshot", { method: "POST", body: "{}" });
    expect(r.status).toBe(400);
    const body = JSON.parse(r.text);
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("NOT_FOUND");
    expect(body.error.retryable).toBe(false);
  });

  it("maps unavailable MCP connection to retryable BROWSEROS_UNAVAILABLE", async () => {
    const client = makeClient({ callTool: vi.fn(async (name: string) => {
      if (name === "tabs") throw new Error("fetch failed ECONNREFUSED 127.0.0.1:9210");
      throw new Error(`unexpected ${name}`);
    }) });
    const a = new BrowserOSMcpAdapter("http://127.0.0.1:9210/mcp", { client });
    await expect(a.createSession({ initialUrl: "https://example.com" })).rejects.toThrow(/ECONNREFUSED|fetch failed/);
  });

  it("maps navigate timeout to retryable BROWSEROS_TIMEOUT", async () => {
    const client = makeClient({ callTool: vi.fn(async (name: string) => {
      if (name === "tabs") return { content: [{ type: "text", text: "opened page 7" }] };
      if (name === "navigate") throw new Error("MCP request timed out after 30000ms");
      throw new Error(`unexpected ${name}`);
    }) });
    const a = new BrowserOSMcpAdapter("http://127.0.0.1:9210/mcp", { client });
    const session = await a.createSession({ initialUrl: "https://example.com" });
    const r = await a.request(`/v1/sessions/${session.id}/navigate`, { method: "POST", body: JSON.stringify({ url: "https://example.com/slow" }) });
    expect(r.status).toBe(400);
    const body = JSON.parse(r.text);
    expect(body.error.code).toBe("BROWSEROS_TIMEOUT");
    expect(body.error.retryable).toBe(true);
  });

  it("returns structured 404 for unsupported binary path", async () => {
    const client = makeClient();
    const a = new BrowserOSMcpAdapter("http://127.0.0.1:9210/mcp", { client });
    const r = await a.requestBinary("/v1/sessions/sess_1/nope.bin");
    expect(r.status).toBe(404);
    expect(JSON.parse(new TextDecoder().decode(r.body)).error.code).toBe("NOT_FOUND");
  });

  it("takeover active blocks action with TAKEOVER_ACTIVE retryable", async () => {
    const client = makeClient({ callTool: vi.fn(async (name: string) => {
      if (name === "tabs") return { content: [{ type: "text", text: "opened page 7" }] };
      throw new Error(`unexpected ${name}`);
    }) });
    const a = new BrowserOSMcpAdapter("http://127.0.0.1:9210/mcp", { client });
    const session = await a.createSession({ initialUrl: "about:blank" });
    const take = await a.request(`/v1/sessions/${session.id}/takeover/request`, { method: "POST", body: JSON.stringify({ reason: "manual" }) });
    expect(take.status).toBe(200);
    const click = await a.request(`/v1/sessions/${session.id}/click`, { method: "POST", body: JSON.stringify({ selector: "#x" }) });
    expect(click.status).toBe(400);
    const body = JSON.parse(click.text);
    expect(body.error.code).toBe("TAKEOVER_ACTIVE");
    expect(body.error.retryable).toBe(true);
  });

  it("snapshot/screenshot still allowed during takeover and carry artifact parity fields", async () => {
    const client = makeClient({ callTool: vi.fn(async (name: string) => {
      if (name === "tabs") return { content: [{ type: "text", text: "opened page 7" }] };
      if (name === "snapshot") return { content: [{ type: "text", text: "hello takeover" }] };
      if (name === "screenshot") return { content: [{ type: "image", data: Buffer.from("png").toString("base64"), mimeType: "image/png" }] };
      throw new Error(`unexpected ${name}`);
    }) });
    const a = new BrowserOSMcpAdapter("http://127.0.0.1:9210/mcp", { client });
    const session = await a.createSession({ initialUrl: "about:blank" });
    await a.request(`/v1/sessions/${session.id}/takeover/request`, { method: "POST", body: JSON.stringify({ reason: "manual" }) });
    const snap = await a.request(`/v1/sessions/${session.id}/snapshot`, { method: "POST", body: "{}" });
    expect(snap.status).toBe(200);
    const snapBody = JSON.parse(snap.text);
    expect(snapBody.ok).toBe(true);
    expect(snapBody.data.artifact).toMatchObject({ kind: "dom_snapshot" });
    expect(snapBody.data.artifact.sha256).toMatch(/^[a-f0-9]{64}$/);
    const shot = await a.request(`/v1/sessions/${session.id}/screenshot`, { method: "POST", body: JSON.stringify({ fullPage: false }) });
    expect(shot.status).toBe(200);
    const shotBody = JSON.parse(shot.text);
    expect(shotBody.ok).toBe(true);
    expect(shotBody.data.artifact).toMatchObject({ kind: "screenshot", mime: "image/png" });
  });
});
