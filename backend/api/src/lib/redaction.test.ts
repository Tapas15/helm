import { describe, expect, it } from "vitest";
import { redactSensitive } from "./redaction.js";

describe("redactSensitive", () => {
  it("redacts sensitive keys and absolute paths", () => {
    const out = redactSensitive({ apiKey: "sk-1", nested: { token: "tok", safe: "ok" }, path: "C:\\Users\\Tapas\\secret.txt", rel: "docs/readme.md" }) as any;
    expect(out.apiKey).toBe("[REDACTED]");
    expect(out.nested.token).toBe("[REDACTED]");
    expect(out.nested.safe).toBe("ok");
    expect(out.path).toBe("[REDACTED_PATH]");
    expect(out.rel).toBe("docs/readme.md");
  });
});
