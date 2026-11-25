import { afterEach, describe, expect, it, vi } from "vitest";

const env = { ...process.env };
afterEach(() => { process.env = { ...env }; vi.resetModules(); });

describe("browser-worker correlation echo", () => {
  it("echoes sanitized correlation on validation error", async () => {
    process.env.NODE_ENV = "test";
    process.env.BROWSER_WORKER_AUTOSTART = "0";
    process.env.BROWSER_WORKER_TOKEN = "test-token";
    const mod = await import("./index.js");
    const res = await mod.app.request("/v1/sessions/sess_1/click", {
      method: "POST",
      headers: { authorization: "Bearer test-token", "content-type": "application/json" },
      body: JSON.stringify({ selector: "", userId: "u1", taskId: "tsk_1", runId: "run_1", correlationId: "cor_1" }),
    });
    expect(res.status).toBe(400);
    const body = await res.json() as any;
    expect(body.error?.details?.correlation?.userId).toBe("u1");
    expect(body.error?.details?.correlation?.taskId).toBe("tsk_1");
    expect(body.error?.details?.correlation?.runId).toBe("run_1");
    expect(body.error?.details?.correlation?.correlationId).toBe("cor_1");
  });

  it("echoes sanitized correlation on action success", async () => {
    process.env.NODE_ENV = "test";
    process.env.BROWSER_WORKER_AUTOSTART = "0";
    process.env.BROWSER_WORKER_TOKEN = "test-token";
    const mod = await import("./index.js");
    const orig = (mod.executor as any).click;
    (mod.executor as any).click = vi.fn(async () => ({ ok: true, sessionId: "sess_1", action: "click", data: {} }));
    const res = await mod.app.request("/v1/sessions/sess_1/click", {
      method: "POST",
      headers: { authorization: "Bearer test-token", "content-type": "application/json" },
      body: JSON.stringify({ selector: "#ok", userId: "u1", taskId: "tsk_1", runId: "run_1", correlationId: "cor_1" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.ok).toBe(true);
    expect(body.correlation?.userId).toBe("u1");
    expect(body.correlation?.taskId).toBe("tsk_1");
    (mod.executor as any).click = orig;
  });
});
