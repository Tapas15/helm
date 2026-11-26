import { beforeEach, describe, expect, it, vi } from "vitest";

const { postCalls, dbState, reconcileUncertainReceipts } = vi.hoisted(() => {
  const postCalls: Array<{ path: string; body: any; headers: Record<string, string> }> = [];
  const dbState = { createDbCalled: false, ended: false };
  return {
    postCalls,
    dbState,
    reconcileUncertainReceipts: vi.fn(async (_db: any, _input: any) => ({ scanned: 2, reconciled: 1, failed: 0, skipped: 1, errors: [] })),
  };
});

vi.mock("@helm/db", () => ({
  createDb: () => {
    dbState.createDbCalled = true;
    return { db: { __db: true }, pool: { end: async () => { dbState.ended = true; } } };
  },
}));

vi.mock("@helm/observability", () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

vi.mock("../../api/src/lib/reconciliation.js", () => ({ reconcileUncertainReceipts }));

import { createActivities } from "./activities.js";

const env = { ...process.env };
const realFetch = globalThis.fetch;

function mockFetch(status: number, json: any) {
  globalThis.fetch = vi.fn(async (url: any, init: any) => {
    postCalls.push({ path: String(url), body: JSON.parse(init?.body ?? "{}"), headers: init?.headers ?? {} });
    return new Response(JSON.stringify(json), { status, headers: { "content-type": "application/json" } });
  }) as any;
}

describe("temporal activities (P5 deterministic action-class contracts)", () => {
  beforeEach(() => {
    process.env = { ...env, API_URL: "http://127.0.0.1:8787", HELM_INTERNAL_TOKEN: "int_tok", HELM_TEMPORAL_ACTIVITY_SECRET: "sec_tok" };
    postCalls.length = 0;
    dbState.createDbCalled = false;
    dbState.ended = false;
    reconcileUncertainReceipts.mockClear();
    globalThis.fetch = realFetch;
  });

  it("executeApprovedAction posts gmail.send through guarded API with internal headers", async () => {
    mockFetch(200, { receiptId: "rcpt_1", gmailMessageId: "msg_1" });
    const activities = createActivities();
    const out = await activities.executeApprovedAction({
      taskId: "tsk_1", userId: "usr_1", actionKind: "gmail.send", actionHash: "ah_1", idempotencyKey: "idem_1", approvalId: "apr_1",
      payload: { accountId: "cac_1", to: ["a@b.com"], subject: "s", bodyText: "b" },
    } as any);
    expect(out).toMatchObject({ receiptId: "rcpt_1", status: "executed", externalRef: "msg_1" });
    expect(postCalls[0]!.path).toBe("http://127.0.0.1:8787/v1/connectors/gmail/send");
    expect(postCalls[0]!.headers["x-helm-temporal-activity"]).toBe("1");
    expect(postCalls[0]!.headers["x-helm-temporal-activity-secret"]).toBe("sec_tok");
    expect(postCalls[0]!.headers.authorization).toBe("Bearer int_tok");
    expect(postCalls[0]!.body).toMatchObject({ approvalId: "apr_1", actionHash: "ah_1", idempotencyKey: "idem_1" });
  });

  it("maps 503/429/5xx to uncertain for guarded external write actions (no throw, no blind retry)", async () => {
    const activities = createActivities();
    for (const [actionKind, path] of [
      ["gmail.send", "/v1/connectors/gmail/send"],
      ["calendar.create_event", "/v1/connectors/calendar/events/create"],
      ["calendar.update_event", "/v1/connectors/calendar/events/update"],
      ["calendar.delete_event", "/v1/connectors/calendar/events/delete"],
    ] as const) {
      const before = postCalls.length;
      mockFetch(503, { error: { details: { receiptId: `rcpt_${actionKind}` } } });
      const out = await activities.executeApprovedAction({
        taskId: "tsk_1", userId: "usr_1", actionKind, actionHash: "ah", idempotencyKey: `idem_${actionKind}`, approvalId: "apr_1",
        payload: { accountId: "cac_1", to: ["a@b.com"], subject: "s", bodyText: "b", eventId: "evt_1" },
      } as any);
      expect(out.status).toBe("uncertain");
      expect(out.receiptId).toBe(`rcpt_${actionKind}`);
      expect(postCalls.at(-1)?.path).toBe(`http://127.0.0.1:8787${path}`);
      expect(postCalls.length - before).toBe(1);
    }
  });

  it("uncertain provider outcome does not trigger second write/lookup call (no blind retry)", async () => {
    mockFetch(429, { error: { details: { receiptId: "rcpt_gmail_uncertain" } } });
    const activities = createActivities();
    const out = await activities.executeApprovedAction({
      taskId: "tsk_1", userId: "usr_1", actionKind: "gmail.send", actionHash: "ah_1", idempotencyKey: "idem_1", approvalId: "apr_1",
      payload: { accountId: "cac_1", to: ["a@b.com"], subject: "s", bodyText: "b" },
    } as any);
    expect(out).toMatchObject({ status: "uncertain", receiptId: "rcpt_gmail_uncertain" });
    expect(postCalls).toHaveLength(1);
    expect(postCalls[0]!.path).toContain("/v1/connectors/gmail/send");
  });

  it("throws for non-retryable/non-uncertain 4xx to let Temporal classify as terminal by type where applicable", async () => {
    mockFetch(403, { error: { code: "FORBIDDEN", message: "denied" } });
    const activities = createActivities();
    await expect(activities.executeApprovedAction({
      taskId: "tsk_1", userId: "usr_1", actionKind: "gmail.send", actionHash: "ah_1", idempotencyKey: "idem_1", approvalId: "apr_1",
      payload: { accountId: "cac_1", to: ["a@b.com"], subject: "s", bodyText: "b" },
    } as any)).rejects.toThrow(/gmail.send failed: 403/);
  });

  it("routes browser.external_action through guarded browser endpoint and maps uncertain 429", async () => {
    mockFetch(429, { error: { details: { receiptId: "rcpt_browser" } } });
    const activities = createActivities();
    const out = await activities.executeApprovedAction({
      taskId: "tsk_1", userId: "usr_1", actionKind: "browser.external_action", actionHash: "ah_b", idempotencyKey: "idem_b", approvalId: "apr_b",
      payload: { sessionId: "bs_1", action: "click", params: { selector: "#x" } },
    } as any);
    expect(out).toMatchObject({ status: "uncertain", receiptId: "rcpt_browser" });
    expect(postCalls[0]!.path).toBe("http://127.0.0.1:8787/v1/browser/sessions/bs_1/external-action");
    expect(postCalls[0]!.body).toMatchObject({ approvalId: "apr_b", actionHash: "ah_b", idempotencyKey: "idem_b", action: "click" });
  });

  it("rejects unsupported actionKind", async () => {
    const activities = createActivities();
    await expect(activities.executeApprovedAction({
      taskId: "tsk_1", userId: "usr_1", actionKind: "unknown.action", actionHash: "ah", idempotencyKey: "idem", approvalId: "apr",
      payload: {},
    } as any)).rejects.toThrow(/Unsupported temporal actionKind/);
  });

  it("reconcileUncertainReceiptsActivity calls DB-canonical reconciliation and closes pool", async () => {
    const activities = createActivities();
    const out = await activities.reconcileUncertainReceiptsActivity({ limit: 9, olderThanMs: 1234 });
    expect(dbState.createDbCalled).toBe(true);
    expect(reconcileUncertainReceipts).toHaveBeenCalledWith({ __db: true }, { limit: 9, olderThanMs: 1234 });
    expect(out).toMatchObject({ scanned: 2, reconciled: 1, failed: 0, skipped: 1 });
    expect(dbState.ended).toBe(true);
  });

  it("reconciliation fault injection throws without lookup/retry path", async () => {
    process.env.HELM_RECONCILIATION_FAULT_INJECT = "activity_error";
    const activities = createActivities();
    await expect(activities.reconcileUncertainReceiptsActivity({})).rejects.toThrow(/injected_reconciliation_activity_error/);
    expect(reconcileUncertainReceipts).not.toHaveBeenCalled();
  });
});

