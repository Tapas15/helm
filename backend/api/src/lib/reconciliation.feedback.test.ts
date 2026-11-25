import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { actionReceipts, auditLog, feedbackEvents, taskEvents } from "@helm/db";

vi.mock("./vault.js", () => ({
  DbCredentialBroker: class { constructor(_db: unknown) {} },
}));
vi.mock("../routes/gmail.js", () => ({
  lookupGmailSend: vi.fn(async () => ({ ok: true, externalRef: "gmail_msg_1" })),
}));
vi.mock("../routes/calendar.js", () => ({
  lookupCalendarCreate: vi.fn(async () => ({ ok: true, externalRef: "cal_evt_1" })),
  lookupCalendarEventById: vi.fn(async () => ({ ok: true, externalRef: "cal_evt_1" })),
}));

import { reconcileUncertainReceipts } from "./reconciliation.js";
import { lookupGmailSend } from "../routes/gmail.js";

const env = { ...process.env };

function makeDb(opts?: { receipts?: any[] }) {
  const receipts = opts?.receipts ?? [];
  const feedbackRows: any[] = [];
  const auditRows: any[] = [];
  const taskEventRows: any[] = [];
  const updates: any[] = [];

  const db: any = {
    feedbackRows, auditRows, taskEventRows, updates,
    select: (_sel?: any) => ({
      from: (table: unknown) => ({
        where: (_w?: unknown) => {
          const q: any = {
            limit: async (_n?: number) => {
              if (table === actionReceipts) return receipts;
              if (table === taskEvents) return [{ max: -1 }];
              return [];
            },
          };
          return q;
        },
      }),
    }),
    update: (table: unknown) => ({
      set: (v: any) => ({
        where: (_w?: unknown) => {
          updates.push({ table, values: v });
          const r: any = Promise.resolve();
          r.returning = async () => {
            if (table === actionReceipts) return receipts.length ? [{ ...receipts[0], ...v }] : [];
            return [];
          };
          return r;
        },
      }),
    }),
    insert: (table: unknown) => ({
      values: async (v: any) => {
        if (table === feedbackEvents) feedbackRows.push(v);
        if (table === auditLog) auditRows.push(v);
        if (table === taskEvents) taskEventRows.push(v);
        return [v];
      },
    }),
  };
  return db;
}

describe("reconcileUncertainReceipts feedback emission (P7a)", () => {
  beforeEach(() => {
    process.env = { ...env };
    vi.clearAllMocks();
  });
  afterEach(() => { process.env = { ...env }; });

  it("does not emit feedback when HELM_FEEDBACK_ENABLED!=1", async () => {
    process.env.HELM_FEEDBACK_ENABLED = "0";
    const db = makeDb({ receipts: [{ id: "rcpt_1", userId: "u1", taskId: "tsk_1", runId: "run_1", actionKind: "gmail.send", idempotencyKey: "idem_1", externalRef: null, evidence: {}, status: "uncertain", createdAt: new Date(Date.now() - 120000) }] });
    const res = await reconcileUncertainReceipts(db, { limit: 10, olderThanMs: 0 });
    expect(res.reconciled).toBe(1);
    expect(db.auditRows.some((r: any) => r.action === "receipt.reconciled")).toBe(true);
    expect(db.feedbackRows).toHaveLength(0);
  });

  it("does not emit feedback when lookup is not found (no blind retry)", async () => {
    process.env.HELM_FEEDBACK_ENABLED = "1";
    vi.mocked(lookupGmailSend).mockResolvedValueOnce({ ok: false, reason: "not_found" } as any);
    const db = makeDb({ receipts: [{ id: "rcpt_3", userId: "u1", taskId: "tsk_3", runId: "run_3", actionKind: "gmail.send", idempotencyKey: "idem_3", externalRef: null, evidence: {}, status: "uncertain", createdAt: new Date(Date.now() - 120000) }] });
    const res = await reconcileUncertainReceipts(db, { limit: 10, olderThanMs: 0 });
    expect(res.reconciled).toBe(0);
    expect(res.skipped).toBe(1);
    expect(db.feedbackRows).toHaveLength(0);
    expect(db.auditRows.some((r: any) => r.action === "receipt.reconciled")).toBe(false);
    expect(db.updates.some((u: any) => u.values?.status === "executed" || u.values?.status === "failed")).toBe(false);
  });

  it("does not emit feedback or mutate receipt status on lookup exception (no blind retry)", async () => {
    process.env.HELM_FEEDBACK_ENABLED = "1";
    vi.mocked(lookupGmailSend).mockRejectedValueOnce(new Error("Bearer secret-token network boom"));
    const db = makeDb({ receipts: [{ id: "rcpt_4", userId: "u1", taskId: "tsk_4", runId: "run_4", actionKind: "gmail.send", idempotencyKey: "idem_4", externalRef: null, evidence: {}, status: "uncertain", createdAt: new Date(Date.now() - 120000) }] });
    const res = await reconcileUncertainReceipts(db, { limit: 10, olderThanMs: 0 });
    expect(res.reconciled).toBe(0);
    expect(res.failed).toBe(1);
    expect(res.errors[0]?.receiptId).toBe("rcpt_4");
    expect(db.feedbackRows).toHaveLength(0);
    expect(db.auditRows.some((r: any) => r.action === "receipt.reconciled")).toBe(false);
    expect(db.updates.some((u: any) => u.values?.status === "executed" || u.values?.status === "failed")).toBe(false);
  });
});
