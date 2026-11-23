import { describe, expect, it } from "vitest";

const base = process.env.HELM_API_URL ?? "http://127.0.0.1:8787";
const browserBase = process.env.HELM_BROWSER_WORKER_URL ?? "http://127.0.0.1:8790";
const browserToken = process.env.BROWSER_WORKER_TOKEN ?? "dev-browser-token";
const run = process.env.HELM_INTEGRATION_API === "1";

async function api(path: string, init?: RequestInit, userId = "usr_local_dev") {
  const res = await fetch(`${base}${path}`, { ...init, headers: { "content-type": "application/json", "x-user-id": userId, ...(init?.headers ?? {}) } });
  const text = await res.text();
  let json: any = null; try { json = JSON.parse(text); } catch {}
  return { status: res.status, json, text };
}

async function bw(path: string, init?: RequestInit) {
  const res = await fetch(`${browserBase}${path}`, { ...init, headers: { "content-type": "application/json", authorization: `Bearer ${browserToken}`, ...(init?.headers ?? {}) } });
  const text = await res.text();
  let json: any = null; try { json = JSON.parse(text); } catch {}
  return { status: res.status, json, text };
}

(run ? describe : describe.skip)("Legacy unbound browser session policy", () => {
  it("hard-blocks unbound session access and allows explicit rebind to owned task", async () => {
    const createTask = await api("/v1/tasks", { method: "POST", body: JSON.stringify({ prompt: "rebind target", kind: "assistant" }) });
    expect(createTask.status).toBe(201);
    const taskId = createTask.json?.task?.id as string;
    expect(taskId).toBeTruthy();

    const session = await bw("/v1/sessions", { method: "POST", body: JSON.stringify({ headless: true, initialUrl: "https://example.com" }) });
    expect(session.status).toBe(201);
    const sessionId = session.json?.session?.id as string;
    expect(sessionId).toBeTruthy();

    const denied = await api(`/v1/browser/sessions/${sessionId}`);
    expect(denied.status).toBe(403);
    expect(String(denied.json?.error?.message ?? "")).toMatch(/not bound|rebind/i);

    const rebind = await api(`/v1/browser/sessions/${sessionId}/rebind`, { method: "POST", body: JSON.stringify({ taskId }) });
    expect(rebind.status).toBe(200);
    expect(rebind.json?.ok).toBe(true);

    const after = await api(`/v1/browser/sessions/${sessionId}`);
    expect(after.status).toBe(200);
    expect(after.json?.session?.id).toBe(sessionId);

    const close = await api(`/v1/browser/sessions/${sessionId}/close`, { method: "POST", body: "{}" });
    expect([200,400]).toContain(close.status);
  }, 60000);
});
