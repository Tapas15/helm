import { beforeEach, describe, expect, it, vi } from "vitest";

const { state, db, emitFeedbackEventMock, vaultMock, lookupGmailSend, lookupCalendarCreate, lookupCalendarEventById } = vi.hoisted(() => {
  const state = {
    receipts: [] as any[],
    audits: [] as any[],
    events: [] as any[],
    maxSeq: -1,
    receiptUpdates: [] as any[],
  };
  const chain = (rows: any[]) => {
    const c: any = {
      from: () => c,
      where: () => c,
      limit: async (n?: number) => (typeof n === "number" ? rows.slice(0, n) : rows),
      orderBy: () => c,
      then: (resolve: any, reject: any) => Promise.resolve(rows).then(resolve, reject),
      catch: (reject: any) => Promise.resolve(rows).catch(reject),
    };
    return c;
  };
  const db = {
    select: (shape?: any) => ({
      from: (_table: any) => {
        if (shape?.max !== undefined) return chain([{ max: state.maxSeq }]);
        return chain(state.receipts);
      },
    }),
    update: (_table: any) => ({
      set: (values: any) => ({
        where: (_where: any) => {
          const apply = () => {
            state.receiptUpdates.push(values);
            const row = state.receipts[0];
            if (!row) return [];
            if (values.status && values.status !== "uncertain") {
              if (row.status !== "uncertain") return [];
              row.status = values.status;
              row.externalRef = values.externalRef ?? row.externalRef;
              row.evidence = values.evidence;
              return [row];
            }
            row.evidence = values.evidence;
            return [row];
          };
          const p: any = Promise.resolve().then(apply);
          p.returning = async () => p;
          return p;
        },
      }),
    }),
    insert: (_table: any) => ({
      values: async (value: any) => {
        if (value?.action && value?.resourceType) state.audits.push(value);
        else if (value?.type && value?.sequence !== undefined) state.events.push(value);
      },
    }),
  };
  return {
    state,
    db,
    emitFeedbackEventMock: vi.fn(async () => undefined),
    vaultMock: vi.fn(),
    lookupGmailSend: vi.fn(),
    lookupCalendarCreate: vi.fn(),
    lookupCalendarEventById: vi.fn(),
  };
});

vi.mock("@helm/db", () => ({
  actionReceipts: { status: "status", createdAt: "createdAt", userId: "userId", id: "id" },
  auditLog: { [Symbol.for("drizzle:Name")]: "audit_log" },
  taskEvents: { [Symbol.for("drizzle:Name")]: "task_events", sequence: "sequence", taskId: "taskId" },
}));

vi.mock("@helm/observability", () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

vi.mock("./vault.js", () => ({ DbCredentialBroker: vaultMock }));
vi.mock("../routes/gmail.js", () => ({ lookupGmailSend }));
vi.mock("../routes/calendar.js", () => ({ lookupCalendarCreate, lookupCalendarEventById }));
vi.mock("./feedback.js", () => ({ emitFeedbackEvent: emitFeedbackEventMock }));

import { reconcileUncertainReceipts } from "./reconciliation.js";

const baseReceipt = (over: Partial<any> = {}) => ({
  id: "rcpt_1",
  userId: "usr_1",
  taskId: "tsk_1",
  runId: "run_1",
  actionKind: "gmail.send",
  actionHash: "ah_1",
  idempotencyKey: "idem_1",
  status: "uncertain",
  externalRef: null,
  evidence: { accountId: "cac_1", subject: "hi", to: ["a@b.com"] },
  createdAt: new Date(Date.now() - 120_000),
  ...over,
});

describe("reconcileUncertainReceipts (P5 DB-canonical, no-blind-retry)", () => {
  beforeEach(() => {
    state.receipts = [];
    state.audits = [];
    state.events = [];
    state.maxSeq = 3;
    state.receiptUpdates = [];
    vi.clearAllMocks();
    delete process.env.HELM_RECONCILIATION_FAULT_INJECT;
  });

  it("records lookup attempt and keeps receipt uncertain when provider lookup not found (no blind retry)", async () => {
    state.receipts = [baseReceipt()];
    lookupGmailSend.mockResolvedValueOnce({ ok: false, reason: "not_found", checked: 2 });
    const out = await reconcileUncertainReceipts(db as any, { olderThanMs: 0, limit: 10 });
    expect(out).toMatchObject({ scanned: 1, reconciled: 0, failed: 0, skipped: 1 });
    expect(state.receipts[0].status).toBe("uncertain");
    expect(state.receiptUpdates[0]).toMatchObject({ evidence: expect.objectContaining({ lastReconcileReason: "not_found", lastReconcileLookup: { ok: false, reason: "not_found", checked: 2 } }) });
    expect(state.audits).toHaveLength(0);
    expect(state.events).toHaveLength(0);
    expect(emitFeedbackEventMock).not.toHaveBeenCalled();
  });

  it("marks receipt executed when lookup proves external side effect; writes audit/event/feedback", async () => {
    state.receipts = [baseReceipt()];
    lookupGmailSend.mockResolvedValueOnce({ ok: true, externalRef: "msg_1", matchedBy: "idempotency_header" });
    const out = await reconcileUncertainReceipts(db as any, { olderThanMs: 0, limit: 10 });
    expect(out).toMatchObject({ scanned: 1, reconciled: 1, failed: 0, skipped: 0 });
    expect(state.receipts[0].status).toBe("executed");
    expect(state.receipts[0].externalRef).toBe("msg_1");
    expect(state.receiptUpdates[0]).toMatchObject({ status: "executed", externalRef: "msg_1", evidence: expect.objectContaining({ reconciled: true, reconcileOutcome: "executed", reconciledBy: "scheduler" }) });
    expect(state.audits).toHaveLength(1);
    expect(state.audits[0]).toMatchObject({ action: "receipt.reconciled", resourceId: "rcpt_1", reason: "auto_lookup_executed" });
    expect(state.events).toHaveLength(1);
    expect(state.events[0]).toMatchObject({ type: "receipt.reconciled", sequence: 4, payload: expect.objectContaining({ receiptId: "rcpt_1", status: "executed", externalRef: "msg_1" }) });
    expect(emitFeedbackEventMock).toHaveBeenCalledWith(db, expect.objectContaining({ kind: "tool_failure", signal: "positive", summary: "reconciliation.executed" }));
  });

  it("does not blindly fail on lookup fault injection; records error and keeps uncertain", async () => {
    process.env.HELM_RECONCILIATION_FAULT_INJECT = "lookup_error";
    state.receipts = [baseReceipt()];
    const out = await reconcileUncertainReceipts(db as any, { olderThanMs: 0, limit: 10 });
    expect(out.scanned).toBe(1);
    expect(out.failed).toBe(1);
    expect(out.reconciled).toBe(0);
    expect(state.receipts[0].status).toBe("uncertain");
    expect(out.errors[0]!).toMatchObject({ receiptId: "rcpt_1" });
    expect(String(out.errors[0]!.error)).toContain("injected_reconciliation_lookup_error");
    expect(lookupGmailSend).not.toHaveBeenCalled();
  });

  it("lookup_not_found fault injection records attempt and skips without blind retry", async () => {
    process.env.HELM_RECONCILIATION_FAULT_INJECT = "lookup_not_found";
    state.receipts = [baseReceipt()];
    const out = await reconcileUncertainReceipts(db as any, { olderThanMs: 0, limit: 10 });
    expect(out).toMatchObject({ scanned: 1, reconciled: 0, failed: 0, skipped: 1 });
    expect(state.receipts[0].status).toBe("uncertain");
    expect(state.receiptUpdates[0].evidence.lastReconcileReason).toBe("injected_not_found");
    expect(lookupGmailSend).not.toHaveBeenCalled();
  });

  it("skips unsupported action kinds without mutation", async () => {
    state.receipts = [baseReceipt({ actionKind: "browser.external_action" })];
    const out = await reconcileUncertainReceipts(db as any, { olderThanMs: 0, limit: 10 });
    expect(out).toMatchObject({ scanned: 1, reconciled: 0, failed: 0, skipped: 1 });
    expect(state.receiptUpdates).toHaveLength(0);
  });

  it("reconciles calendar delete as executed only when lookup proves absence", async () => {
    state.receipts = [baseReceipt({ actionKind: "calendar.delete_event", evidence: { accountId: "cac_1", calendarId: "primary", eventId: "evt_1" } })];
    lookupCalendarEventById.mockResolvedValueOnce({ ok: true, externalRef: "evt_1", matchedBy: "event_absent" });
    const out = await reconcileUncertainReceipts(db as any, { olderThanMs: 0, limit: 10 });
    expect(out.reconciled).toBe(1);
    expect(lookupCalendarEventById).toHaveBeenCalledWith(db, expect.anything(), "usr_1", expect.anything(), false);
    expect(state.receipts[0].status).toBe("executed");
  });


  it("repeated not-found runs keep receipt uncertain and record lookup attempts (no blind retry)", async () => {
    state.receipts = [baseReceipt()];
    lookupGmailSend.mockResolvedValue({ ok: false, reason: "not_found", checked: 1 });
    const out1 = await reconcileUncertainReceipts(db as any, { olderThanMs: 0, limit: 10 });
    expect(out1).toMatchObject({ scanned: 1, reconciled: 0, failed: 0, skipped: 1 });
    expect(state.receipts[0].status).toBe("uncertain");
    expect(state.receiptUpdates).toHaveLength(1);

    const out2 = await reconcileUncertainReceipts(db as any, { olderThanMs: 0, limit: 10 });
    expect(out2).toMatchObject({ scanned: 1, reconciled: 0, failed: 0, skipped: 1 });
    expect(state.receipts[0].status).toBe("uncertain");
    expect(state.receiptUpdates).toHaveLength(2);
    expect(lookupGmailSend).toHaveBeenCalledTimes(2);
    expect(state.audits).toHaveLength(0);
    expect(state.events).toHaveLength(0);
    expect(emitFeedbackEventMock).not.toHaveBeenCalled();
  });

  it("repeated run after successful reconciliation is DB-canonical no-op (receipt no longer uncertain)", async () => {
    state.receipts = [baseReceipt()];
    lookupGmailSend.mockResolvedValueOnce({ ok: true, externalRef: "msg_1", matchedBy: "idempotency_header" });
    const out1 = await reconcileUncertainReceipts(db as any, { olderThanMs: 0, limit: 10 });
    expect(out1).toMatchObject({ scanned: 1, reconciled: 1, failed: 0, skipped: 0 });

    // DB-canonical: resolved receipt no longer selected as uncertain.
    state.receipts = [];
    const out2 = await reconcileUncertainReceipts(db as any, { olderThanMs: 0, limit: 10 });
    expect(out2).toMatchObject({ scanned: 0, reconciled: 0, failed: 0, skipped: 0, errors: [] });
    expect(state.audits).toHaveLength(1);
    expect(state.events).toHaveLength(1);
    expect(emitFeedbackEventMock).toHaveBeenCalledTimes(1);
});



});
