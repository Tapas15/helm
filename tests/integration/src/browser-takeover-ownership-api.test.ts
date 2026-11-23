import { describe, expect, it } from "vitest";

const base = process.env.HELM_API_URL ?? "http://127.0.0.1:8787";
const run = process.env.HELM_INTEGRATION_API === "1";

async function api(path: string, init?: RequestInit, userId = "usr_local_dev") {
  const res = await fetch(`${base}${path}`, { ...init, headers: { "content-type": "application/json", "x-user-id": userId, ...(init?.headers ?? {}) } });
  const text = await res.text();
  let json: any = null; try { json = JSON.parse(text); } catch {}
  return { status: res.status, json, text };
}

(run ? describe : describe.skip)("Browser takeover ownership", () => {
  it("denies cross-user takeover request/resume", async () => {
    const sessions = await api('/v1/browser/sessions');
    expect(sessions.status).toBe(200);
    const id = sessions.json?.sessions?.[0]?.id;
    if (!id) return;
    const req = await api(`/v1/browser/sessions/${id}/takeover/request`, { method: 'POST', body: JSON.stringify({ reason: 'test' }) }, 'usr_other');
    expect([403,404]).toContain(req.status);
    const res = await api(`/v1/browser/sessions/${id}/takeover/resume`, { method: 'POST', body: JSON.stringify({ note: 'test' }) }, 'usr_other');
    expect([403,404]).toContain(res.status);
  }, 30000);
});
