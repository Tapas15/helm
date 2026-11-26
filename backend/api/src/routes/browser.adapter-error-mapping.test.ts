import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";

vi.mock("../lib/temporal.js", () => ({ maybeStartExternalActionWorkflow: vi.fn(async () => ({ started: false })) }));

const env = { ...process.env };
const realFetch = globalThis.fetch;

function makeDb() {
  const task = { id: "tsk_1", userId: "u1", status: "running", state: { activeBrowserSessionId: "sess_1" }, currentStepId: "run_1", updatedAt: new Date() };
  const taskRows = [task];
  const thenable = (value: any) => {
    const p: any = Promise.resolve(value);
    p.catch = (fn: any) => Promise.resolve(value).catch(fn);
    p.onConflictDoNothing = () => thenable(value);
    p.returning = async () => Array.isArray(value) ? value : [value];
    p.limit = async (n?: number) => Array.isArray(value) ? value.slice(0, n ?? value.length) : value;
    p.orderBy = () => thenable(value);
    return p;
  };
  return {
    select: () => ({ from: () => ({ where: () => thenable(taskRows), orderBy: () => thenable(taskRows) }) }),
    insert: () => ({ values: (v: any) => thenable([v]) }),
    update: () => ({ set: () => ({ where: () => thenable([]) }) }),
  } as any;
}

function makeApp(browserRoutes: any, db: any) {
  const app = new Hono();
  app.use("*", async (c, next) => { (c.set as any)("userId", "u1"); (c.set as any)("requestId", "req_1"); (c.set as any)("correlationId", "cor_1"); await next(); });
  app.route("/v1/browser", browserRoutes(db));
  return app;
}

describe("browser route adapter error mapping (P6)", () => {
  beforeEach(() => { vi.resetModules(); process.env = { ...env, HELM_TEMPORAL_MODE: "off", HELM_BROWSER_ADAPTER_DISPATCH: "1", BROWSER_ADAPTER: "browseros", BROWSEROS_MCP_URL: "http://127.0.0.1:9210/mcp" }; });
  afterEach(() => { process.env = { ...env }; globalThis.fetch = realFetch; vi.restoreAllMocks(); vi.clearAllMocks(); });

  it("preserves structured adapter error for session stream status failure", { timeout: 15000 }, async () => {
    const fetchSpy = vi.fn(async (_input: any) => new Response("should-not-fetch", { status: 500 }));
    globalThis.fetch = fetchSpy as any;
    vi.doMock("../lib/browser-adapter.js", async () => {
      const actual = await vi.importActual<any>("../lib/browser-adapter.js");
      class FakeAdapter {
        kind = "browseros" as const;
        async request(path: string) {
          if (path === "/v1/sessions/sess_1") return { status: 200, contentType: "application/json", text: JSON.stringify({ session: { id: "sess_1", taskId: "tsk_1" } }) };
          if (path === "/v1/sessions/sess_1/stream/status") return { status: 503, contentType: "application/json", text: JSON.stringify({ ok: false, error: { code: "BROWSEROS_UNAVAILABLE", message: "MCP unavailable", retryable: true } }) };
          return { status: 404, contentType: "application/json", text: JSON.stringify({ error: { code: "NOT_FOUND", message: path } }) };
        }
        async requestBinary() { return { status: 404, contentType: "application/json", body: new TextEncoder().encode("{}").buffer }; }
      }
      return { ...actual, createBrowserAdapter: () => new FakeAdapter() };
    });
    const { browserRoutes } = await import("./browser.js");
    const app = makeApp(browserRoutes, makeDb());
    const res = await app.request("/v1/browser/sessions/sess_1/stream/status");
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ ok: false, error: { code: "BROWSEROS_UNAVAILABLE", retryable: true } });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("preserves selector-not-found structured error for guarded click path proxy result", async () => {
    globalThis.fetch = vi.fn(async () => new Response("should-not-fetch", { status: 500 })) as any;
    // Guarded click requires approval+receipt DB; keep this focused on non-guarded navigate allowlist rejection vs adapter mapping by using snapshot endpoint.
    vi.doMock("../lib/browser-adapter.js", async () => {
      const actual = await vi.importActual<any>("../lib/browser-adapter.js");
      class FakeAdapter {
        kind = "browseros" as const;
        async request(path: string) {
          if (path === "/v1/sessions/sess_1") return { status: 200, contentType: "application/json", text: JSON.stringify({ session: { id: "sess_1", taskId: "tsk_1" } }) };
          if (path === "/v1/sessions/sess_1/snapshot") return { status: 400, contentType: "application/json", text: JSON.stringify({ ok: false, sessionId: "sess_1", action: "snapshot", error: { code: "SELECTOR_NOT_FOUND", message: "Selector not found: #x", retryable: false } }) };
          return { status: 404, contentType: "application/json", text: JSON.stringify({ error: { code: "NOT_FOUND", message: path } }) };
        }
        async requestBinary() { return { status: 404, contentType: "application/json", body: new TextEncoder().encode("{}").buffer }; }
      }
      return { ...actual, createBrowserAdapter: () => new FakeAdapter() };
    });
    const { browserRoutes } = await import("./browser.js");
    const app = makeApp(browserRoutes, makeDb());
    const res = await app.request("/v1/browser/sessions/sess_1/snapshot", { method: "POST" });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ ok: false, error: { code: "SELECTOR_NOT_FOUND", retryable: false } });
  });
});
