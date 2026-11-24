import { describe, expect, it, afterEach } from "vitest";
import { BrowserOSAdapterStub, BrowserOSHttpAdapter, createBrowserAdapter } from "./browser-adapter.js";

const env = { ...process.env };
afterEach(() => { process.env = { ...env }; });

describe("browser adapter factory", () => {
  it("defaults to playwright", () => {
    delete process.env.BROWSER_ADAPTER;
    expect(createBrowserAdapter().kind).toBe("playwright");
  });
  it("returns browseros stub when endpoint/token missing", () => {
    process.env.BROWSER_ADAPTER = "browseros";
    delete process.env.BROWSEROS_BASE_URL;
    delete process.env.BROWSEROS_TOKEN;
    expect(createBrowserAdapter()).toBeInstanceOf(BrowserOSAdapterStub);
  });
  it("returns browseros http adapter when endpoint/token present", () => {
    process.env.BROWSER_ADAPTER = "browseros";
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
});
