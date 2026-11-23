import { describe, expect, it } from "vitest";

const base = process.env.HELM_API_URL ?? "http://127.0.0.1:8787";
const run = process.env.HELM_INTEGRATION_API === "1";

async function api(path: string, init?: RequestInit, userId = "usr_local_dev") {
  const res = await fetch(`${base}${path}`, { ...init, headers: { "content-type": "application/json", "x-user-id": userId, ...(init?.headers ?? {}) } });
  const text = await res.text();
  let json: any = null; try { json = JSON.parse(text); } catch {}
  return { status: res.status, json, text };
}

(run ? describe : describe.skip)("Browser session ownership API", () => {
  it("denies cross-user session access for get/screenshot/snapshot/close", async () => {
    const sessions = await api("/v1/browser/sessions");
    expect(sessions.status).toBe(200);
    const id = sessions.json?.sessions?.[0]?.id;
    if (!id) return;
    for (const [path, init] of [[`/v1/browser/sessions/${id}`, undefined], [`/v1/browser/sessions/${id}/screenshot.png`, undefined], [`/v1/browser/sessions/${id}/snapshot`, { method: "POST", body: "{}" }], [`/v1/browser/sessions/${id}/close`, { method: "POST", body: "{}" }]] as const) {
      const other = await api(path, init as any, "usr_other");
      expect([403,404]).toContain(other.status);
    }
  }, 30000);
});
