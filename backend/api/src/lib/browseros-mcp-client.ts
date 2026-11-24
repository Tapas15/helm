
type McpResult = { ok: true; result: any; sessionId?: string } | { ok: false; error: { code?: number; message: string; data?: unknown }; sessionId?: string };

export class BrowserOSMcpClient {
  private url: string;
  private sessionId: string | null = null;
  private nextId = 1;
  private initPromise: Promise<void> | null = null;

  constructor(url: string) {
    this.url = url;
  }

  private async parseResponse(res: Response): Promise<{ sessionId?: string; messages: any[] }> {
    const sessionId = res.headers.get("mcp-session-id") ?? undefined;
    const ct = (res.headers.get("content-type") ?? "").toLowerCase();
    const text = await res.text();
    if (ct.includes("text/event-stream")) {
      const messages: any[] = [];
      let dataLines: string[] = [];
      const flush = () => {
        if (!dataLines.length) return;
        const raw = dataLines.join("\n").trim();
        dataLines = [];
        if (!raw) return;
        try { messages.push(JSON.parse(raw)); } catch { /* ignore non-json event */ }
      };
      for (const line of text.split(/\r?\n/)) {
        if (line.startsWith("data:")) dataLines.push(line.slice(5).trimStart());
        else if (line === "") flush();
      }
      flush();
      return { sessionId, messages };
    }
    try { return { sessionId, messages: [JSON.parse(text)] }; } catch { return { sessionId, messages: [] }; }
  }

  private async post(body: unknown, includeSession = true): Promise<{ sessionId?: string; messages: any[]; status: number }> {
    const headers: Record<string, string> = {
      "content-type": "application/json",
      "accept": "application/json, text/event-stream",
    };
    if (includeSession && this.sessionId) headers["mcp-session-id"] = this.sessionId;
    const res = await fetch(this.url, { method: "POST", headers, body: JSON.stringify(body) });
    const parsed = await this.parseResponse(res);
    if (parsed.sessionId) this.sessionId = parsed.sessionId;
    return { ...parsed, status: res.status };
  }

  async ensureInitialized(): Promise<void> {
    if (this.sessionId) return;
    if (this.initPromise) return this.initPromise;
    this.initPromise = (async () => {
      const init = await this.post({
        jsonrpc: "2.0",
        id: this.nextId++,
        method: "initialize",
        params: {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: { name: "helm", version: "0.1.0" },
        },
      }, false);
      if (init.status >= 400) throw new Error(`MCP initialize failed (${init.status})`);
      const msg = init.messages.find((m) => m?.id === 1) ?? init.messages[0];
      if (msg?.error) throw new Error(msg.error.message ?? "MCP initialize error");
      await this.post({ jsonrpc: "2.0", method: "notifications/initialized", params: {} }).catch(() => undefined);
    })().finally(() => { this.initPromise = null; });
    return this.initPromise;
  }

  async call(method: string, params: Record<string, unknown> = {}): Promise<McpResult> {
    await this.ensureInitialized();
    const id = this.nextId++;
    const res = await this.post({ jsonrpc: "2.0", id, method, params });
    const msg = res.messages.find((m) => m?.id === id) ?? res.messages.find((m) => m?.result || m?.error);
    if (!msg) return { ok: false, error: { message: `No MCP response for ${method}` }, sessionId: this.sessionId ?? undefined };
    if (msg.error) return { ok: false, error: msg.error, sessionId: this.sessionId ?? undefined };
    return { ok: true, result: msg.result, sessionId: this.sessionId ?? undefined };
  }

  async listTools(): Promise<any[]> {
    const r = await this.call("tools/list", {});
    if (!r.ok) throw new Error(r.error.message);
    return r.result?.tools ?? [];
  }

  async callTool(name: string, args: Record<string, unknown> = {}): Promise<any> {
    const r = await this.call("tools/call", { name, arguments: args });
    if (!r.ok) throw new Error(r.error.message);
    return r.result;
  }

  getSessionId() { return this.sessionId; }
}