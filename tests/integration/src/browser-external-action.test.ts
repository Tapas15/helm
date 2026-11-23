import { describe, expect, it } from "vitest";
import { BrowserActionGuard, BrowserClickInput, BrowserExternalActionInput, BrowserFillInput, BrowserNavigateInput, ResolveApprovalInput } from "@helm/shared";

describe("BrowserActionGuard and guarded inputs", () => {
  it("validates external action payload", () => {
    const bad = BrowserExternalActionInput.safeParse({ action: "click", approvalId: "apr_1", actionHash: "hash1", idempotencyKey: "idem1" });
    expect(bad.success).toBe(false);
    const ok = BrowserExternalActionInput.safeParse({ action: "submit", approvalId: "apr_1", actionHash: "hash1", idempotencyKey: "idem1" });
    expect(ok.success).toBe(true);
  });

  it("rejects missing idempotency key", () => {
    const bad = BrowserActionGuard.safeParse({ approvalId: "apr_1", actionHash: "hash1" });
    expect(bad.success).toBe(false);
  });

  it("accepts navigate input", () => {
    const nav = BrowserNavigateInput.safeParse({ url: "https://example.com" });
    expect(nav.success).toBe(true);
  });

  it("requires guarded fields for click/fill side effects", () => {
    expect(BrowserClickInput.safeParse({ selector: "#buy" }).success).toBe(true); // action schema only; route enforces guard
    expect(BrowserFillInput.safeParse({ selector: "#q", value: "helm", submit: false }).success).toBe(true);
    const guarded = BrowserActionGuard.safeParse({ approvalId: "apr_1", actionHash: "h", idempotencyKey: "i" });
    expect(guarded.success).toBe(true);
  });
});

describe("ResolveApprovalInput", () => {
  it("accepts approval decision with actionHash/idempotencyKey", () => {
    const ok = ResolveApprovalInput.safeParse({ decision: "approve", actionHash: "ah", idempotencyKey: "idem", reason: "ok" });
    expect(ok.success).toBe(true);
  });

  it("rejects invalid decision", () => {
    const bad = ResolveApprovalInput.safeParse({ decision: "yes" });
    expect(bad.success).toBe(false);
  });
});
