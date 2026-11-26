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

describe("browser binary dispatch-off contract (P6)", () => {
  beforeEach(() => { vi.resetModules(); process.env = { ...env, HELM_TEMPORAL_MODE: "off", HELM_BROWSER_ADAPTER_DISPATCH: "0", BROWSER_WORKER_URL: "http://browser-worker.test:8790", BROWSER_WORKER_TOKEN: "tok", BROWSER_ADAPTER: "browseros", BROWSEROS_MCP_URL: "http://127.0.0.1:9210/mcp" }; });
  afterEach(() => { process.env = { ...env }; globalThis.fetch = realFetch; vi.restoreAllMocks(); vi.clearAllMocks(); });

  it("dispatch off proxies binary screenshot through browser worker", { timeout: 15000 }, async () => {
    const fetchSpy = vi.fn(async (input: any, init?: any) => {
      const url = String(input);
      if (url === "http://browser-worker.test:8790/v1/sessions/sess_1") {
        return new Response(JSON.stringify({ session: { id: "sess_1", taskId: "tsk_1" } }), { status: 200, headers: { "content-type": "application/json" } });
      }
      if (url === "http://browser-worker.test:8790/v1/sessions/sess_1/screenshot.png") {
        expect(init?.headers?.authorization ?? init?.headers?.Authorization).toBe("Bearer tok");
        return new Response(Uint8Array.from([137,80,78,71]), { status: 200, headers: { "content-type": "image/png" } });
      }
      return new Response(JSON.stringify({ error: { code: "UNEXPECTED", message: url } }), { status: 500, headers: { "content-type": "application/json" } });
    });
    globalThis.fetch = fetchSpy as any;
    const { browserRoutes } = await import("./browser.js");
    const app = makeApp(browserRoutes, makeDb());
    const res = await app.request("/v1/browser/sessions/sess_1/screenshot.png");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("image/png");
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(Uint8Array.from([137,80,78,71]));
    expect(fetchSpy.mock.calls.some((c: any[]) => String(c[0]).includes("127.0.0.1:9210"))).toBe(false);
  });
});
