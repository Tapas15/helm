import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { __getTemporalStubState, __resetTemporalStubForTests, getTemporalReconciliationScheduleStatus, maybeStartExternalActionWorkflow, maybeStartReconciliationSchedule } from "./temporal.js";

const env = { ...process.env };

describe("temporal lib (P5 stub-mode contracts, no real Temporal)", () => {
  beforeEach(() => {
    process.env = { ...env };
    __resetTemporalStubForTests();
  });
  afterEach(() => {
    process.env = { ...env };
    __resetTemporalStubForTests();
  });

  it("maybeStartReconciliationSchedule returns disabled when Temporal disabled", async () => {
    process.env.HELM_TEMPORAL_ENABLED = "0";
    const out = await maybeStartReconciliationSchedule();
    expect(out).toEqual({ ok: false, reason: "temporal_disabled" });
  });

  it("maybeStartReconciliationSchedule returns schedule_disabled when schedule flag off", async () => {
    process.env.HELM_TEMPORAL_ENABLED = "1";
    process.env.HELM_TEMPORAL_MODE = "external-write";
    process.env.HELM_TEMPORAL_TEST_MODE = "stub";
    delete process.env.HELM_TEMPORAL_RECONCILIATION_SCHEDULE_ENABLED;
    const out = await maybeStartReconciliationSchedule();
    expect(out).toEqual({ ok: false, reason: "schedule_disabled" });
  });

  it("stub schedule ensure creates then updates same schedule id", async () => {
    process.env.HELM_TEMPORAL_ENABLED = "1";
    process.env.HELM_TEMPORAL_MODE = "external-write";
    process.env.HELM_TEMPORAL_TEST_MODE = "stub";
    process.env.HELM_TEMPORAL_RECONCILIATION_SCHEDULE_ENABLED = "1";
    process.env.HELM_TEMPORAL_RECONCILIATION_SCHEDULE_ID = "helm-recon-test";
    process.env.HELM_RECONCILIATION_INTERVAL_MS = "60000";
    process.env.HELM_RECONCILIATION_OLDER_THAN_MS = "120000";
    process.env.HELM_RECONCILIATION_LIMIT = "7";

    const first = await maybeStartReconciliationSchedule();
    expect(first).toEqual({ ok: true, scheduleId: "helm-recon-test", created: true });
    const second = await maybeStartReconciliationSchedule();
    expect(second).toEqual({ ok: true, scheduleId: "helm-recon-test", created: false });

    const state = __getTemporalStubState();
    expect(state).toHaveLength(1);
    expect(state[0]!).toMatchObject({ workflowId: "schedule:helm-recon-test" });
    expect(state[0]!.signals).toEqual(["create", "update"]);
    expect(state[0]!.args).toMatchObject({ intervalMs: 60000, olderThanMs: 120000, limit: 7 });
  });

  it("getTemporalReconciliationScheduleStatus reports missing/active in stub mode", async () => {
    process.env.HELM_TEMPORAL_ENABLED = "1";
    process.env.HELM_TEMPORAL_MODE = "external-write";
    process.env.HELM_TEMPORAL_TEST_MODE = "stub";
    process.env.HELM_TEMPORAL_RECONCILIATION_SCHEDULE_ID = "helm-recon-test";

    const missing = await getTemporalReconciliationScheduleStatus();
    expect(missing).toMatchObject({ enabled: false, scheduleId: "helm-recon-test", status: "missing", reason: "not_created" });

    process.env.HELM_TEMPORAL_RECONCILIATION_SCHEDULE_ENABLED = "1";
    await maybeStartReconciliationSchedule();
    const active = await getTemporalReconciliationScheduleStatus();
    expect(active).toMatchObject({ enabled: true, scheduleId: "helm-recon-test", status: "active" });
  });

  it("maybeStartExternalActionWorkflow does not start when routing disabled", async () => {
    process.env.HELM_TEMPORAL_ENABLED = "0";
    const out = await maybeStartExternalActionWorkflow({
      taskId: "tsk_1", userId: "usr_1", actionKind: "gmail.send", actionHash: "ah_1", idempotencyKey: "idem_1",
      approvalId: "apr_1", payload: { to: "a@b.com" },
    });
    expect(out).toEqual({ started: false });
  });

  it("stub external workflow is deduped by idempotency-derived workflow id and records approval signal", async () => {
    process.env.HELM_TEMPORAL_ENABLED = "1";
    process.env.HELM_TEMPORAL_MODE = "external-write";
    process.env.HELM_TEMPORAL_TEST_MODE = "stub";

    const input = {
      taskId: "tsk_1", userId: "usr_1", actionKind: "gmail.send", actionHash: "ah_1", idempotencyKey: "idem/unsafe key",
      approvalId: "apr_1", payload: { accountId: "cac_1", to: ["a@b.com"] },
    };
    const first = await maybeStartExternalActionWorkflow(input);
    expect(first.started).toBe(true);
    expect(first.workflowId).toBe("helm-ext-idem_unsafe_key");
    expect(first.runId).toMatch(/^run_helm-ext-idem_unsafe_key/);

    const second = await maybeStartExternalActionWorkflow({ ...input, approvalId: "apr_2" });
    expect(second).toEqual({ started: true, workflowId: first.workflowId, runId: first.runId });

    const state = __getTemporalStubState();
    expect(state).toHaveLength(1);
    expect(state[0]!.signals).toEqual(["approve:apr_1", "approve:apr_2"]);
  });
});

