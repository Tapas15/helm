import { describe, expect, it } from "vitest";
import { isStaleTargetError } from "./playwrightExecutor.js";

describe("isStaleTargetError", () => {
  it("matches common Playwright stale target errors", () => {
    expect(isStaleTargetError(new Error("Target page, context or browser has been closed"))).toBe(true);
    expect(isStaleTargetError(new Error("browser has been closed"))).toBe(true);
    expect(isStaleTargetError(new Error("Execution context was destroyed"))).toBe(true);
    expect(isStaleTargetError(new Error("random failure"))).toBe(false);
  });
});
