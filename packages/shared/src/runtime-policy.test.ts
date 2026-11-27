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

  it("denies sensitive egress when enforcement enabled", () => {
    const d = decideRuntimeModelPolicy(
      { requestedModel: "gpt-4.1-mini", requestedProvider: "openai-compatible", requestedBaseUrl: "https://api.openai.com/v1", sensitivity: "sensitive", taskKind: "assistant", toolCallingRequired: true },
      { allowlist: ["llama3.2:latest"], enforceSensitiveEgress: true },
    );
    expect(d.egressAllowed).toBe(false);
    expect(d.egressPolicy).toBe("deny-nonlocal-sensitive");
    expect(d.warnings.some((w) => w.includes("cannot use non-local provider"))).toBe(true);
  });

  it("infers sensitive prompt heuristic for non-local egress enforcement", () => {
    const d = decideRuntimeModelPolicy(
      { requestedModel: "gpt-4.1-mini", requestedProvider: "openai-compatible", requestedBaseUrl: "https://api.openai.com/v1", sensitivity: "normal", prompt: "please save my password and credit card", taskKind: "assistant", toolCallingRequired: true },
      { allowlist: ["llama3.2:latest"], enforceSensitiveEgress: true },
    );
    expect(d.sensitivity).toBe("sensitive");
    expect(d.sensitivitySource).toBe("heuristic");
    expect(d.egressAllowed).toBe(false);
  });

  it("allows local sensitive routing when enforcement enabled", () => {
    const d = decideRuntimeModelPolicy(
      { requestedModel: "llama3.2:latest", requestedProvider: "ollama", requestedBaseUrl: "http://127.0.0.1:11434/v1", sensitivity: "sensitive", taskKind: "assistant", toolCallingRequired: true },
      { allowlist: ["llama3.2:latest"], enforceSensitiveEgress: true },
    );
    expect(d.egressAllowed).toBe(true);
    expect(d.egressPolicy).toBe("allow");
  });
});
