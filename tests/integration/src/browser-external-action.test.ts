import { describe, expect, it } from "vitest";
import { BrowserActionGuard, BrowserExternalActionInput } from "@helm/shared";

describe("browser action guards", () => {
  it("external action requires approvalId, actionHash, idempotencyKey", () => {
    const ok = BrowserExternalActionInput.safeParse({ action: "purchase", actionHash: "ah1", idempotencyKey: "ik1", approvalId: "apr1" });
    expect(ok.success).toBe(true);
    const bad = BrowserExternalActionInput.safeParse({ action: "purchase", actionHash: "ah1" });
    expect(bad.success).toBe(false);
  });

  it("browser side-effect guard requires approval/hash/idempotency", () => {
    expect(BrowserActionGuard.safeParse({ approvalId: "a", actionHash: "h", idempotencyKey: "i" }).success).toBe(true);
    expect(BrowserActionGuard.safeParse({ approvalId: "a", actionHash: "h" }).success).toBe(false);
  });
});
