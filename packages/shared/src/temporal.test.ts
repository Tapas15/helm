import { describe, expect, it } from "vitest";
import { isNonRetryableTemporalErrorType, readTemporalConfig, shouldUseTemporalForAction, TEMPORAL_EXTERNAL_WRITE_ACTION, TEMPORAL_NON_RETRYABLE_ERROR_TYPES } from "./temporal.js";

describe("temporal config/contracts (P5 fail-closed defaults)", () => {
  it("disables routing when HELM_TEMPORAL_ENABLED is off", () => {
    const cfg = readTemporalConfig({ HELM_TEMPORAL_ENABLED: "0", HELM_TEMPORAL_MODE: "external-write" } as any);
    expect(cfg.enabled).toBe(false);
    expect(shouldUseTemporalForAction(cfg, "gmail.send")).toBe(false);
    expect(shouldUseTemporalForAction(cfg, "calendar.create_event")).toBe(false);
    expect(shouldUseTemporalForAction(cfg, "browser.external_action")).toBe(false);
  });

  it("defaults mode to external-write when enabled without explicit mode", () => {
    const cfg = readTemporalConfig({ HELM_TEMPORAL_ENABLED: "1" } as any);
    expect(cfg).toMatchObject({ enabled: true, mode: "external-write", address: "localhost:7233", namespace: "default", taskQueue: "helm-main" });
  });

  it("falls back to off for invalid mode (fail-closed)", () => {
    const cfg = readTemporalConfig({ HELM_TEMPORAL_ENABLED: "1", HELM_TEMPORAL_MODE: "bogus" } as any);
    expect(cfg.enabled).toBe(true);
    expect(cfg.mode).toBe("off");
    expect(shouldUseTemporalForAction(cfg, "gmail.send")).toBe(false);
  });

  it("routes only external actions in external-write mode", () => {
    const cfg = readTemporalConfig({ HELM_TEMPORAL_ENABLED: "1", HELM_TEMPORAL_MODE: "external-write" } as any);
    expect(shouldUseTemporalForAction(cfg, "gmail.send")).toBe(true);
    expect(shouldUseTemporalForAction(cfg, "browser.external_action")).toBe(true);
    expect(shouldUseTemporalForAction(cfg, "task.plan")).toBe(false);
  });

  it("routes all actions only in explicit all mode", () => {
    const cfg = readTemporalConfig({ HELM_TEMPORAL_ENABLED: "1", HELM_TEMPORAL_MODE: "all" } as any);
    expect(shouldUseTemporalForAction(cfg, "task.plan")).toBe(true);
    expect(shouldUseTemporalForAction(cfg, "gmail.send")).toBe(true);
  });

  it("reads reconciliation schedule config with default", () => {
    const def = readTemporalConfig({} as any);
    expect(def.reconciliationScheduleId).toBe("helm-reconciliation-schedule");
    const cfg = readTemporalConfig({ HELM_TEMPORAL_RECONCILIATION_SCHEDULE_ID: "helm-recon-test" } as any);
    expect(cfg.reconciliationScheduleId).toBe("helm-recon-test");
  });

  it("covers guarded external-write action classes used by Temporal routing", () => {
    const cfg = readTemporalConfig({ HELM_TEMPORAL_ENABLED: "1", HELM_TEMPORAL_MODE: "external-write" } as any);
    for (const action of ["gmail.send", "calendar.create_event", "calendar.update_event", "calendar.delete_event", "browser.external_action"]) {
      expect(TEMPORAL_EXTERNAL_WRITE_ACTION.test(action)).toBe(true);
      expect(shouldUseTemporalForAction(cfg, action)).toBe(true);
    }
    for (const action of ["gmail.read", "calendar.read", "task.plan", "memory.write"]) {
      expect(shouldUseTemporalForAction(cfg, action)).toBe(false);
    }
  });

  it("classifies non-retryable Temporal error types", () => {
    for (const t of TEMPORAL_NON_RETRYABLE_ERROR_TYPES) expect(isNonRetryableTemporalErrorType(t)).toBe(true);
    expect(isNonRetryableTemporalErrorType("TimeoutError")).toBe(false);
  });
});
