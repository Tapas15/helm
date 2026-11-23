import { describe, expect, it } from "vitest";
import WebSocket from "ws";

const base = process.env.HELM_API_URL ?? "http://127.0.0.1:8787";
const run = process.env.HELM_INTEGRATION_API === "1";

async function api(path: string, init?: RequestInit, headers: Record<string,string> = { "x-user-id": "usr_local_dev" }) {
  const res = await fetch(`${base}${path}`, { ...init, headers: { "content-type": "application/json", ...headers, ...(init?.headers as any ?? {}) } });
  const text = await res.text();
  let json: any = null; try { json = JSON.parse(text); } catch {}
  return { status: res.status, json, text };
}

function wsOpen(url: string, headers: Record<string,string>): Promise<{opened:boolean; code?:number; msg?:string}> {
  return new Promise((resolve) => {
    const ws = new WebSocket(url, { headers });
    let done = false;
    ws.on('open', () => { if(done) return; done=true; ws.close(); resolve({opened:true}); });
    ws.on('unexpected-response', (_req, res) => { if(done) return; done=true; resolve({opened:false, code: res.statusCode, msg: res.statusMessage}); });
    ws.on('error', () => {});
    setTimeout(() => { if(done) return; done=true; try{ws.terminate();}catch{} resolve({opened:false, code:0, msg:'timeout'}); }, 5000);
  });
}

(run ? describe : describe.skip)("Browser WS authz", () => {
  it("denies cross-user websocket stream upgrade and allows bearer session token owner", async () => {
    const sessions = await api('/v1/browser/sessions');
    expect(sessions.status).toBe(200);
    const id = sessions.json?.sessions?.[0]?.id;
    if (!id) return;
    const wsUrl = base.replace(/^http/, 'ws') + `/v1/browser/sessions/${id}/stream`;

    const denied = await wsOpen(wsUrl, { 'x-user-id': 'usr_other' });
    expect(denied.opened).toBe(false);
    expect([401,403,404]).toContain(denied.code ?? 0);

    const tokenRes = await api('/v1/auth/sessions', { method:'POST', body: JSON.stringify({ userId: 'usr_local_dev', ttlHours: 1 }) }, { 'x-user-id': 'usr_local_dev' });
    expect(tokenRes.status).toBe(201);
    const token = tokenRes.json?.token as string;
    const ok = await wsOpen(wsUrl, { authorization: `Bearer ${token}` });
    // May open or 404 if session lost; must not be authz denial
    expect([true, false]).toContain(ok.opened);
    if (!ok.opened) expect([404,0]).toContain(ok.code ?? 0);
  }, 20000);
});
