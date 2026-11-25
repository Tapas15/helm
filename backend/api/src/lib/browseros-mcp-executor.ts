import { BrowserOSMcpClient } from "./browseros-mcp-client.js";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID, createHash } from "node:crypto";
import type { BrowserActionResult, BrowserExecutor, BrowserSession, CreateBrowserSessionInput } from "@helm/shared";
import { BrowserClickInput, BrowserExternalActionInput, BrowserFillInput, BrowserNavigateInput, BrowserResumeInput, BrowserScreenshotInput, BrowserTakeoverInput } from "@helm/shared";

type SessionState = {
  session: BrowserSession;
  pageId: number | null;
  mcpSessionId?: string;
  lastScreenshotBase64?: string;
};

const PREVIEW_TTL_MS = 5 * 60_000;

async function saveArtifact(artifactDir: string, sessionId: string, kind: string, ext: string, buf: Buffer, mime: string, metadata: Record<string, unknown>) {
  await mkdir(artifactDir, { recursive: true });
  const id = `ba_${randomUUID().replace(/-/g, "")}`;
  const filePath = path.join(artifactDir, `${id}.${ext}`);
  await writeFile(filePath, buf);
  return { artifactId: id, kind, path: filePath, mime, sha256: createHash("sha256").update(buf).digest("hex"), sizeBytes: buf.byteLength, metadata };
}

function toolErrorMessage(result: any): string {
  if (!result) return "Unknown MCP tool error";
  if (result.isError) {
    const text = (result.content ?? []).map((c: any) => c?.text ?? "").filter(Boolean).join("\n");
    return text || "MCP tool returned error";
  }
  return "ok";
}

function toolText(result: any): string {
  return (result?.content ?? []).map((c: any) => c?.text ?? "").filter(Boolean).join("\n");
}

function parsePageIdFromText(text: string): number | null {
  const patterns = [/\bopened page (\d+)\b/i, /\bpage\s+id\s*[:=]?\s*(\d+)\b/i];
  for (const re of patterns) {
    const m = text.match(re);
    if (m?.[1]) { const n = Number(m[1]); if (Number.isFinite(n)) return n; }
  }
  return null;
}

export class BrowserOSMcpExecutor implements BrowserExecutor {
  private sessions = new Map<string, SessionState>();
  private closeTimers = new Map<string, NodeJS.Timeout>();
  private client: BrowserOSMcpClient;
  private artifactDir: string;
  private mcpUrl: string;

  constructor(opts?: { mcpUrl?: string; artifactDir?: string; client?: BrowserOSMcpClient }) {
    this.mcpUrl = opts?.mcpUrl ?? process.env.BROWSEROS_MCP_URL ?? "http://127.0.0.1:9210/mcp";
    this.client = opts?.client ?? new BrowserOSMcpClient(this.mcpUrl);
    this.artifactDir = opts?.artifactDir ?? process.env.BROWSER_ARTIFACT_DIR ?? path.resolve(process.cwd(), ".data", "browser-artifacts");
  }

  private scheduleClose(id: string) {
    const prev = this.closeTimers.get(id);
    if (prev) clearTimeout(prev);
    this.closeTimers.set(id, setTimeout(() => { void this.closeSession(id); }, PREVIEW_TTL_MS));
  }

  private extractPageId(result: any): number | null {
    const structured = result?.structuredContent ?? {};
    const page = structured?.page ?? result?.page ?? null;
    const direct = typeof page?.id === "number" ? page.id : (typeof page === "number" ? page : null);
    if (typeof direct === "number") return direct;
    const text = toolText(result);
    return parsePageIdFromText(text);
  }

  private extractPageIdFromList(result: any, preferredUrl?: string | null): number | null {
    const structured = result?.structuredContent ?? {};
    const pages = structured?.pages ?? result?.pages ?? structured?.tabs ?? result?.tabs;
    if (Array.isArray(pages)) {
      if (preferredUrl) {
        const match = pages.find((p: any) => typeof p?.url === "string" && p.url.includes(preferredUrl));
        if (typeof match?.id === "number") return match.id;
        if (typeof match?.pageId === "number") return match.pageId;
      }
      const last = pages[pages.length - 1];
      if (typeof last?.id === "number") return last.id;
      if (typeof last?.pageId === "number") return last.pageId;
    }
    const text = toolText(result);
    const ids = [...text.matchAll(/\bpage\s+(\d+)\b/gi)].map(m => Number(m[1])).filter(Number.isFinite);
    if (ids.length) return ids[ids.length - 1] ?? null;
    return null;
  }

  private ensure(id: string): SessionState | null {
    return this.sessions.get(id) ?? null;
  }

  async createSession(input: CreateBrowserSessionInput): Promise<BrowserSession> {
    const id = `bos_${randomUUID().replace(/-/g, "")}`;
    const now = new Date().toISOString();
    const session: BrowserSession = {
      id, provider: "browseros", status: "ready", taskId: input.taskId ?? null, runId: input.runId ?? null,
      createdAt: now, updatedAt: now, currentUrl: input.initialUrl ?? null, title: null, headless: input.headless,
      control: { owner: "agent", takeoverReason: null, takeoverRequestedAt: null, resumedAt: null }, lastScreenshotAt: null,
    };
    const state: SessionState = { session, pageId: null };
    this.sessions.set(id, state);
    try {
      await this.client.ensureInitialized();
      const caps = await this.client.ensureCapabilities();
      if (!caps.ok) throw new Error(`Missing required MCP tools: ${caps.missing.join(", ")}`);
      state.mcpSessionId = this.client.getSessionId() ?? undefined;
      const newArgs: Record<string, unknown> = { action: "new" };
      if (input.initialUrl) newArgs.url = input.initialUrl;
      const created = await this.client.callTool("tabs", newArgs);
      if (created?.isError) throw new Error(toolErrorMessage(created));
      state.pageId = this.extractPageId(created);
      if (state.pageId == null) {
        // Fallback: list tabs and pick newest/active
        const listed = await this.client.callTool("tabs", { action: "list" }).catch(() => null);
        state.pageId = this.extractPageIdFromList(listed, input.initialUrl);
      }
      session.currentUrl = input.initialUrl ?? session.currentUrl;
      session.title = null;
      session.updatedAt = new Date().toISOString();
      this.scheduleClose(id);
      return session;
    } catch (e) {
      session.status = "error"; session.updatedAt = new Date().toISOString();
      const err = e instanceof Error ? e : new Error(String(e));
      (err as any).code = this.classifyError(err).code;
      throw err;
    }
  }

  async listSessions(): Promise<BrowserSession[]> { return [...this.sessions.values()].map(s => s.session).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)); }
  async getSession(sessionId: string): Promise<BrowserSession | null> { return this.ensure(sessionId)?.session ?? null; }

  private classifyError(e: unknown): { code: string; message: string; retryable: boolean } {
    const msg = e instanceof Error ? e.message : String(e);
    const lower = msg.toLowerCase();
    if (lower.includes("timed out") || lower.includes("timeout")) return { code: "BROWSEROS_TIMEOUT", message: msg, retryable: true };
    if (lower.includes("selector not found")) return { code: "SELECTOR_NOT_FOUND", message: msg, retryable: false };
    if (lower.includes("initialize") || lower.includes("econnrefused") || lower.includes("fetch failed")) return { code: "BROWSEROS_UNAVAILABLE", message: msg, retryable: true };
    if (lower.includes("missing required mcp tools")) return { code: "BROWSEROS_CAPABILITY_MISSING", message: msg, retryable: false };
    return { code: "BROWSEROS_ACTION_FAILED", message: msg, retryable: false };
  }

  private async withPage(sessionId: string, action: string, fn: (s: SessionState, pageId: number) => Promise<Record<string, unknown> | undefined>, allowDuringTakeover = false): Promise<BrowserActionResult> {
    const s = this.ensure(sessionId);
    if (!s) return { ok: false, sessionId, action, error: { code: "NOT_FOUND", message: "BrowserOS session not found", retryable: false } };
    if (s.session.control.owner === "user" && !allowDuringTakeover) return { ok: false, sessionId, action, error: { code: "TAKEOVER_ACTIVE", message: "BrowserOS session is under user takeover", retryable: true } };
    if (s.pageId == null) return { ok: false, sessionId, action, error: { code: "NO_PAGE", message: "BrowserOS session has no page", retryable: false } };
    try {
      const data = await fn(s, s.pageId);
      s.session.updatedAt = new Date().toISOString();
      this.scheduleClose(sessionId);
      return { ok: true, sessionId, action, url: s.session.currentUrl, title: s.session.title, data };
    } catch (e) {
      s.session.status = "error"; s.session.updatedAt = new Date().toISOString();
      return { ok: false, sessionId, action, url: s.session.currentUrl, error: this.classifyError(e) };
    }
  }

  async capabilities(): Promise<{ ok: boolean; tools: string[]; missing: string[]; checkedAt: string }> {
    await this.client.ensureInitialized();
    return this.client.ensureCapabilities();
  }

  async navigate(sessionId: string, input: unknown): Promise<BrowserActionResult> {
    const p = BrowserNavigateInput.parse(input);
    return this.withPage(sessionId, "navigate", async (s, pageId) => {
      const r = await this.client.callTool("navigate", { page: pageId, action: "url", url: p.url });
      if (r?.isError) throw new Error(toolErrorMessage(r));
      s.session.currentUrl = p.url;
      return { text: toolText(r).slice(0, 500) };
    });
  }
  async click(sessionId: string, input: unknown): Promise<BrowserActionResult> {
    const p = BrowserClickInput.parse(input);
    return this.withPage(sessionId, "click", async (_s, pageId) => {
      const code = `return (() => { const el = document.querySelector(${JSON.stringify(p.selector)}); if (!el) return 'selector_not_found'; el.scrollIntoView({block:'center'}); el.click(); return 'ok'; })()`;
      const r = await this.client.callTool("evaluate_in_page", { page: pageId, code });
      if (r?.isError) throw new Error(toolErrorMessage(r));
      const txt = toolText(r);
      if (/selector_not_found/.test(txt)) throw new Error(`Selector not found: ${p.selector}`);
      return { selector: p.selector, text: txt.slice(0, 500) };
    });
  }
  async fill(sessionId: string, input: unknown): Promise<BrowserActionResult> {
    const p = BrowserFillInput.parse(input);
    return this.withPage(sessionId, "fill", async (_s, pageId) => {
      const code = `return (() => { const el = document.querySelector(${JSON.stringify(p.selector)}); if (!el) return 'selector_not_found'; el.focus(); if ('value' in el) { el.value = ${JSON.stringify(p.value)}; el.dispatchEvent(new Event('input',{bubbles:true})); el.dispatchEvent(new Event('change',{bubbles:true})); } else { el.textContent = ${JSON.stringify(p.value)}; } ${p.submit ? "const f=el.form||el.closest('form'); if(f) f.requestSubmit ? f.requestSubmit() : f.submit();" : ""} return 'ok'; })()`;
      const r = await this.client.callTool("evaluate_in_page", { page: pageId, code });
      if (r?.isError) throw new Error(toolErrorMessage(r));
      const txt = toolText(r);
      if (/selector_not_found/.test(txt)) throw new Error(`Selector not found: ${p.selector}`);
      return { selector: p.selector, submitted: p.submit, text: txt.slice(0, 500) };
    });
  }
  async snapshot(sessionId: string): Promise<BrowserActionResult> {
    return this.withPage(sessionId, "snapshot", async (_s, pageId) => {
      const r = await this.client.callTool("snapshot", { page: pageId, mode: "interactive" });
      if (r?.isError) throw new Error(toolErrorMessage(r));
      const text = toolText(r).slice(0, 20_000);
      const buf = Buffer.from(text, "utf8");
      const artifact = await saveArtifact(this.artifactDir, sessionId, "dom_snapshot", "txt", buf, "text/plain; charset=utf-8", { provider: "browseros", mcpUrl: this.mcpUrl, pageId });
      return { text, artifact };
    }, true);
  }
  async screenshot(sessionId: string, input: unknown): Promise<BrowserActionResult> {
    const p = BrowserScreenshotInput.parse(input);
    return this.withPage(sessionId, "screenshot", async (s, pageId) => {
      const r = await this.client.callTool("screenshot", { page: pageId, format: "png", fullPage: p.fullPage ?? false });
      if (r?.isError) throw new Error(toolErrorMessage(r));
      const img = (r?.content ?? []).find((c: any) => c?.type === "image" && c?.data);
      if (!img?.data) throw new Error("BrowserOS screenshot returned no image data");
      const buf = Buffer.from(img.data, "base64");
      s.lastScreenshotBase64 = img.data;
      s.session.lastScreenshotAt = new Date().toISOString();
      const artifact = await saveArtifact(this.artifactDir, sessionId, "screenshot", "png", buf, "image/png", { provider: "browseros", mcpUrl: this.mcpUrl, pageId, fullPage: p.fullPage ?? false });
      return { mime: img.mimeType ?? "image/png", base64: img.data, artifact };
    }, true);
  }
  async requestTakeover(sessionId: string, input: unknown): Promise<BrowserActionResult> {
    const p = BrowserTakeoverInput.parse(input);
    const s = this.ensure(sessionId);
    if (!s) return { ok: false, sessionId, action: "takeover.request", error: { code: "NOT_FOUND", message: "BrowserOS session not found", retryable: false } };
    s.session.status = "takeover"; s.session.control = { owner: "user", takeoverReason: p.reason, takeoverRequestedAt: new Date().toISOString(), resumedAt: null }; s.session.updatedAt = new Date().toISOString();
    return { ok: true, sessionId, action: "takeover.request", data: { control: s.session.control } };
  }
  async resumeAgent(sessionId: string, input: unknown): Promise<BrowserActionResult> {
    const p = BrowserResumeInput.parse(input);
    const s = this.ensure(sessionId);
    if (!s) return { ok: false, sessionId, action: "takeover.resume", error: { code: "NOT_FOUND", message: "BrowserOS session not found", retryable: false } };
    s.session.status = "ready"; s.session.control = { owner: "agent", takeoverReason: null, takeoverRequestedAt: s.session.control.takeoverRequestedAt, resumedAt: new Date().toISOString() }; s.session.updatedAt = new Date().toISOString();
    return { ok: true, sessionId, action: "takeover.resume", data: { control: s.session.control, note: p.note ?? null } };
  }
  async externalAction(sessionId: string, input: unknown): Promise<BrowserActionResult> {
    const p = BrowserExternalActionInput.parse(input);
    return this.withPage(sessionId, `external.${p.action}`, async (s, pageId) => {
      if (p.selector) {
        const code = `(() => { const el = document.querySelector(${JSON.stringify(p.selector)}); if(!el) return {ok:false}; el.click(); return {ok:true}; })()`;
        const r = await this.client.callTool("evaluate_in_page", { page: pageId, code });
        if (r?.isError) throw new Error(toolErrorMessage(r));
      }
      const shot = await this.client.callTool("screenshot", { page: pageId, format: "png", fullPage: false });
      const img = (shot?.content ?? []).find((c: any) => c?.type === "image" && c?.data);
      const buf = img?.data ? Buffer.from(img.data, "base64") : Buffer.alloc(0);
      if (img?.data) { s.lastScreenshotBase64 = img.data; s.session.lastScreenshotAt = new Date().toISOString(); }
      const artifact = await saveArtifact(this.artifactDir, sessionId, "external_action_evidence", "png", buf, "image/png", { provider: "browseros", action: p.action, actionHash: p.actionHash, idempotencyKey: p.idempotencyKey, approvalId: p.approvalId });
      return { action: p.action, actionHash: p.actionHash, idempotencyKey: p.idempotencyKey, approvalId: p.approvalId, artifact, executed: true };
    });
  }

  async closeSession(sessionId: string): Promise<BrowserActionResult> {
    const s = this.ensure(sessionId);
    if (!s) return { ok: false, sessionId, action: "close", error: { code: "NOT_FOUND", message: "BrowserOS session not found", retryable: false } };
    const timer = this.closeTimers.get(sessionId); if (timer) clearTimeout(timer); this.closeTimers.delete(sessionId);
    try {
      if (s.pageId != null) await this.client.callTool("tabs", { action: "close", page: s.pageId }).catch(() => undefined);
    } finally {
      s.session.status = "closed"; s.session.updatedAt = new Date().toISOString();
      this.sessions.delete(sessionId);
    }
    return { ok: true, sessionId, action: "close" };
  }
}
