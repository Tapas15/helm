import { describe, expect, it } from "vitest";
import { BrowserActionGuard, BrowserExternalActionInput, BrowserNavigateInput } from "@helm/shared";

describe("BrowserActionGuard and guarded inputs", () => {
  it("validates external action payload", () => {
    const ok = BrowserExternalActionInput.safeParse({ action: "click", approvalId: "apr_1", actionHash: "hash1", idempotencyKey: "idem1" });
    expect(ok.success).toBe(false); // click is not in external-action enum
    const ok2 = BrowserExternalActionInput.safeParse({ action: "submit", approvalId: "apr_1", actionHash: "hash1", idempotencyKey: "idem1" });
    expect(ok2.success).toBe(true);
  });
  it("rejects missing idempotency key", () => {
    const bad = BrowserActionGuard.safeParse({ approvalId: "apr_1", actionHash: "hash1" });
    expect(bad.success).toBe(false);
  });
  it("accepts navigate input", () => {
    const nav = BrowserNavigateInput.safeParse({ url: "https://example.com" });
    expect(nav.success).toBe(true);
  });
});
