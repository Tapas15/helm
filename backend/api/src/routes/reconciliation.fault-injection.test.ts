import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";

const env = { ...process.env };

const { state, lookupGmailSend, lookupCalendarCreate, lookupCalendarEventById, emitFeedbackEventMock } = vi.hoisted(() => {
  const state = {
    receipts: [] as any[],
    audits: [] as any[],
    events: [] as any[],
    receiptUpdates: [] as any[],
    maxSeq: 0,
  };
  return {
    state,
    lookupGmailSend: vi.fn(),
    lookupCalendarCreate: vi.fn(),
    lookupCalendarEventById: vi.fn(),
    emitFeedbackEventMock: vi.fn(async () => undefined),
  };
});

vi.mock("@helm/db", () => ({
  actionReceipts: { status: "status", createdAt: "createdAt", userId: "userId", id: "id" },
  auditLog: {},
  taskEvents: { sequence: "sequence", taskId: "taskId" },
}));

vi.mock("@helm/observability", () => ({ createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }) }));
vi.mock("../lib/vault.js", () => ({ DbCredentialBroker: vi.fn(() => ({})) }));
vi.mock("./gmail.js", () => ({ lookupGmailSend }));
vi.mock("./calendar.js", () => ({ lookupCalendarCreate, lookupCalendarEventById }));
vi.mock("../lib/feedback.js", () => ({ emitFeedbackEvent: emitFeedbackEventMock }));
vi.mock("../lib/temporal.js", () => ({
  getTemporalReconciliationScheduleStatus: vi.fn(async () => ({ enabled: false, scheduleId: "helm-recon", status: "missing" })),
  maybeStartReconciliationSchedule: vi.fn(async () => ({ ok: true })),
}));

import { reconciliationRoutes } from "./reconciliation.js";

function makeDb() {
  const chain = (rows: any[]) => {
    const c: any = {
      from: () => c, where: () => c, orderBy: () => c,
      limit: async (n?: number) => (typeof n === "number" ? rows.slice(0, n) : rows),
      then: (r: any, j: any) => Promise.resolve(rows).then(r, j), catch: (j: any) => Promise.resolve(rows).catch(j),
    };
    return c;
  };
  return {
    select: (shape?: any) => ({
      from: (_table: any) => {
        if (shape?.max !== undefined) return chain([{ max: state.maxSeq }]);
        if (shape?.uncertain !== undefined) return chain([{ uncertain: state.receipts.filter(r => r.status === "uncertain").length, executed: 0, failed: 0 }]);
        return chain(state.receipts.filter(r => r.status === "uncertain"));
      },
    }),
    update: (_table: any) => ({
      set: (values: any) => ({
        where: (_w: any) => {
          const apply = () => {
            state.receiptUpdates.push(values);
            const row = state.receipts[0];
            if (!row) return [];
            if (values.status && values.status !== "uncertain") {
              if (row.status !== "uncertain") return [];
              row.status = values.status; row.externalRef = values.externalRef ?? row.externalRef; row.evidence = values.evidence; return [row];
            }
            row.evidence = values.evidence; return [row];
          };
          const p: any = Promise.resolve().then(apply);
          p.returning = async () => p;
          return p;
        },
      }),
    }),
    insert: (_table: any) => ({ values: async (v: any) => { if (v?.action) state.audits.push(v); else if (v?.type) state.events.push(v); } }),
  } as any;
}

function makeApp(db: any, userId = "usr_1") {
  const app = new Hono();
  app.use("*", async (c, next) => { (c.set as any)("userId", userId); await next(); });
  app.route("/v1/reconciliation", reconciliationRoutes(db));
  return app;
}

const baseReceipt = () => ({ id: "rcpt_1", userId: "usr_1", taskId: "tsk_1", runId: "run_1", actionKind: "gmail.send", actionHash: "ah_1", idempotencyKey: "idem_1", status: "uncertain", externalRef: null, evidence: { accountId: "cac_1", subject: "hi", to: ["a@b.com"] }, createdAt: new Date(Date.now() - 120_000) });

describe("reconciliation route fault-injection no-blind-retry (P5)", () => {
  beforeEach(() => {
    process.env = { ...env, HELM_ALLOW_DEV_AUTH: "1", HELM_RECONCILIATION_ENABLED: "1" };
    state.receipts = [baseReceipt()]; state.audits = []; state.events = []; state.receiptUpdates = []; state.maxSeq = 0;
    vi.clearAllMocks();
    delete process.env.HELM_RECONCILIATION_FAULT_INJECT;
  });
  afterEach(() => { process.env = { ...env }; });

  it("lookup_not_found fault inject: route->service marks lookup attempt, no provider call, no blind retry", async () => {
    process.env.HELM_RECONCILIATION_FAULT_INJECT = "lookup_not_found";
    const res = await makeApp(makeDb()).request("/v1/reconciliation/run", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ olderThanMs: 0 }) });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, scanned: 1, reconciled: 0, failed: 0, skipped: 1 });
    expect(state.receipts[0].status).toBe("uncertain");
    expect(state.receiptUpdates[0].evidence.lastReconcileReason).toBe("injected_not_found");
    expect(lookupGmailSend).not.toHaveBeenCalled();
    expect(state.audits).toHaveLength(0);
  });

  it("lookup_error fault inject: route->service returns failed accounting but keeps receipt uncertain (no blind retry/failover write)", async () => {
    process.env.HELM_RECONCILIATION_FAULT_INJECT = "lookup_error";
    const res = await makeApp(makeDb()).request("/v1/reconciliation/run", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ olderThanMs: 0 }) });
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.ok).toBe(true);
    expect(body.scanned).toBe(1);
    expect(body.failed).toBe(1);
    expect(body.reconciled).toBe(0);
    expect(state.receipts[0].status).toBe("uncertain");
    expect(lookupGmailSend).not.toHaveBeenCalled();
    expect(state.audits).toHaveLength(0);
  });
});
