import { describe, expect, it } from "vitest";
import { ApiError, CreateTaskInput, TaskStatus } from "./index.js";

describe("@helm/shared", () => {
  it("parses valid CreateTaskInput with defaults", () => {
    const parsed = CreateTaskInput.parse({ prompt: "hello" });
    expect(parsed.prompt).toBe("hello");
    expect(parsed.kind).toBe("assistant");
    expect(parsed.settings).toEqual({});
  });

  it("accepts known TaskStatus values", () => {
    expect(TaskStatus.parse("queued")).toBe("queued");
  });

  it("validates ApiError shape", () => {
    const parsed = ApiError.parse({
      error: { code: "X", message: "m", retryable: false },
    });
    expect(parsed.error.code).toBe("X");
  });
});
