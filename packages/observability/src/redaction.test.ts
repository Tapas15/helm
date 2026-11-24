import { describe, expect, it } from "vitest";
import { buildRedactConfig } from "./redaction.js";

describe("redaction", () => {
  it("includes common secret paths", () => {
    const r = buildRedactConfig();
    expect(r.paths).toContain("authorization");
    expect(r.paths).toContain("*.token");
    expect(r.paths).toContain("*.sessionToken");
    expect(r.paths).toContain("*.encryptedValue");
    expect(r.paths).toContain("*.pkceVerifierEncrypted");
    expect(r.censor).toBe("[REDACTED]");
  });
});
