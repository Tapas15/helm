import { describe, expect, it } from "vitest";
import { CreateTaskInput } from "@helm/shared";

describe("api smoke", () => {
  it("imports shared validators", () => {
    const parsed = CreateTaskInput.safeParse({ prompt: "ok" });
    expect(parsed.success).toBe(true);
  });
});
