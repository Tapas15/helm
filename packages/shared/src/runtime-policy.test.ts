import { describe, expect, it } from "vitest";
import { decideRuntimeModelPolicy } from "./runtime-policy.js";

describe("runtime model policy", () => {
  it("selects local default and marks allowlisted ollama tool-capable", () => {
    const d = decideRuntimeModelPolicy(
      { sensitivity: "normal", taskKind: "assistant", toolCallingRequired: true },
      { defaultModel: "llama3.2:latest", defaultProvider: "ollama", defaultBaseUrl: "http://127.0.0.1:11434/v1", allowlist: ["llama3.2:latest"] },
    );
    expect(d.route).toBe("local-default");
    expect(d.toolCapable).toBe(true);
    expect(d.warnings).toEqual([]);
  });

  it("warns for sensitive task on non-local provider", () => {
    const d = decideRuntimeModelPolicy(
      { requestedModel: "gpt-4.1-mini", requestedProvider: "openai-compatible", requestedBaseUrl: "https://api.openai.com/v1", sensitivity: "sensitive", taskKind: "assistant", toolCallingRequired: true },
      { allowlist: ["llama3.2:latest"] },
    );
    expect(d.route).toBe("override");
    expect(d.warnings.some((w) => w.includes("non-local provider"))).toBe(true);
  });

  it("warns when ollama model not allowlisted for tool calling", () => {
    const d = decideRuntimeModelPolicy(
      { requestedModel: "custom:latest", requestedProvider: "ollama", requestedBaseUrl: "http://127.0.0.1:11434/v1", sensitivity: "normal", taskKind: "assistant", toolCallingRequired: true },
      { allowlist: ["llama3.2:latest"] },
    );
    expect(d.allowlisted).toBe(false);
    expect(d.toolCapable).toBe(false);
    expect(d.warnings.length).toBeGreaterThan(0);
  });

  it("falls back when no model/baseUrl configured", () => {
    const d = decideRuntimeModelPolicy({ sensitivity: "normal", taskKind: "assistant", toolCallingRequired: false }, {});
    expect(d.route).toBe("fallback-no-model");
    expect(d.selectedModel).toBeNull();
  });
});
