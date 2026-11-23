import { describe, expect, it } from "vitest";

const base = process.env.HELM_API_URL ?? "http://127.0.0.1:8787";
const run = process.env.HELM_INTEGRATION_API !== "0";

async function api(path: string, init?: RequestInit, userId = "usr_local_dev") {
  const res = await fetch(`${base}${path}`, { ...init, headers: { "content-type": "application/json", "x-user-id": userId, ...(init?.headers ?? {}) } });
  const text = await res.text();
  let json: any = null; try { json = JSON.parse(text); } catch {}
  return { status: res.status, json, text };
}

(run ? describe : describe.skip)("Browser session create ownership", () => {
  it("rejects session create when taskId is not owned by user", async () => {
    const create = await api("/v1/tasks", { method: "POST", body: JSON.stringify({ prompt: "ownership test", kind: "assistant" }) });
    expect(create.status).toBe(201);
    const taskId = create.json.task.id as string;
    const res = await api("/v1/browser/sessions", { method: "POST", body: JSON.stringify({ taskId, provider: "playwright", headless: true }) }, "usr_other");
    expect([403,404]).toContain(res.status);
  }, 30000);
});
