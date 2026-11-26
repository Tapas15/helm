import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";

vi.mock("../lib/temporal.js", () => ({ maybeStartExternalActionWorkflow: vi.fn(async () => ({ started: false })) }));
const env = { ...process.env };

function makeDb() {
  const task = { id: "tsk_1", userId: "u1", status: "running", state: { activeBrowserSessionId: "sess_1" }, currentStepId: "run_1", updatedAt: new Date() };
  const taskRows = [task];
  const thenable = (value: any) => { const p: any = Promise.resolve(value); p.catch = (fn: any) => Promise.resolve(value).catch(fn); p.onConflictDoNothing = () => thenable(value); p.returning = async () => Array.isArray(value) ? value : [value]; p.limit = async (n?: number) => Array.isArray(value) ? value.slice(0, n ?? value.length) : value; p.orderBy = () => thenable(value); return p; };
  return { select: () => ({ from: () => ({ where: () => thenable(taskRows), orderBy: () => thenable(taskRows) }) }), insert: () => ({ values: (v: any) => thenable([v]) }), update: () => ({ set: () => ({ where: () => thenable([]) }) }) } as any;
}

describe("browser proxy JSON redaction (P8)", () => {
  beforeEach(() => { vi.resetModules(); process.env = { ...env, HELM_TEMPORAL_MODE: "off", HELM_BROWSER_ADAPTER_DISPATCH: "1" }; });
  afterEach(() => { process.env = { ...env }; vi.restoreAllMocks(); vi.clearAllMocks(); });

  it("redacts sensitive/path fields in proxied JSON responses", async () => {
    vi.doMock("../lib/browser-adapter.js", async () => {
      const actual = await vi.importActual<any>("../lib/browser-adapter.js");
      class FakeAdapter {
        kind = "browseros" as const;
        async request(path: string) {
          if (path === "/v1/sessions/sess_1") return { status: 200, contentType: "application/json", text: JSON.stringify({ session: { id: "sess_1", taskId: "tsk_1", metadata: { apiKey: "sk-live", path: "C:\\Users\\Tapas\\secret.txt", safe: "ok" } } }) };
          return { status: 404, contentType: "application/json", text: "{}" };
        }
        async requestBinary() { return { status: 404, contentType: "application/json", body: new ArrayBuffer(0) }; }
      }
      return { ...actual, createBrowserAdapter: () => new FakeAdapter() };
    });
    const { browserRoutes } = await import("./browser.js");
    const db = makeDb();
    const app = new Hono();
    app.use("*", async (c, next) => { (c.set as any)("userId", "u1"); (c.set as any)("requestId", "req_1"); (c.set as any)("correlationId", "cor_1"); await next(); });
    app.route("/v1/browser", browserRoutes(db));
    const res = await app.request("/v1/browser/sessions/sess_1");
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.session.metadata.apiKey).toBe("[REDACTED]");
    expect(body.session.metadata.path).toBe("[REDACTED_PATH]");
    expect(body.session.metadata.safe).toBe("ok");
    const s = JSON.stringify(body);
    expect(s).not.toContain("sk-live");
    expect(s).not.toContain("C:\\\\Users\\\\Tapas\\\\secret.txt");
  });
});
