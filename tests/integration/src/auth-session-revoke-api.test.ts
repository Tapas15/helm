import { describe, expect, it } from "vitest";

const base = process.env.HELM_API_URL ?? "http://127.0.0.1:8787";
const run = process.env.HELM_INTEGRATION_API === "1";

async function api(path: string, init?: RequestInit, headers: Record<string,string> = {}) {
  const res = await fetch(`${base}${path}`, { ...init, headers: { "content-type": "application/json", ...headers, ...(init?.headers as any ?? {}) } });
  const text = await res.text();
  let json: any = null; try { json = JSON.parse(text); } catch {}
  return { status: res.status, json, text };
}

(run ? describe : describe.skip)("Auth session revoke", () => {
  it("revokes session and blocks bearer token", async () => {
    const created = await api("/v1/auth/sessions", { method: "POST", body: JSON.stringify({ userId: "usr_local_dev", ttlHours: 1 }) }, { "x-user-id": "usr_local_dev" });
    expect(created.status).toBe(201);
    const token = created.json.token as string;
    const id = created.json.session.id as string;

    const me = await api("/v1/auth/me", undefined, { authorization: `Bearer ${token}` });
    expect(me.status).toBe(200);

    const revoked = await api(`/v1/auth/sessions/${id}/revoke`, { method: "POST" }, { authorization: `Bearer ${token}` });
    expect(revoked.status).toBe(200);

    const after = await api("/v1/auth/me", undefined, { authorization: `Bearer ${token}` });
    expect(after.status).toBe(401);
  }, 30000);
});
