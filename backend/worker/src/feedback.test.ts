import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { feedbackEvents } from "@helm/db";
import { emitWorkerFeedbackEvent } from "./feedback.js";

const env = { ...process.env };

describe("emitWorkerFeedbackEvent (P7a)", () => {
  beforeEach(() => { process.env = { ...env }; });
  afterEach(() => { process.env = { ...env }; vi.restoreAllMocks(); });

  it("is no-op when disabled", async () => {
    process.env.HELM_FEEDBACK_ENABLED = "0";
    const insert = vi.fn();
    await emitWorkerFeedbackEvent({ insert } as any, { userId: "u1", kind: "tool_failure", signal: "negative", summary: "x" });
    expect(insert).not.toHaveBeenCalled();
  });

  it("inserts redacted event when enabled and never throws on failure", async () => {
    process.env.HELM_FEEDBACK_ENABLED = "1";
    const rows: any[] = [];
    const db = { insert: (table: unknown) => ({ values: async (v: any) => { if (table === feedbackEvents) rows.push(v); } }) } as any;
    await emitWorkerFeedbackEvent(db, { userId: "u1", taskId: "tsk_1", runId: "run_1", kind: "tool_failure", signal: "negative", severity: "error", summary: "task.failed.runtime_crash", payload: { token: "Bearer secret" } });
    expect(rows).toHaveLength(1);
    expect(rows[0].redacted).toBe(true);
    expect(JSON.stringify(rows[0])).not.toContain("secret");

    const badDb = { insert: () => ({ values: async () => { throw new Error("db down"); } }) } as any;
    await expect(emitWorkerFeedbackEvent(badDb, { userId: "u1", kind: "task_outcome", signal: "positive" })).resolves.toBeUndefined();
  });
});
