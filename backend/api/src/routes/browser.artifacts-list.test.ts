import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import { browserArtifacts, tasks } from "@helm/db";
vi.mock("../lib/temporal.js", () => ({ maybeStartExternalActionWorkflow: vi.fn(async () => ({ started: false })) }));
import { browserRoutes } from "./browser.js";

const env = { ...process.env }; const realFetch = globalThis.fetch;
function makeDb(opts?: { artifacts?: any[]; tasks?: any[] }) {
  const artifactRows = opts?.artifacts ?? [];
  const taskRows = opts?.tasks ?? [{ id: "tsk_1", userId: "u1", status: "running", state: { activeBrowserSessionId: "sess_1" }, currentStepId: "run_1", updatedAt: new Date() }];
  const thenable = (value: any) => { const p: any = Promise.resolve(value); p.catch = (fn: any) => Promise.resolve(value).catch(fn); p.onConflictDoNothing = () => thenable(value); p.returning = async () => value; p.limit = async (n?: number) => Array.isArray(value) ? value.slice(0, n ?? value.length) : value; p.orderBy = () => thenable(value); return p; };
  return {
    select: () => ({ from: (table: unknown) => ({ where: () => thenable(table === browserArtifacts ? artifactRows : table === tasks ? taskRows : []), orderBy: () => thenable(table === tasks ? taskRows : []) }) }),
    insert: () => ({ values: (v: any) => thenable([v]) }),
    update: () => ({ set: () => ({ where: () => thenable([]) }) }),
  } as any;
}
function makeApp(db: any, userId = "u1") {
  const app = new Hono();
  app.use("*", async (c, next) => { (c.set as any)("userId", userId); (c.set as any)("requestId", "req_1"); (c.set as any)("correlationId", "cor_1"); await next(); });
  app.route("/v1/browser", browserRoutes(db));
  return app;
}

describe("browser artifact listing (P3)", () => {
  beforeEach(() => { process.env = { ...env, HELM_TEMPORAL_MODE: "off", HELM_BROWSER_ADAPTER_DISPATCH: "0" }; globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ session: { id: "sess_1", taskId: "tsk_1" } }), { status: 200, headers: { "content-type": "application/json" } })) as any; });
  afterEach(() => { process.env = { ...env }; globalThis.fetch = realFetch; vi.clearAllMocks(); });

  it("lists artifacts for owned session with bounded metadata", async () => {
    const db = makeDb({ artifacts: [{ id: "ba_1", userId: "u1", taskId: "tsk_1", runId: "run_1", sessionId: "sess_1", kind: "screenshot", path: "/secret/path.png", mime: "image/png", sha256: "abc", sizeBytes: 12, metadata: { url: "https://example.com" }, createdAt: new Date("2026-01-01T00:00:00Z") }] });
    const res = await makeApp(db).request("/v1/browser/sessions/sess_1/artifacts?limit=10");
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.ok).toBe(true);
    expect(body.artifacts).toHaveLength(1);
    expect(body.artifacts[0]).toMatchObject({ id: "ba_1", taskId: "tsk_1", kind: "screenshot", mime: "image/png" });
    expect(body.artifacts[0]).not.toHaveProperty("path");
    expect(JSON.stringify(body)).not.toContain("/secret/path.png");
  });

  it("rejects unowned session", async () => {
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ session: { id: "sess_1", taskId: "tsk_other" } }), { status: 200, headers: { "content-type": "application/json" } })) as any;
    const db = makeDb({ tasks: [], artifacts: [] });
    const res = await makeApp(db).request("/v1/browser/sessions/sess_1/artifacts");
    expect(res.status).toBe(403);
  });
});
