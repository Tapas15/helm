import { describe, expect, it, afterEach, vi } from "vitest";
import { BrowserOSMcpAdapter } from "./browser-adapter.js";
import { BrowserOSMcpClient } from "./browseros-mcp-client.js";

describe("BrowserOS MCP adapter parity/error contracts (P6)", () => {
  afterEach(() => { vi.clearAllMocks(); });

  function makeClient(overrides?: Partial<Record<string, any>>) {
    const client = new BrowserOSMcpClient("http://127.0.0.1:9210/mcp");
    (client as any).ensureInitialized = overrides?.ensureInitialized ?? vi.fn().mockResolvedValue(undefined);
    (client as any).getSessionId = overrides?.getSessionId ?? vi.fn().mockReturnValue("mcp-sess");
    (client as any).ensureCapabilities = overrides?.ensureCapabilities ?? vi.fn().mockResolvedValue({ ok: true, checkedAt: "2026-11-26T00:00:00.000Z", tools: ["tabs","navigate","snapshot","screenshot","evaluate_in_page"], missing: [] });
    (client as any).callTool = overrides?.callTool ?? vi.fn();
    return client;
  }

  it("maps click selector-not-found to structured non-retryable error", async () => {
    const client = makeClient({ callTool: vi.fn(async (name: string) => {
      if (name === "tabs") return { content: [{ type: "text", text: "opened page 7" }] };
      if (name === "evaluate_in_page") return { content: [{ type: "text", text: "selector_not_found" }] };
      throw new Error(`unexpected ${name}`);
    }) });
    const a = new BrowserOSMcpAdapter("http://127.0.0.1:9210/mcp", { client });
    const session = await a.createSession({ initialUrl: "https://example.com" });
    const r = await a.request(`/v1/sessions/${session.id}/click`, { method: "POST", body: JSON.stringify({ selector: "#missing" }) });
    expect(r.status).toBe(400);
    const body = JSON.parse(r.text);
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("SELECTOR_NOT_FOUND");
    expect(body.error.retryable).toBe(false);
  });

  it("maps fill selector-not-found to structured non-retryable error", async () => {
    const client = makeClient({ callTool: vi.fn(async (name: string) => {
      if (name === "tabs") return { content: [{ type: "text", text: "opened page 7" }] };
      if (name === "evaluate_in_page") return { content: [{ type: "text", text: "selector_not_found" }] };
      throw new Error(`unexpected ${name}`);
    }) });
    const a = new BrowserOSMcpAdapter("http://127.0.0.1:9210/mcp", { client });
    const session = await a.createSession({ initialUrl: "https://example.com" });
    const r = await a.request(`/v1/sessions/${session.id}/fill`, { method: "POST", body: JSON.stringify({ selector: "#missing", value: "x" }) });
    expect(r.status).toBe(400);
    const body = JSON.parse(r.text);
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("SELECTOR_NOT_FOUND");
    expect(body.error.retryable).toBe(false);
  });

  it("maps MCP timeout to structured retryable BROWSEROS_TIMEOUT", async () => {
    const client = makeClient({ callTool: vi.fn(async (name: string) => {
      if (name === "tabs") return { content: [{ type: "text", text: "opened page 7" }] };
      if (name === "navigate") throw new Error("MCP request timed out after 30000ms");
      throw new Error(`unexpected ${name}`);
    }) });
    const a = new BrowserOSMcpAdapter("http://127.0.0.1:9210/mcp", { client });
    const session = await a.createSession({ initialUrl: "https://example.com" });
    const r = await a.request(`/v1/sessions/${session.id}/navigate`, { method: "POST", body: JSON.stringify({ url: "https://example.com" }) });
    expect(r.status).toBe(400);
    const body = JSON.parse(r.text);
    expect(body.error.code).toBe("BROWSEROS_TIMEOUT");
    expect(body.error.retryable).toBe(true);
  });

  it("returns takeover request/resume + stream status parity shapes", async () => {
    const client = makeClient({ callTool: vi.fn(async (name: string) => {
      if (name === "tabs") return { content: [{ type: "text", text: "opened page 7" }] };
      throw new Error(`unexpected ${name}`);
    }) });
    const a = new BrowserOSMcpAdapter("http://127.0.0.1:9210/mcp", { client });
    const session = await a.createSession({ initialUrl: "about:blank" });

    const take = await a.request(`/v1/sessions/${session.id}/takeover/request`, { method: "POST", body: JSON.stringify({ reason: "test" }) });
    expect(take.status).toBe(200);
    expect(JSON.parse(take.text)).toMatchObject({ ok: true, action: "takeover.request", data: { control: { owner: "user", takeoverReason: "test" } } });

    const streamDuring = await a.request(`/v1/sessions/${session.id}/stream/status`, { method: "GET" });
    expect(streamDuring.status).toBe(200);
    expect(JSON.parse(streamDuring.text)).toMatchObject({ ok: true, action: "stream_status", data: { provider: "browseros-mcp", control: { owner: "user" } } });

    const resume = await a.request(`/v1/sessions/${session.id}/takeover/resume`, { method: "POST", body: JSON.stringify({ note: "ok" }) });
    expect(resume.status).toBe(200);
    expect(JSON.parse(resume.text)).toMatchObject({ ok: true, action: "takeover.resume", data: { control: { owner: "agent" }, note: "ok" } });

    const streamAfter = await a.request(`/v1/sessions/${session.id}/stream/status`, { method: "GET" });
    expect(streamAfter.status).toBe(200);
    expect(JSON.parse(streamAfter.text).data.control.owner).toBe("agent");
  });
});
