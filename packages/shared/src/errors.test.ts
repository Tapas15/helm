import { describe, expect, it } from "vitest";
import {
  HELM_ERROR_CODES,
  HelmError,
  createHelmError,
  helmErrorToApiError,
  isHelmError,
  serializeCause,
  toHelmError,
} from "./index.js";

describe("HelmError", () => {
  it("creates error with defaults and metadata", () => {
    const err = new HelmError({
      code: HELM_ERROR_CODES.INVALID_TRANSITION,
      message: "bad transition",
      context: { from: "queued" },
      traceId: "req_1",
    });
    expect(err.name).toBe("HelmError");
    expect(err.code).toBe("INVALID_TRANSITION");
    expect(err.retryable).toBe(false);
    expect(err.context).toEqual({ from: "queued" });
    expect(err.traceId).toBe("req_1");
  });

  it("serializes to JSON including optional fields", () => {
    const cause = new Error("root");
    const err = createHelmError({
      code: "X",
      message: "msg",
      retryable: true,
      cause,
      context: { a: 1 },
      correlationId: "corr",
      taskId: "task_1",
      stepId: "step_1",
    });
    expect(err.toJSON()).toEqual({
      code: "X",
      message: "msg",
      retryable: true,
      cause: { name: "Error", message: "root" },
      context: { a: 1 },
      correlationId: "corr",
      taskId: "task_1",
      stepId: "step_1",
    });
  });

  it("serializes nested HelmError causes", () => {
    const inner = new HelmError({ code: "INNER", message: "inner", retryable: false });
    expect(serializeCause(inner)).toMatchObject({ code: "INNER", message: "inner" });
    expect(serializeCause("plain")).toBe("plain");
  });

  it("detects HelmError instances", () => {
    expect(isHelmError(new HelmError({ code: "X", message: "m" }))).toBe(true);
    expect(isHelmError(new Error("x"))).toBe(false);
    expect(isHelmError({})).toBe(false);
  });

  it("coerces unknowns to HelmError", () => {
    const existing = new HelmError({ code: "X", message: "m" });
    expect(toHelmError(existing)).toBe(existing);

    const fromErr = toHelmError(new Error("boom"), {
      code: HELM_ERROR_CODES.INTERNAL_ERROR,
      message: "fallback",
      retryable: true,
    });
    expect(fromErr.code).toBe("INTERNAL_ERROR");
    expect(fromErr.message).toBe("fallback");
    expect(fromErr.retryable).toBe(true);
    expect(fromErr.cause).toBeInstanceOf(Error);

    const fromUnknown = toHelmError("bad", {
      code: HELM_ERROR_CODES.INTERNAL_ERROR,
      message: "fallback",
      retryable: false,
    });
    expect(fromUnknown.cause).toBe("bad");
  });

  it("maps to API error shape", () => {
    const err = new HelmError({
      code: HELM_ERROR_CODES.NOT_FOUND,
      message: "missing",
      retryable: false,
      context: { id: "task_1" },
    });
    expect(helmErrorToApiError(err.toJSON())).toEqual({
      error: {
        code: "NOT_FOUND",
        message: "missing",
        retryable: false,
        details: { id: "task_1" },
      },
    });
  });
});
