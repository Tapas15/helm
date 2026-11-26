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
  // Return task rows for any table query - this test only validates dispatch routing, not DB table selection.
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

describe("browser dispatch contract (P6)", () => {
  beforeEach(() => { vi.resetModules(); process.env = { ...env, HELM_TEMPORAL_MODE: "off" }; });
  afterEach(() => { process.env = { ...env }; globalThis.fetch = realFetch; vi.restoreAllMocks(); vi.clearAllMocks(); });

  it("dispatch off proxies through browser worker and reports dispatchEnabled false", { timeout: 15000 }, async () => {
    process.env.HELM_BROWSER_ADAPTER_DISPATCH = "0";
    process.env.BROWSER_WORKER_URL = "http://browser-worker.test:8790";
    process.env.BROWSER_WORKER_TOKEN = "tok";
    process.env.BROWSER_ADAPTER = "browseros";
    process.env.BROWSEROS_MCP_URL = "http://127.0.0.1:9210/mcp";

    const fetchSpy = vi.fn(async (input: any) => {
      const url = String(input);
      if (url === "http://browser-worker.test:8790/v1/sessions/sess_1") {
        return new Response(JSON.stringify({ session: { id: "sess_1", taskId: "tsk_1" } }), { status: 200, headers: { "content-type": "application/json" } });
      }
      if (url === "http://browser-worker.test:8790/v1/sessions/sess_1/stream/status") {
        return new Response(JSON.stringify({ ok: true, sessionId: "sess_1", action: "stream_status", data: { control: { owner: "agent" }, status: "ready" } }), { status: 200, headers: { "content-type": "application/json" } });
      }
      return new Response(JSON.stringify({ error: { code: "UNEXPECTED", message: url } }), { status: 500, headers: { "content-type": "application/json" } });
    });
    globalThis.fetch = fetchSpy as any;

    const { browserRoutes } = await import("./browser.js");
    const app = makeApp(browserRoutes, makeDb());

    const statusRes = await app.request("/v1/browser/adapter/status");
    expect(statusRes.status).toBe(200);
    expect(await statusRes.json()).toMatchObject({ ok: true, adapter: "browseros", dispatchEnabled: false });

    const res = await app.request("/v1/browser/sessions/sess_1/stream/status");
    const body = await res.json() as any;
    expect(res.status, JSON.stringify(body)).toBe(200);
    expect(body).toMatchObject({ ok: true, sessionId: "sess_1", action: "stream_status" });
    expect(fetchSpy.mock.calls.map((c: any[]) => String(c[0]))).toEqual(expect.arrayContaining([
      "http://browser-worker.test:8790/v1/sessions/sess_1",
      "http://browser-worker.test:8790/v1/sessions/sess_1/stream/status",
    ]));
    expect(fetchSpy.mock.calls.some((c: any[]) => String(c[0]).includes("127.0.0.1:9210"))).toBe(false);
  });

  it("dispatch on routes through adapter and does not call browser worker fetch", async () => {
    process.env.HELM_BROWSER_ADAPTER_DISPATCH = "1";
    process.env.BROWSER_ADAPTER = "browseros";
    process.env.BROWSEROS_MCP_URL = "http://127.0.0.1:9210/mcp";
    process.env.BROWSER_WORKER_URL = "http://browser-worker.test:8790";

    const fetchSpy = vi.fn(async (_input: any) => new Response(JSON.stringify({ error: "should not call fetch" }), { status: 500, headers: { "content-type": "application/json" } }));
    globalThis.fetch = fetchSpy as any;

    vi.doMock("../lib/browser-adapter.js", async () => {
      const actual = await vi.importActual<any>("../lib/browser-adapter.js");
      class FakeAdapter {
        kind = "browseros" as const;
        async request(path: string) {
          if (path === "/v1/sessions/sess_1") return { status: 200, contentType: "application/json", text: JSON.stringify({ session: { id: "sess_1", taskId: "tsk_1" } }) };
          if (path === "/v1/sessions/sess_1/stream/status") return { status: 200, contentType: "application/json", text: JSON.stringify({ ok: true, sessionId: "sess_1", action: "stream_status", data: { control: { owner: "agent" }, status: "ready" } }) };
          return { status: 404, contentType: "application/json", text: JSON.stringify({ error: { code: "NOT_FOUND", message: path } }) };
        }
        async requestBinary() { return { status: 404, contentType: "application/json", body: new TextEncoder().encode("{}").buffer }; }
      }
      return { ...actual, createBrowserAdapter: () => new FakeAdapter() };
    });

    const { browserRoutes } = await import("./browser.js");
    const app = makeApp(browserRoutes, makeDb());

    const statusRes = await app.request("/v1/browser/adapter/status");
    expect(statusRes.status).toBe(200);
    expect(await statusRes.json()).toMatchObject({ ok: true, adapter: "browseros", dispatchEnabled: true });

    const res = await app.request("/v1/browser/sessions/sess_1/stream/status");
    const body = await res.json() as any;
    expect(res.status, JSON.stringify(body)).toBe(200);
    expect(body).toMatchObject({ ok: true, sessionId: "sess_1", action: "stream_status" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
