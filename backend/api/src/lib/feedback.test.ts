import { afterEach, describe, expect, it } from "vitest";
import { feedbackEvents } from "@helm/db";
import { emitFeedbackEvent } from "../lib/feedback.js";

const env = { ...process.env };
afterEach(() => { process.env = { ...env }; });

function mockDb() {
  const rows: any[] = [];
  return {
    rows,
    db: {
      insert: (table: unknown) => ({
        values: async (v: any) => {
          if (table === feedbackEvents) rows.push(v);
          return [v];
        },
      }),
    } as any,
  };
}

describe("emitFeedbackEvent (P7a)", () => {
  it("is no-op when HELM_FEEDBACK_ENABLED!=1", async () => {
    process.env.HELM_FEEDBACK_ENABLED = "0";
    const { db, rows } = mockDb();
    const res = await emitFeedbackEvent(db, { userId: "u1", kind: "tool_failure", signal: "negative", payload: { secret: "x" } });
    expect(res.emitted).toBe(false);
    expect(rows).toHaveLength(0);
  });

  it("persists redacted event when enabled", async () => {
    process.env.HELM_FEEDBACK_ENABLED = "1";
    const { db, rows } = mockDb();
    const res = await emitFeedbackEvent(db, {
      userId: "u1", taskId: "tsk_1", kind: "approval_decision", signal: "negative", severity: "warn",
      summary: "approval.rejected", payload: { sessionToken: "secret", actionKind: "gmail.send" },
      evidenceRefs: [{ type: "audit", action: "approval.rejected" }],
    });
    expect(res.emitted).toBe(true);
    expect(rows).toHaveLength(1);
    expect(rows[0].payload.sessionToken).toBe("[REDACTED]");
    expect(rows[0].payload.actionKind).toBe("gmail.send");
    expect(rows[0].payload.summary).toBe("approval.rejected");
    expect(rows[0].redacted).toBe(true);
  });

  it("never throws on insert failure", async () => {
    process.env.HELM_FEEDBACK_ENABLED = "1";
    const db = { insert: () => ({ values: async () => { throw new Error("db down"); } }) } as any;
    const res = await emitFeedbackEvent(db, { userId: "u1", kind: "tool_failure", signal: "negative" });
    expect(res.emitted).toBe(false);
  });
});
