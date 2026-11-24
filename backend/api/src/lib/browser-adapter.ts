import type { BrowserSession, BrowserActionResult } from "@helm/shared";

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

export class BrowserOSAdapterStub implements BrowserOSAdapter {
  kind = "browseros" as const;
  private msg = "BrowserOS adapter endpoint not configured; set BROWSEROS_BASE_URL and BROWSEROS_TOKEN or use BROWSER_ADAPTER=playwright";
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

export function createBrowserAdapter(env: NodeJS.ProcessEnv = process.env): BrowserOSAdapter {
  const kind = (env.BROWSER_ADAPTER ?? "playwright").toLowerCase();
  if (kind === "browseros") {
    const base = env.BROWSEROS_BASE_URL;
    const token = env.BROWSEROS_TOKEN;
    if (base && token) return new BrowserOSHttpAdapter(base, token);
    return new BrowserOSAdapterStub();
  }
  return new PlaywrightBrowserAdapter(env.BROWSER_WORKER_URL ?? "http://127.0.0.1:8790", env.BROWSER_WORKER_TOKEN ?? "dev-browser-token");
}
