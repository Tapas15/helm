import { describe, expect, it } from "vitest";
import { readTemporalConfig, shouldUseTemporalForAction } from "./temporal.js";

describe("temporal rollback flag", () => {
  it("disables routing when HELM_TEMPORAL_ENABLED is off", () => {
    const cfg = readTemporalConfig({ HELM_TEMPORAL_ENABLED: "0", HELM_TEMPORAL_MODE: "external-write" } as any);
    expect(shouldUseTemporalForAction(cfg, "gmail.send")).toBe(false);
    expect(shouldUseTemporalForAction(cfg, "calendar.create_event")).toBe(false);
    expect(shouldUseTemporalForAction(cfg, "browser.external_action")).toBe(false);
  });
  it("routes only external actions in external-write mode", () => {
    const cfg = readTemporalConfig({ HELM_TEMPORAL_ENABLED: "1", HELM_TEMPORAL_MODE: "external-write" } as any);
    expect(shouldUseTemporalForAction(cfg, "gmail.send")).toBe(true);
    expect(shouldUseTemporalForAction(cfg, "browser.external_action")).toBe(true);
    expect(shouldUseTemporalForAction(cfg, "task.plan")).toBe(false);
  });

  it("reads reconciliation schedule config", () => {
    const cfg = readTemporalConfig({ HELM_TEMPORAL_RECONCILIATION_SCHEDULE_ID: "helm-recon-test" } as any);
    expect(cfg.reconciliationScheduleId).toBe("helm-recon-test");
  });
});
