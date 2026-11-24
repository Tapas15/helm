import { describe, expect, it } from "vitest";
import { shouldUseTemporalForAction, readTemporalConfig } from "@helm/shared";

describe("reconciliation invariants", () => {
  it("temporal external-write mode covers gmail/calendar/browser writes", () => {
    const cfg = readTemporalConfig({ HELM_TEMPORAL_ENABLED: "1", HELM_TEMPORAL_MODE: "external-write" } as any);
    expect(shouldUseTemporalForAction(cfg, "gmail.send")).toBe(true);
    expect(shouldUseTemporalForAction(cfg, "calendar.create_event")).toBe(true);
    expect(shouldUseTemporalForAction(cfg, "browser.external_action")).toBe(true);
  });

  it("does not route read-only actions in external-write mode", () => {
    const cfg = readTemporalConfig({ HELM_TEMPORAL_ENABLED: "1", HELM_TEMPORAL_MODE: "external-write" } as any);
    expect(shouldUseTemporalForAction(cfg, "gmail.read")).toBe(false);
    expect(shouldUseTemporalForAction(cfg, "calendar.read")).toBe(false);
  });
});
