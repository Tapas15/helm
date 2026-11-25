import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import { actionReceipts, approvals, auditLog, browserArtifacts, feedbackEvents, identityPolicies, taskEvents, tasks } from "@helm/db";

vi.mock("../lib/temporal.js", () => ({
  maybeStartExternalActionWorkflow: vi.fn(async () => ({ started: false })),
}));

import { browserRoutes } from "./browser.js";

const env = { ...process.env };
const realFetch = globalThis.fetch;

function makeDb() {
  const feedbackRows: any[] = [];
  const approval = { id: "apr_1", userId: "u1", taskId: "tsk_1", runId: "run_1", status: "approved", actionHash: "hash_1", actionKind: "browser.external.submit" };
  const task = { id: "tsk_1", userId: "u1", status: "running", state: { activeBrowserSessionId: "sess_1" }, currentStepId: null, updatedAt: new Date() };
  const receiptRows: any[] = [];
  const db = {
    feedbackRows,
    select: () => ({
      from: (table: unknown) => ({
        where: () => ({
          limit: async () => {
            if (table === approvals) return [approval];
            if (table === actionReceipts) return receiptRows.slice(-1);
            if (table === tasks) return [task];
            if (table === identityPolicies) return [];
            return [];
          },
          orderBy: () => ({ limit: async () => [] }),
        }),
        orderBy: () => ({
          limit: async () => (table === tasks ? [task] : []),
        }),
      }),
    }),
    insert: (table: unknown) => ({
      values: (v: any) => {
        if (table === feedbackEvents) feedbackRows.push(v);
        if (table === actionReceipts) receiptRows.push({ ...v, id: v.id ?? "rcpt_1" });
        return {
          onConflictDoNothing: () => Promise.resolve(),
          returning: async () => [v],
        };
      },
    }),
    update: () => ({ set: (v: any) => ({ where: () => {
      if (receiptRows.length) Object.assign(receiptRows[receiptRows.length - 1], v);
      return Promise.resolve();
    } }) }),
  } as any;
  return db;
}

function makeApp(db: any) {
  const app = new Hono();
  app.use("*", async (c, next) => { (c.set as any)("userId", "u1"); (c.set as any)("requestId", "req_1"); (c.set as any)("correlationId", "cor_1"); await next(); });
  app.route("/v1/browser", browserRoutes(db));
  return app;
}

describe("browser feedback emission (P7a)", () => {
  beforeEach(() => {
    process.env = { ...env, HELM_TEMPORAL_MODE: "off", HELM_BROWSER_ADAPTER_DISPATCH: "0" };
    globalThis.fetch = vi.fn(async (input: any, init?: any) => {
      const url = String(input);
      if (url.includes("/v1/sessions/sess_1") && (!init?.method || init.method === "GET")) {
        return new Response(JSON.stringify({ session: { id: "sess_1", taskId: "tsk_1", control: { owner: "agent" } } }), { status: 200, headers: { "content-type": "application/json" } });
      }
      return new Response(JSON.stringify({ ok: false, error: { code: "BROWSER_FAIL", message: "Bearer tok_secret failed", retryable: false } }), { status: 500, headers: { "content-type": "application/json" } });
    }) as any;
  });
  afterEach(() => {
    process.env = { ...env };
    globalThis.fetch = realFetch;
    vi.clearAllMocks();
  });

  it("emits redacted tool_failure feedback on guardedAct failure when enabled", async () => {
    process.env.HELM_FEEDBACK_ENABLED = "1";
    const db = makeDb();
    const res = await makeApp(db).request("/v1/browser/sessions/sess_1/click", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ selector: "#btn", approvalId: "apr_1", actionHash: "hash_1", idempotencyKey: "idem_browser_1" }),
    });
    expect(res.status).toBe(500);
    const row = db.feedbackRows.find((r: any) => r.kind === "tool_failure" && r.payload?.source === "browser.guardedAct");
    expect(row).toBeTruthy();
    expect(row.signal).toBe("negative");
    expect(row.severity).toBe("error");
    expect(row.redacted).toBe(true);
    expect(row.taskId).toBe("tsk_1");
    expect(row.runId).toBe("run_1");
    expect(JSON.stringify(row)).not.toContain("tok_secret");
    const actionCall = (globalThis.fetch as any).mock.calls.find((c: any[]) => String(c[0]).includes("/click"));
    const sent = JSON.parse(String(actionCall?.[1]?.body ?? "{}"));
    expect(sent.userId).toBe("u1");
    expect(sent.taskId).toBe("tsk_1");
    expect(sent.runId).toBe("run_1");
    expect(sent.correlationId).toBe("cor_1");
  });

  it("does not emit guardedAct feedback when disabled", async () => {
    process.env.HELM_FEEDBACK_ENABLED = "0";
    const db = makeDb();
    const res = await makeApp(db).request("/v1/browser/sessions/sess_1/click", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ selector: "#btn", approvalId: "apr_1", actionHash: "hash_1", idempotencyKey: "idem_browser_2" }),
    });
    expect(res.status).toBe(500);
    expect(db.feedbackRows).toHaveLength(0);
  });

  it("emits redacted tool_failure feedback on external-action failure when enabled", async () => {
    process.env.HELM_FEEDBACK_ENABLED = "1";
    const db = makeDb();
    const res = await makeApp(db).request("/v1/browser/sessions/sess_1/external-action", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "submit", approvalId: "apr_1", actionHash: "hash_1", idempotencyKey: "idem_browser_ext_1", selector: "#submit" }),
    });
    expect(res.status).toBe(500);
    const row = db.feedbackRows.find((r: any) => r.kind === "tool_failure" && r.payload?.source === "browser.external_action");
    expect(row).toBeTruthy();
    expect(row.signal).toBe("negative");
    expect(row.redacted).toBe(true);
    expect(row.taskId).toBe("tsk_1");
    expect(JSON.stringify(row)).not.toContain("tok_secret");
  });

  it("does not emit external-action feedback when disabled", async () => {
    process.env.HELM_FEEDBACK_ENABLED = "0";
    const db = makeDb();
    const res = await makeApp(db).request("/v1/browser/sessions/sess_1/external-action", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "submit", approvalId: "apr_1", actionHash: "hash_1", idempotencyKey: "idem_browser_ext_2", selector: "#submit" }),
    });
    expect(res.status).toBe(500);
    expect(db.feedbackRows).toHaveLength(0);
  });
});
