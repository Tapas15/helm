import { describe, expect, it } from "vitest";
import {
  HELM_ERROR_CODES,
  TASK_CONTROL_TRANSITIONS,
  TERMINAL_TASK_STATUSES,
  assertTaskControlTransition,
  canApplyTaskControlAction,
  getTaskControlTransition,
  isHelmError,
} from "./index.js";

describe("task control transitions", () => {
  it("exposes allowed from-states per action", () => {
    expect(TASK_CONTROL_TRANSITIONS.pause.from).toEqual([
      "queued",
      "planning",
      "running",
      "waiting_approval",
      "waiting_input",
      "scheduled",
    ]);
    expect(TASK_CONTROL_TRANSITIONS.resume.from).toEqual(["paused", "blocked", "failed"]);
    expect(TASK_CONTROL_TRANSITIONS.cancel.from).toEqual([
      "queued",
      "planning",
      "running",
      "waiting_approval",
      "waiting_input",
      "scheduled",
      "paused",
      "blocked",
      "failed",
    ]);
    expect(TASK_CONTROL_TRANSITIONS.retry.from).toEqual(["failed", "cancelled", "succeeded", "blocked"]);
  });

  it("returns transition for allowed action/state", () => {
    expect(getTaskControlTransition("pause").to).toBe("paused");
    expect(assertTaskControlTransition("resume", "paused")).toMatchObject({
      action: "resume",
      to: "queued",
    });
  });

  it("reports canApplyTaskControlAction accurately", () => {
    expect(canApplyTaskControlAction("pause", "running")).toBe(true);
    expect(canApplyTaskControlAction("pause", "succeeded")).toBe(false);
    expect(canApplyTaskControlAction("retry", "failed")).toBe(true);
  });

  it("throws HelmError for invalid transitions", () => {
    try {
      assertTaskControlTransition("pause", "succeeded");
      throw new Error("expected invalid transition");
    } catch (err) {
      expect(isHelmError(err)).toBe(true);
      if (isHelmError(err)) {
        expect(err.code).toBe(HELM_ERROR_CODES.INVALID_TRANSITION);
        expect(err.context).toMatchObject({
          action: "pause",
          from: "succeeded",
          allowedFrom: TASK_CONTROL_TRANSITIONS.pause.from,
        });
      }
    }
  });

  it("marks terminal statuses", () => {
    expect(TERMINAL_TASK_STATUSES.has("succeeded")).toBe(true);
    expect(TERMINAL_TASK_STATUSES.has("failed")).toBe(true);
    expect(TERMINAL_TASK_STATUSES.has("cancelled")).toBe(true);
    expect(TERMINAL_TASK_STATUSES.has("running")).toBe(false);
  });
});
