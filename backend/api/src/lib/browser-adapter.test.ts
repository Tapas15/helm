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
      const body = p.endsWith("/v1/sessions") ? { session: { id: "s1" } } : { ok: true, action: "navigate" };
      return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
    };
    try {
      const a = new BrowserOSHttpAdapter("http://browseros.local", "secret");
      const session = await a.createSession({ profile: "p1" });
      expect(session.id).toBe("s1");
      const nav = await a.navigate("s1", { url: "https://example.com" });
      expect((nav as any).ok).toBe(true);
      expect(calls[0]?.url).toBe("http://browseros.local/v1/sessions");
      expect((calls[0]?.init?.headers as any)?.authorization).toBe("Bearer secret");
      expect(calls[1]?.url).toBe("http://browseros.local/v1/sessions/s1/navigate");
    } finally {
      globalThis.fetch = orig;
    }
  });
});
