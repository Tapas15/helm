import { describe, expect, it } from "vitest";

const base = process.env.HELM_API_URL ?? "http://127.0.0.1:8787";
const run = process.env.HELM_INTEGRATION_API === "1";

async function api(path: string, init?: RequestInit, headers: Record<string,string> = {}) {
  const res = await fetch(`${base}${path}`, { ...init, headers: { "content-type": "application/json", ...headers, ...(init?.headers as any ?? {}) } });
  const text = await res.text();
  let json: any = null; try { json = JSON.parse(text); } catch {}
  return { status: res.status, json, text };
}

(run ? describe : describe.skip)("Auth session foundation", () => {
  it("creates session token and authenticates /v1/auth/me + /v1/tasks", async () => {
    const created = await api("/v1/auth/sessions", { method: "POST", body: JSON.stringify({ userId: "usr_local_dev", ttlHours: 1 }) }, { "x-user-id": "usr_local_dev" });
    expect(created.status).toBe(201);
    expect(created.json?.token).toBeTruthy();
    const token = created.json.token as string;

    const me = await api("/v1/auth/me", undefined, { authorization: `Bearer ${token}` });
    expect(me.status).toBe(200);
    expect(me.json?.auth?.userId).toBe("usr_local_dev");
    expect(me.json?.auth?.method).toBe("session_token");

    const tasks = await api("/v1/tasks", undefined, { authorization: `Bearer ${token}` });
    expect(tasks.status).toBe(200);
    expect(Array.isArray(tasks.json?.tasks)).toBe(true);
  }, 30000);
});
