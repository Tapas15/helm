import { describe, expect, it } from "vitest";
import { runtimeRoutes } from "./runtime.js";

function mockDb() { return {} as any; }

describe("runtime routes", () => {
  it("GET /config returns default policy", async () => {
    const app = runtimeRoutes(mockDb());
    const res = await app.request("/config");
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.ok).toBe(true);
    expect(body.runtime.supportsModelOverride).toBe(true);
    expect(body.runtime.defaultPolicy).toBeTruthy();
  });

  it("POST /model-validate returns policy decision", async () => {
    const app = runtimeRoutes(mockDb());
    const res = await app.request("/model-validate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ model: "llama3.2:latest", provider: "ollama", baseUrl: "http://127.0.0.1:11434/v1", toolCallingRequired: true }) });
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.ok).toBe(true);
    expect(body.policy).toBeTruthy();
    expect(body.policy.selectedModel).toBe("llama3.2:latest");
  });

  it("POST /model-validate rejects invalid body", async () => {
    const app = runtimeRoutes(mockDb());
    const res = await app.request("/model-validate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ timeoutMs: 1 }) });
    expect(res.status).toBe(400);
  });
});
