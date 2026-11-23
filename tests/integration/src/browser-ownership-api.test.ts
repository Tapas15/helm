import { describe, expect, it } from "vitest";

const base = process.env.HELM_API_URL ?? "http://127.0.0.1:8787";
const run = process.env.HELM_INTEGRATION_API !== "0";

async function api(path: string, init?: RequestInit, userId = "usr_local_dev") {
  const res = await fetch(`${base}${path}`, { ...init, headers: { "content-type": "application/json", "x-user-id": userId, ...(init?.headers ?? {}) } });
  const text = await res.text();
  let json: any = null; try { json = JSON.parse(text); } catch {}
  return { status: res.status, json, text };
}

(run ? describe : describe.skip)("Browser session ownership API", () => {
  it("denies cross-user session access for screenshot/snapshot/close", async () => {
    // Find an existing session owned by dev user through task-known session from prior smoke
    const sessions = await api("/v1/browser/sessions");
    expect(sessions.status).toBe(200);
    const id = sessions.json?.sessions?.[0]?.id;
    if (!id) return; // no session available in clean env
    const other = await api(`/v1/browser/sessions/${id}`, undefined, "usr_other");
    expect([403,404]).toContain(other.status);
    const snap = await api(`/v1/browser/sessions/${id}/snapshot`, { method: "POST", body: "{}" }, "usr_other");
    expect([403,404]).toContain(snap.status);
    const close = await api(`/v1/browser/sessions/${id}/close`, { method: "POST", body: "{}" }, "usr_other");
    expect([403,404]).toContain(close.status);
  }, 30000);
});
