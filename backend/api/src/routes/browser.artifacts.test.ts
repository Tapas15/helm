import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import { browserArtifacts, tasks } from "@helm/db";

vi.mock("../lib/temporal.js", () => ({
  maybeStartExternalActionWorkflow: vi.fn(async () => ({ started: false })),
}));

import { browserRoutes } from "./browser.js";

const env = { ...process.env };
const realFetch = globalThis.fetch;

function makeDb() {
  const artifactRows: any[] = [];
  const task = { id: "tsk_1", userId: "u1", status: "running", state: { activeBrowserSessionId: "sess_1" }, currentStepId: "run_1", updatedAt: new Date() };
  const db = {
    artifactRows,
    select: () => ({
      from: (table: unknown) => ({
        where: () => ({
          limit: async () => (table === tasks ? [task] : []),
          orderBy: () => ({ limit: async () => (table === tasks ? [task] : []) }),
        }),
        orderBy: () => ({ limit: async () => (table === tasks ? [task] : []) }),
      }),
    }),
    insert: (table: unknown) => ({
      values: (v: any) => {
        if (table === browserArtifacts) artifactRows.push(v);
        return {
          onConflictDoNothing: () => {
            const p: any = Promise.resolve();
            p.catch = (fn: any) => Promise.resolve().catch(fn);
            return p;
          },
          returning: async () => [v],
        };
      },
    }),
    update: () => ({ set: () => ({ where: async () => undefined }) }),
  } as any;
  return db;
}

function makeApp(db: any) {
  const app = new Hono();
  app.use("*", async (c, next) => { (c.set as any)("userId", "u1"); (c.set as any)("requestId", "req_1"); (c.set as any)("correlationId", "cor_1"); await next(); });
  app.route("/v1/browser", browserRoutes(db));
  return app;
}

describe("browser artifact persistence (P3)", () => {
  beforeEach(() => {
    process.env = { ...env, HELM_TEMPORAL_MODE: "off", HELM_BROWSER_ADAPTER_DISPATCH: "0" };
  });
  afterEach(() => {
    process.env = { ...env };
    globalThis.fetch = realFetch;
    vi.clearAllMocks();
  });

  it("persists screenshot artifact metadata on success", async () => {
    globalThis.fetch = vi.fn(async (input: any) => {
      const url = String(input);
      if (url.includes("/v1/sessions/sess_1") && url.endsWith("/sess_1")) return new Response(JSON.stringify({ session: { id: "sess_1", taskId: "tsk_1" } }), { status: 200, headers: { "content-type": "application/json" } });
      if (url.includes("/screenshot")) return new Response(JSON.stringify({ ok: true, sessionId: "sess_1", action: "screenshot", data: { artifact: { artifactId: "ba_1", kind: "screenshot", path: "/tmp/ba_1.png", mime: "image/png", sha256: "abc", sizeBytes: 12, metadata: { url: "https://example.com" } } } }), { status: 200, headers: { "content-type": "application/json" } });
      return new Response("{}", { status: 404 });
    }) as any;
    const db = makeDb();
    const res = await makeApp(db).request("/v1/browser/sessions/sess_1/screenshot", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ fullPage: false }) });
    expect(res.status).toBe(200);
    expect(db.artifactRows).toHaveLength(1);
    expect(db.artifactRows[0]).toMatchObject({ id: "ba_1", userId: "u1", taskId: "tsk_1", sessionId: "sess_1", kind: "screenshot", mime: "image/png" });
  });

  it("persists snapshot artifact metadata on success", async () => {
    globalThis.fetch = vi.fn(async (input: any) => {
      const url = String(input);
      if (url.includes("/v1/sessions/sess_1") && url.endsWith("/sess_1")) return new Response(JSON.stringify({ session: { id: "sess_1", taskId: "tsk_1" } }), { status: 200, headers: { "content-type": "application/json" } });
      if (url.includes("/snapshot")) return new Response(JSON.stringify({ ok: true, sessionId: "sess_1", action: "snapshot", data: { artifact: { artifactId: "ba_2", kind: "dom_snapshot", path: "/tmp/ba_2.txt", mime: "text/plain; charset=utf-8", sha256: "def", sizeBytes: 5, metadata: {} } } }), { status: 200, headers: { "content-type": "application/json" } });
      return new Response("{}", { status: 404 });
    }) as any;
    const db = makeDb();
    const res = await makeApp(db).request("/v1/browser/sessions/sess_1/snapshot", { method: "POST" });
    expect(res.status).toBe(200);
    expect(db.artifactRows).toHaveLength(1);
    expect(db.artifactRows[0]).toMatchObject({ id: "ba_2", kind: "dom_snapshot", mime: "text/plain; charset=utf-8" });
  });

  it("does not persist artifact on worker failure", async () => {
    globalThis.fetch = vi.fn(async (input: any) => {
      const url = String(input);
      if (url.includes("/v1/sessions/sess_1") && url.endsWith("/sess_1")) return new Response(JSON.stringify({ session: { id: "sess_1", taskId: "tsk_1" } }), { status: 200, headers: { "content-type": "application/json" } });
      if (url.includes("/screenshot")) return new Response(JSON.stringify({ ok: false, error: { code: "BROWSER_FAIL", message: "fail", retryable: false } }), { status: 500, headers: { "content-type": "application/json" } });
      return new Response("{}", { status: 404 });
    }) as any;
    const db = makeDb();
    const res = await makeApp(db).request("/v1/browser/sessions/sess_1/screenshot", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ fullPage: false }) });
    expect(res.status).toBe(500);
    expect(db.artifactRows).toHaveLength(0);
  });
});
