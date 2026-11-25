import type { BrowserSession, BrowserActionResult } from "@helm/shared";
import { BrowserOSMcpExecutor } from "./browseros-mcp-executor.js";

export interface BrowserOSAdapter {
  kind: "playwright" | "browseros";
  request(path: string, init?: RequestInit): Promise<{ status: number; contentType: string; text: string }>;
  requestBinary(path: string, init?: RequestInit): Promise<{ status: number; contentType: string; body: ArrayBuffer }>;
  createSession(input: Record<string, unknown>): Promise<BrowserSession>;
  navigate(sessionId: string, input: Record<string, unknown>): Promise<BrowserActionResult>;
  click(sessionId: string, input: Record<string, unknown>): Promise<BrowserActionResult>;
  fill(sessionId: string, input: Record<string, unknown>): Promise<BrowserActionResult>;
  screenshot(sessionId: string, input: Record<string, unknown>): Promise<BrowserActionResult>;
  snapshot(sessionId: string): Promise<BrowserActionResult>;
  close(sessionId: string): Promise<{ ok: true }>;
}

export class PlaywrightBrowserAdapter implements BrowserOSAdapter {
  kind = "playwright" as const;
  constructor(private baseUrl: string, private token: string) {}
  async request(path: string, init?: RequestInit) {
    const res = await fetch(`${this.baseUrl}${path}`, { ...init, headers: { authorization: `Bearer ${this.token}`, "content-type": "application/json", ...(init?.headers ?? {}) } });
    const text = await res.text();
    return { status: res.status, contentType: res.headers.get("content-type") ?? "application/json", text };
  }
  async requestBinary(path: string, init?: RequestInit) {
    const res = await fetch(`${this.baseUrl}${path}`, { ...init, headers: { authorization: `Bearer ${this.token}`, ...(init?.headers ?? {}) } });
    return { status: res.status, contentType: res.headers.get("content-type") ?? "application/octet-stream", body: await res.arrayBuffer() };
  }
  private async call(path: string, init?: RequestInit) {
    const r = await this.request(path, init);
    const json = JSON.parse(r.text || "{}");
    if (r.status >= 400) throw new Error(JSON.stringify(json));
    return json;
  }
  async createSession(input: Record<string, unknown>) { return (await this.call("/v1/sessions", { method: "POST", body: JSON.stringify(input) })).session; }
  async navigate(sessionId: string, input: Record<string, unknown>) { return this.call(`/v1/sessions/${sessionId}/navigate`, { method: "POST", body: JSON.stringify(input) }); }
  async click(sessionId: string, input: Record<string, unknown>) { return this.call(`/v1/sessions/${sessionId}/click`, { method: "POST", body: JSON.stringify(input) }); }
  async fill(sessionId: string, input: Record<string, unknown>) { return this.call(`/v1/sessions/${sessionId}/fill`, { method: "POST", body: JSON.stringify(input) }); }
  async screenshot(sessionId: string, input: Record<string, unknown>) { return this.call(`/v1/sessions/${sessionId}/screenshot`, { method: "POST", body: JSON.stringify(input) }); }
  async snapshot(sessionId: string) { return this.call(`/v1/sessions/${sessionId}/snapshot`, { method: "POST", body: "{}" }); }
  async close(sessionId: string) { await this.call(`/v1/sessions/${sessionId}/close`, { method: "POST", body: "{}" }); return { ok: true as const }; }
}

function validateHttpUrl(raw: string, envName: string): string {
  let u: URL;
  try { u = new URL(raw); } catch { throw new Error(`Invalid ${envName}: must be a valid http/https URL`); }
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error(`Invalid ${envName}: protocol must be http or https`);
  return raw;
}

export class BrowserOSAdapterStub implements BrowserOSAdapter {
  kind = "browseros" as const;
  constructor(private msg = "BrowserOS adapter endpoint not configured; set BROWSEROS_MCP_URL or BROWSEROS_BASE_URL+BROWSEROS_TOKEN, or use BROWSER_ADAPTER=playwright") {}
  async request(): Promise<{ status: number; contentType: string; text: string }> { throw new Error(this.msg); }
  async requestBinary(): Promise<{ status: number; contentType: string; body: ArrayBuffer }> { throw new Error(this.msg); }
  async createSession(): Promise<BrowserSession> { throw new Error(this.msg); }
  async navigate(): Promise<BrowserActionResult> { throw new Error(this.msg); }
  async click(): Promise<BrowserActionResult> { throw new Error(this.msg); }
  async fill(): Promise<BrowserActionResult> { throw new Error(this.msg); }
  async screenshot(): Promise<BrowserActionResult> { throw new Error(this.msg); }
  async snapshot(): Promise<BrowserActionResult> { throw new Error(this.msg); }
  async close(): Promise<{ ok: true }> { throw new Error(this.msg); }
}

export class BrowserOSHttpAdapter implements BrowserOSAdapter {
  kind = "browseros" as const;
  constructor(private baseUrl: string, private token: string) {}
  async request(path: string, init?: RequestInit) {
    const res = await fetch(`${this.baseUrl}${path}`, { ...init, headers: { authorization: `Bearer ${this.token}`, "content-type": "application/json", ...(init?.headers ?? {}) } });
    const text = await res.text();
    return { status: res.status, contentType: res.headers.get("content-type") ?? "application/json", text };
  }
  async requestBinary(path: string, init?: RequestInit) {
    const res = await fetch(`${this.baseUrl}${path}`, { ...init, headers: { authorization: `Bearer ${this.token}`, ...(init?.headers ?? {}) } });
    return { status: res.status, contentType: res.headers.get("content-type") ?? "application/octet-stream", body: await res.arrayBuffer() };
  }
  private async call(path: string, init?: RequestInit) {
    const r = await this.request(path, init);
    const json = JSON.parse(r.text || "{}");
    if (r.status >= 400) throw new Error(JSON.stringify(json));
    return json;
  }
  async createSession(input: Record<string, unknown>) { return (await this.call("/v1/sessions", { method: "POST", body: JSON.stringify(input) })).session; }
  async navigate(sessionId: string, input: Record<string, unknown>) { return this.call(`/v1/sessions/${sessionId}/navigate`, { method: "POST", body: JSON.stringify(input) }); }
  async click(sessionId: string, input: Record<string, unknown>) { return this.call(`/v1/sessions/${sessionId}/click`, { method: "POST", body: JSON.stringify(input) }); }
  async fill(sessionId: string, input: Record<string, unknown>) { return this.call(`/v1/sessions/${sessionId}/fill`, { method: "POST", body: JSON.stringify(input) }); }
  async screenshot(sessionId: string, input: Record<string, unknown>) { return this.call(`/v1/sessions/${sessionId}/screenshot`, { method: "POST", body: JSON.stringify(input) }); }
  async snapshot(sessionId: string) { return this.call(`/v1/sessions/${sessionId}/snapshot`, { method: "POST", body: "{}" }); }
  async close(sessionId: string) { await this.call(`/v1/sessions/${sessionId}/close`, { method: "POST", body: "{}" }); return { ok: true as const }; }
}

function jsonResponse(status: number, body: unknown) {
  return { status, contentType: "application/json", text: JSON.stringify(body) };
}
function parseBody(init?: RequestInit) {
  if (!init?.body) return {};
  if (typeof init.body === "string") { try { return JSON.parse(init.body); } catch { return {}; } }
  return {};
}

export class BrowserOSMcpAdapter implements BrowserOSAdapter {
  kind = "browseros" as const;
  private exec: BrowserOSMcpExecutor;
  constructor(mcpUrl: string, opts?: { client?: import("./browseros-mcp-client.js").BrowserOSMcpClient }) { this.exec = new BrowserOSMcpExecutor({ mcpUrl, client: opts?.client }); }

  async request(path: string, init?: RequestInit): Promise<{ status: number; contentType: string; text: string }> {
    try {
      const method = (init?.method ?? "GET").toUpperCase();
      const body = parseBody(init);
      if (path === "/v1/capabilities" && method === "GET") {
        const caps = await this.exec.capabilities();
        return jsonResponse(200, { provider: "browseros-mcp", ...caps });
      }
      const m = path.match(/^\/v1\/sessions(?:\/([^/]+)(?:\/(navigate|click|fill|snapshot|screenshot|close|takeover\/request|takeover\/resume|external-action|stream\/status))?)?$/);
      if (!m) return jsonResponse(404, { error: { code: "NOT_FOUND", message: `Unsupported BrowserOS MCP adapter path: ${path}` } });
      const [, sessionId, action] = m;
      if (!sessionId && method === "POST") return jsonResponse(201, { session: await this.exec.createSession(body as any) });
      if (!sessionId && method === "GET") return jsonResponse(200, { sessions: await this.exec.listSessions() });
      if (!sessionId) return jsonResponse(400, { error: { code: "INVALID_REQUEST", message: "sessionId required" } });
      const sid = sessionId;
      if (!action && method === "GET") {
        const session = await this.exec.getSession(sid);
        return session ? jsonResponse(200, { session }) : jsonResponse(404, { error: { code: "NOT_FOUND", message: "Browser session not found" } });
      }
      if (action === "navigate" && method === "POST") { const r = await this.exec.navigate(sid, body); return jsonResponse(r.ok ? 200 : 400, r); }
      if (action === "click" && method === "POST") { const r = await this.exec.click(sid, body); return jsonResponse(r.ok ? 200 : 400, r); }
      if (action === "fill" && method === "POST") { const r = await this.exec.fill(sid, body); return jsonResponse(r.ok ? 200 : 400, r); }
      if (action === "snapshot" && method === "POST") { const r = await this.exec.snapshot(sid); return jsonResponse(r.ok ? 200 : 400, r); }
      if (action === "screenshot" && method === "POST") { const r = await this.exec.screenshot(sid, body); return jsonResponse(r.ok ? 200 : 400, r); }
      if (action === "close" && method === "POST") { const r = await this.exec.closeSession(sid); return jsonResponse(r.ok ? 200 : 400, r); }
      if (action === "takeover/request" && method === "POST") { const r = await this.exec.requestTakeover(sid, body); return jsonResponse(r.ok ? 200 : 400, r); }
      if (action === "takeover/resume" && method === "POST") { const r = await this.exec.resumeAgent(sid, body); return jsonResponse(r.ok ? 200 : 400, r); }
      if (action === "external-action" && method === "POST") { const r = await this.exec.externalAction(sid, body); return jsonResponse(r.ok ? 200 : 400, r); }
      if (action === "stream/status" && method === "GET") {
        const session = await this.exec.getSession(sid);
        return session ? jsonResponse(200, { ok: true, sessionId: sid, action: "stream_status", data: { hasCdp: false, control: session.control, status: session.status, currentUrl: session.currentUrl, provider: "browseros-mcp" } }) : jsonResponse(404, { error: { code: "NOT_FOUND", message: "Browser session not found" } });
      }
      return jsonResponse(404, { error: { code: "NOT_FOUND", message: `Unsupported BrowserOS MCP adapter operation: ${method} ${path}` } });
    } catch (e) {
      return jsonResponse(500, { error: { code: "BROWSEROS_MCP_ERROR", message: e instanceof Error ? e.message : String(e) } });
    }
  }

  async requestBinary(path: string): Promise<{ status: number; contentType: string; body: ArrayBuffer }> {
    const m = path.match(/^\/v1\/sessions\/([^/]+)\/screenshot\.png$/);
    const sid = m?.[1];
    if (!sid) return { status: 404, contentType: "application/json", body: new TextEncoder().encode(JSON.stringify({ error: { code: "NOT_FOUND", message: "Unsupported binary path" } })).buffer };
    const session = await this.exec.getSession(sid);
    if (!session) return { status: 404, contentType: "application/json", body: new TextEncoder().encode(JSON.stringify({ error: { code: "NOT_FOUND", message: "Browser session not found" } })).buffer };
    const shot = await this.exec.screenshot(sid, { fullPage: false });
    const b64 = (shot.data as any)?.base64;
    if (!shot.ok || !b64) return { status: 500, contentType: "application/json", body: new TextEncoder().encode(JSON.stringify(shot.error ?? { code: "SCREENSHOT_FAILED" })).buffer };
    const buf = Buffer.from(b64, "base64");
    return { status: 200, contentType: "image/png", body: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) };
  }

  private async call(path: string, init?: RequestInit) { const r = await this.request(path, init); const json = JSON.parse(r.text || "{}"); if (r.status >= 400) throw new Error(JSON.stringify(json)); return json; }
  async createSession(input: Record<string, unknown>) { return (await this.call("/v1/sessions", { method: "POST", body: JSON.stringify(input) })).session; }
  async navigate(sessionId: string, input: Record<string, unknown>) { return this.call(`/v1/sessions/${sessionId}/navigate`, { method: "POST", body: JSON.stringify(input) }); }
  async click(sessionId: string, input: Record<string, unknown>) { return this.call(`/v1/sessions/${sessionId}/click`, { method: "POST", body: JSON.stringify(input) }); }
  async fill(sessionId: string, input: Record<string, unknown>) { return this.call(`/v1/sessions/${sessionId}/fill`, { method: "POST", body: JSON.stringify(input) }); }
  async screenshot(sessionId: string, input: Record<string, unknown>) { return this.call(`/v1/sessions/${sessionId}/screenshot`, { method: "POST", body: JSON.stringify(input) }); }
  async snapshot(sessionId: string) { return this.call(`/v1/sessions/${sessionId}/snapshot`, { method: "POST", body: "{}" }); }
  async close(sessionId: string) { await this.call(`/v1/sessions/${sessionId}/close`, { method: "POST", body: "{}" }); return { ok: true as const }; }
}

export function createBrowserAdapter(env: NodeJS.ProcessEnv = process.env): BrowserOSAdapter {
  const kind = (env.BROWSER_ADAPTER ?? "playwright").toLowerCase();
  if (kind === "browseros") {
    const mcpUrl = env.BROWSEROS_MCP_URL;
    if (mcpUrl) return new BrowserOSMcpAdapter(validateHttpUrl(mcpUrl, "BROWSEROS_MCP_URL"));
    const base = env.BROWSEROS_BASE_URL;
    const token = env.BROWSEROS_TOKEN;
    if (base && token) return new BrowserOSHttpAdapter(validateHttpUrl(base, "BROWSEROS_BASE_URL"), token);
    if (base && !token) return new BrowserOSAdapterStub("BROWSEROS_TOKEN is required when BROWSEROS_BASE_URL is set");
    if (!base && token) return new BrowserOSAdapterStub("BROWSEROS_BASE_URL is required when BROWSEROS_TOKEN is set");
    return new BrowserOSAdapterStub();
  }
  return new PlaywrightBrowserAdapter(env.BROWSER_WORKER_URL ?? "http://127.0.0.1:8790", env.BROWSER_WORKER_TOKEN ?? "dev-browser-token");
}

