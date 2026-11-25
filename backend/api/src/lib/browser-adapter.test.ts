import { describe, expect, it, afterEach, vi } from "vitest";
import { BrowserOSAdapterStub, BrowserOSHttpAdapter, BrowserOSMcpAdapter, createBrowserAdapter } from "./browser-adapter.js";
import { BrowserOSMcpClient } from "./browseros-mcp-client.js";

const env = { ...process.env };
afterEach(() => { process.env = { ...env }; });

describe("browser adapter factory", () => {
  it("defaults to playwright", () => {
    delete process.env.BROWSER_ADAPTER;
    expect(createBrowserAdapter().kind).toBe("playwright");
  });
  it("returns browseros stub when endpoint/token/mcp missing", () => {
    process.env.BROWSER_ADAPTER = "browseros";
    delete process.env.BROWSEROS_MCP_URL;
    delete process.env.BROWSEROS_BASE_URL;
    delete process.env.BROWSEROS_TOKEN;
    expect(createBrowserAdapter()).toBeInstanceOf(BrowserOSAdapterStub);
  });
  it("returns browseros mcp adapter when mcp url present", () => {
    process.env.BROWSER_ADAPTER = "browseros";
    process.env.BROWSEROS_MCP_URL = "http://127.0.0.1:9210/mcp";
    delete process.env.BROWSEROS_BASE_URL;
    delete process.env.BROWSEROS_TOKEN;
    expect(createBrowserAdapter()).toBeInstanceOf(BrowserOSMcpAdapter);
  });
  it("rejects invalid BrowserOS MCP URL with clear config error", () => {
    process.env.BROWSER_ADAPTER = "browseros";
    process.env.BROWSEROS_MCP_URL = "file:///etc/passwd";
    expect(() => createBrowserAdapter()).toThrow(/Invalid BROWSEROS_MCP_URL/);
  });
  it("rejects invalid BrowserOS base URL with clear config error", () => {
    process.env.BROWSER_ADAPTER = "browseros";
    delete process.env.BROWSEROS_MCP_URL;
    process.env.BROWSEROS_BASE_URL = "ftp://bad.example";
    process.env.BROWSEROS_TOKEN = "tok";
    expect(() => createBrowserAdapter()).toThrow(/Invalid BROWSEROS_BASE_URL/);
  });
  it("returns explicit stub when BrowserOS base URL or token is partially configured", async () => {
    process.env.BROWSER_ADAPTER = "browseros";
    delete process.env.BROWSEROS_MCP_URL;
    process.env.BROWSEROS_BASE_URL = "http://127.0.0.1:9999";
    delete process.env.BROWSEROS_TOKEN;
    const a = createBrowserAdapter();
    expect(a).toBeInstanceOf(BrowserOSAdapterStub);
    await expect(a.createSession({} as any)).rejects.toThrow(/BROWSEROS_TOKEN is required/);
  });
  it("rejects non-loopback BrowserOS MCP URL by default", () => {
    process.env.BROWSER_ADAPTER = "browseros";
    process.env.BROWSEROS_MCP_URL = "http://example.internal:9210/mcp";
    delete process.env.HELM_BROWSEROS_ALLOW_REMOTE;
    expect(() => createBrowserAdapter()).toThrow(/HELM_BROWSEROS_ALLOW_REMOTE=1/);
  });
  it("allows non-loopback BrowserOS MCP URL when explicitly enabled", () => {
    process.env.BROWSER_ADAPTER = "browseros";
    process.env.BROWSEROS_MCP_URL = "http://example.internal:9210/mcp";
    process.env.HELM_BROWSEROS_ALLOW_REMOTE = "1";
    expect(createBrowserAdapter()).toBeInstanceOf(BrowserOSMcpAdapter);
  });
  it("returns browseros http adapter when endpoint/token present and mcp absent", () => {
    process.env.BROWSER_ADAPTER = "browseros";
    delete process.env.BROWSEROS_MCP_URL;
    process.env.BROWSEROS_BASE_URL = "http://127.0.0.1:9999";
    process.env.BROWSEROS_TOKEN = "tok";
    expect(createBrowserAdapter()).toBeInstanceOf(BrowserOSHttpAdapter);
  });

  it("BrowserOSHttpAdapter sends auth and parses session/action responses", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const orig = globalThis.fetch;
    globalThis.fetch = async (url: any, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      const p = String(url);
      const body = p.endsWith("/v1/sessions") ? { session: { id: "s1" } }
        : p.endsWith("/navigate") ? { ok: true, action: "navigate" }
        : p.endsWith("/click") ? { ok: true, action: "click" }
        : p.endsWith("/fill") ? { ok: true, action: "fill" }
        : p.endsWith("/screenshot") ? { ok: true, action: "screenshot" }
        : p.endsWith("/snapshot") ? { ok: true, action: "snapshot" }
        : p.endsWith("/close") ? { ok: true }
        : { ok: true };
      return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
    };
    try {
      const a = new BrowserOSHttpAdapter("http://browseros.local", "secret");
      const session = await a.createSession({ profile: "p1" });
      expect(session.id).toBe("s1");
      expect((await a.navigate("s1", { url: "https://example.com" }) as any).ok).toBe(true);
      expect((await a.click("s1", { selector: "#a" }) as any).ok).toBe(true);
      expect((await a.fill("s1", { selector: "#i", value: "x" }) as any).ok).toBe(true);
      expect((await a.screenshot("s1", { fullPage: false }) as any).ok).toBe(true);
      expect((await a.snapshot("s1") as any).ok).toBe(true);
      expect((await a.close("s1")).ok).toBe(true);
      expect(calls[0]?.url).toBe("http://browseros.local/v1/sessions");
      expect((calls[0]?.init?.headers as any)?.authorization).toBe("Bearer secret");
      expect(calls.map(c => c.url)).toEqual([
        "http://browseros.local/v1/sessions",
        "http://browseros.local/v1/sessions/s1/navigate",
        "http://browseros.local/v1/sessions/s1/click",
        "http://browseros.local/v1/sessions/s1/fill",
        "http://browseros.local/v1/sessions/s1/screenshot",
        "http://browseros.local/v1/sessions/s1/snapshot",
        "http://browseros.local/v1/sessions/s1/close",
      ]);
    } finally {
      globalThis.fetch = orig;
    }
  });

  it("BrowserOSHttpAdapter surfaces non-2xx as error", async () => {
    const orig = globalThis.fetch;
    globalThis.fetch = async () => new Response(JSON.stringify({ error: "bad" }), { status: 500, headers: { "content-type": "application/json" } });
    try {
      const a = new BrowserOSHttpAdapter("http://browseros.local", "secret");
      await expect(a.navigate("s1", { url: "https://example.com" })).rejects.toThrow();
    } finally {
      globalThis.fetch = orig;
    }
  });

  it("BrowserOSHttpAdapter requestBinary returns bytes and content type", async () => {
    const orig = globalThis.fetch;
    globalThis.fetch = async () => new Response(Uint8Array.from([1,2,3]), { status: 200, headers: { "content-type": "image/png" } });
    try {
      const a = new BrowserOSHttpAdapter("http://browseros.local", "secret");
      const r = await a.requestBinary("/v1/sessions/s1/screenshot.png");
      expect(r.status).toBe(200);
      expect(r.contentType).toContain("image/png");
      expect(new Uint8Array(r.body)).toEqual(Uint8Array.from([1,2,3]));
    } finally { globalThis.fetch = orig; }
  });

  it("BrowserOSMcpAdapter maps unsupported path to 404 JSON", async () => {
    const a = new BrowserOSMcpAdapter("http://127.0.0.1:9210/mcp");
    const r = await a.request("/v1/unknown", { method: "GET" });
    expect(r.status).toBe(404);
    expect(JSON.parse(r.text).error.code).toBe("NOT_FOUND");
  });

  it("BrowserOSMcpAdapter maps unsupported binary path to 404 JSON", async () => {
    const a = new BrowserOSMcpAdapter("http://127.0.0.1:9210/mcp");
    const r = await a.requestBinary("/v1/sessions/s1/unknown.bin");
    expect(r.status).toBe(404);
    expect(JSON.parse(new TextDecoder().decode(r.body)).error.code).toBe("NOT_FOUND");
  });

  it("BrowserOSMcpAdapter maps MCP/tool failures to structured action errors", async () => {
    const client = new BrowserOSMcpClient("http://127.0.0.1:9210/mcp");
    (client as any).ensureInitialized = vi.fn().mockResolvedValue(undefined);
    (client as any).getSessionId = vi.fn().mockReturnValue("mcp-sess");
    (client as any).ensureCapabilities = vi.fn().mockResolvedValue({ ok: true, checkedAt: new Date().toISOString(), tools: ["tabs","navigate","snapshot","screenshot"], missing: [] });
    (client as any).callTool = vi.fn(async (name: string) => {
      if (name === "tabs") return { content: [{ type: "text", text: "opened page 7" }] };
      if (name === "navigate") throw new Error("MCP request timed out after 30000ms");
      throw new Error(`unexpected tool ${name}`);
    });
    const a = new BrowserOSMcpAdapter("http://127.0.0.1:9210/mcp", { client });
    const session = await a.createSession({ initialUrl: "https://example.com" });
    const raw = await a.request(`/v1/sessions/${session.id}/navigate`, { method: "POST", body: JSON.stringify({ url: "https://example.com" }) });
    expect(raw.status).toBe(400);
    const r = JSON.parse(raw.text);
    expect(r.ok).toBe(false);
    expect(r.error.code).toBe("BROWSEROS_TIMEOUT");
    expect(r.error.retryable).toBe(true);
  });

  it("BrowserOSMcpAdapter reports missing capabilities", async () => {
    const client = new BrowserOSMcpClient("http://127.0.0.1:9210/mcp");
    (client as any).ensureInitialized = vi.fn().mockResolvedValue(undefined);
    (client as any).getSessionId = vi.fn().mockReturnValue("mcp-sess");
    (client as any).ensureCapabilities = vi.fn().mockResolvedValue({ ok: false, checkedAt: new Date().toISOString(), tools: ["tabs"], missing: ["navigate","snapshot","screenshot"] });
    (client as any).callTool = vi.fn();
    const a = new BrowserOSMcpAdapter("http://127.0.0.1:9210/mcp", { client });
    await expect(a.createSession({ initialUrl: "https://example.com" })).rejects.toThrow(/Missing required MCP tools/);
  });

  it("BrowserOSMcpAdapter exposes capability report", async () => {
    const client = new BrowserOSMcpClient("http://127.0.0.1:9210/mcp");
    (client as any).ensureInitialized = vi.fn().mockResolvedValue(undefined);
    (client as any).ensureCapabilities = vi.fn().mockResolvedValue({ ok: true, checkedAt: "2026-11-24T00:00:00.000Z", tools: ["tabs","navigate","snapshot","screenshot"], missing: [] });
    const a = new BrowserOSMcpAdapter("http://127.0.0.1:9210/mcp", { client });
    const r = await a.request("/v1/capabilities", { method: "GET" });
    expect(r.status).toBe(200);
    const body = JSON.parse(r.text);
    expect(body.ok).toBe(true);
    expect(body.provider).toBe("browseros-mcp");
    expect(body.missing).toEqual([]);
  });
});
