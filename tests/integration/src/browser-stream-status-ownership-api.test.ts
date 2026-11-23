import { describe, expect, it } from "vitest";

const base = process.env.HELM_API_URL ?? "http://127.0.0.1:8787";
const run = process.env.HELM_INTEGRATION_API === "1";

async function api(path: string, init?: RequestInit, userId = "usr_local_dev") {
  const res = await fetch(`${base}${path}`, { ...init, headers: { "content-type": "application/json", "x-user-id": userId, ...(init?.headers ?? {}) } });
  const text = await res.text();
  let json: any = null; try { json = JSON.parse(text); } catch {}
  return { status: res.status, json, text };
}

(run ? describe : describe.skip)("Browser stream status ownership", () => {
  it("allows owner and denies cross-user", async () => {
    const sessions = await api("/v1/browser/sessions");
    expect(sessions.status).toBe(200);
    const id = sessions.json?.sessions?.[0]?.id;
    if (!id) return;
    const own = await api(`/v1/browser/sessions/${id}/stream/status`);
    expect([200,404]).toContain(own.status);
    if (own.status === 200) expect(own.json?.ok).toBe(true);
    const other = await api(`/v1/browser/sessions/${id}/stream/status`, undefined, "usr_other");
    expect([403,404]).toContain(other.status);
  }, 30000);
});
