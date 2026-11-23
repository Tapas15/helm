import { chromium, type Browser, type BrowserContext, type Page, type CDPSession } from "playwright";
import { randomUUID, createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { EventEmitter } from "node:events";
import type { BrowserActionResult, BrowserExecutor, BrowserSession, CreateBrowserSessionInput } from "@helm/shared";
import type { z } from "zod";
import { BrowserClickInput, BrowserExternalActionInput, BrowserFillInput, BrowserNavigateInput, BrowserResumeInput, BrowserScreenshotInput, BrowserTakeoverInput } from "@helm/shared";

type PersistedSession = { session: BrowserSession; storageStatePath: string };
type SessionState = { session: BrowserSession; browser: Browser; context: BrowserContext; page: Page; cdp: CDPSession | null; lastScreenshotBase64?: string; lastFrame?: string; closeTimer?: NodeJS.Timeout; emitter: EventEmitter; storageStatePath: string };
const PREVIEW_TTL_MS = 5 * 60_000;
const ARTIFACT_DIR = process.env.BROWSER_ARTIFACT_DIR ?? path.resolve(process.cwd(), ".data", "browser-artifacts");
const STATE_DIR = process.env.BROWSER_STATE_DIR ?? path.resolve(process.cwd(), ".data", "browser-sessions");

async function saveArtifact(sessionId: string, kind: string, ext: string, buf: Buffer, mime: string, metadata: Record<string, unknown>) {
  await mkdir(ARTIFACT_DIR, { recursive: true });
  const id = `ba_${randomUUID().replace(/-/g, "")}`;
  const filePath = path.join(ARTIFACT_DIR, `${id}.${ext}`);
  await writeFile(filePath, buf);
  return { artifactId: id, kind, path: filePath, mime, sha256: createHash("sha256").update(buf).digest("hex"), sizeBytes: buf.byteLength, metadata };
}
async function persistState(state: SessionState) {
  await mkdir(STATE_DIR, { recursive: true });
  const p: PersistedSession = { session: state.session, storageStatePath: state.storageStatePath };
  await writeFile(path.join(STATE_DIR, `${state.session.id}.json`), JSON.stringify(p, null, 2), "utf8");
  await state.context.storageState({ path: state.storageStatePath }).catch(() => undefined);
}

export class PlaywrightBrowserExecutor implements BrowserExecutor {
  private sessions = new Map<string, SessionState>();
  private scheduleClose(id: string) { const s = this.sessions.get(id); if (!s) return; if (s.closeTimer) clearTimeout(s.closeTimer); s.closeTimer = setTimeout(() => { void this.closeSession(id); }, PREVIEW_TTL_MS); }

  private async attachScreencast(state: SessionState) {
    try {
      const cdp = await state.context.newCDPSession(state.page);
      state.cdp = cdp;
      cdp.on("Page.screencastFrame", async (evt: any) => {
        state.lastFrame = evt.data; state.lastScreenshotBase64 = evt.data; state.session.lastScreenshotAt = new Date().toISOString();
        state.emitter.emit("frame", { sessionId: state.session.id, data: evt.data, ts: Date.now(), metadata: evt.metadata ?? null });
        try { await cdp.send("Page.screencastFrameAck", { sessionId: evt.sessionId }); } catch {}
      });
      await cdp.send("Page.startScreencast", { format: "png", everyNthFrame: 2, maxWidth: 1280, maxHeight: 720 });
    } catch { state.cdp = null; }
  }

  private async restoreSession(sessionId: string): Promise<SessionState | null> {
    try {
      const raw = await readFile(path.join(STATE_DIR, `${sessionId}.json`), "utf8");
      const persisted = JSON.parse(raw) as PersistedSession;
      const browser = await chromium.launch({ headless: persisted.session.headless });
      const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, storageState: persisted.storageStatePath });
      const page = await context.newPage();
      const target = persisted.session.currentUrl ?? "about:blank";
      if (target !== "about:blank") await page.goto(target, { waitUntil: "domcontentloaded" }).catch(() => undefined);
      const session: BrowserSession = { ...persisted.session, status: "ready", updatedAt: new Date().toISOString(), control: { owner: "agent", takeoverReason: null, takeoverRequestedAt: persisted.session.control?.takeoverRequestedAt ?? null, resumedAt: new Date().toISOString() } };
      const state: SessionState = { session, browser, context, page, cdp: null, emitter: new EventEmitter(), storageStatePath: persisted.storageStatePath };
      state.emitter.setMaxListeners(50);
      await this.attachScreencast(state);
      this.sessions.set(sessionId, state);
      await persistState(state);
      this.scheduleClose(sessionId);
      return state;
    } catch { return null; }
  }

  private async ensure(sessionId: string): Promise<SessionState | null> { return this.sessions.get(sessionId) ?? await this.restoreSession(sessionId); }

  async createSession(input: CreateBrowserSessionInput): Promise<BrowserSession> {
    const id = `bs_${randomUUID().replace(/-/g, "")}`;
    const now = new Date().toISOString();
    await mkdir(STATE_DIR, { recursive: true });
    const storageStatePath = path.join(STATE_DIR, `${id}.storage.json`);
    const browser = await chromium.launch({ headless: input.headless });
    const context = await browser.newContext({ viewport: input.viewport });
    const page = await context.newPage();
    const session: BrowserSession = { id, provider: "playwright", status: "ready", taskId: input.taskId ?? null, runId: input.runId ?? null, createdAt: now, updatedAt: now, currentUrl: page.url() || null, title: null, headless: input.headless, control: { owner: "agent", takeoverReason: null, takeoverRequestedAt: null, resumedAt: null }, lastScreenshotAt: null };
    const state: SessionState = { session, browser, context, page, cdp: null, emitter: new EventEmitter(), storageStatePath };
    state.emitter.setMaxListeners(50);
    this.sessions.set(id, state);
    await this.attachScreencast(state);
    if (input.initialUrl) await page.goto(input.initialUrl, { waitUntil: "domcontentloaded" });
    session.currentUrl = page.url() || null; session.title = (await page.title().catch(() => "")) || null; session.updatedAt = new Date().toISOString();
    await persistState(state);
    this.scheduleClose(id);
    return session;
  }

  async listSessions(): Promise<BrowserSession[]> { return [...this.sessions.values()].map((s) => s.session).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)); }
  async getSession(sessionId: string): Promise<BrowserSession | null> { return (await this.ensure(sessionId))?.session ?? null; }
  async getScreenshot(sessionId: string): Promise<string | null> { const s = await this.ensure(sessionId); if (!s) return null; if (s.lastScreenshotBase64) return s.lastScreenshotBase64; const buf = await s.page.screenshot({ fullPage: false, type: "png" }).catch(() => null); if (!buf) return null; s.lastScreenshotBase64 = buf.toString("base64"); s.session.lastScreenshotAt = new Date().toISOString(); return s.lastScreenshotBase64; }
  subscribe(sessionId: string, fn: (frame: { sessionId: string; data: string; ts: number }) => void): (() => void) | null { const s = this.sessions.get(sessionId); if (!s) return null; s.emitter.on("frame", fn); return () => { s.emitter.off("frame", fn); }; }
  getLastFrame(sessionId: string): string | null { return this.sessions.get(sessionId)?.lastFrame ?? this.sessions.get(sessionId)?.lastScreenshotBase64 ?? null; }

  async sendInput(sessionId: string, input: any): Promise<{ ok: boolean; error?: string }> {
    const s = await this.ensure(sessionId);
    if (!s) return { ok: false, error: "session not found" };
    if (s.session.control.owner !== "user") return { ok: false, error: "takeover required for interactive control" };
    try {
      if (input.type === "click") await s.page.mouse.click(Number(input.x ?? 0), Number(input.y ?? 0), { button: input.button ?? "left" });
      else if (input.type === "type") await s.page.keyboard.type(String(input.text ?? ""));
      else if (input.type === "press") await s.page.keyboard.press(String(input.key ?? "Enter"));
      else if (input.type === "scroll") await s.page.mouse.wheel(Number(input.deltaX ?? 0), Number(input.deltaY ?? 0));
      else return { ok: false, error: "unsupported input type" };
      s.session.updatedAt = new Date().toISOString(); this.scheduleClose(sessionId); await persistState(s);
      return { ok: true };
    } catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) }; }
  }

  private async withSession(sessionId: string, action: string, fn: (s: SessionState) => Promise<Record<string, unknown> | undefined>, allowDuringTakeover = false): Promise<BrowserActionResult> {
    const state = await this.ensure(sessionId);
    if (!state) return { ok: false, sessionId, action, error: { code: "NOT_FOUND", message: "Browser session not found or unrecoverable", retryable: false } };
    if (state.session.control.owner === "user" && !allowDuringTakeover) return { ok: false, sessionId, action, error: { code: "TAKEOVER_ACTIVE", message: "Browser session is under user takeover", retryable: true } };
    try {
      const data = await fn(state);
      state.session.updatedAt = new Date().toISOString(); state.session.currentUrl = state.page.url() || null; state.session.title = (await state.page.title().catch(() => "")) || null;
      await persistState(state); this.scheduleClose(sessionId);
      return { ok: true, sessionId, action, url: state.session.currentUrl, title: state.session.title, data };
    } catch (err) {
      state.session.status = "error"; state.session.updatedAt = new Date().toISOString(); await persistState(state).catch(() => undefined);
      return { ok: false, sessionId, action, url: state.page.url() || null, error: { code: "BROWSER_ACTION_FAILED", message: err instanceof Error ? err.message : String(err), retryable: true } };
    }
  }

  async navigate(sessionId: string, input: unknown): Promise<BrowserActionResult> { const p = BrowserNavigateInput.parse(input); return this.withSession(sessionId, "navigate", async (s) => { await s.page.goto(p.url, { waitUntil: "domcontentloaded" }); return {}; }); }
  async click(sessionId: string, input: unknown): Promise<BrowserActionResult> { const p = BrowserClickInput.parse(input); return this.withSession(sessionId, "click", async (s) => { await s.page.click(p.selector, { timeout: 10_000 }); return { selector: p.selector }; }); }
  async fill(sessionId: string, input: unknown): Promise<BrowserActionResult> { const p = BrowserFillInput.parse(input); return this.withSession(sessionId, "fill", async (s) => { await s.page.fill(p.selector, p.value, { timeout: 10_000 }); if (p.submit) await s.page.press(p.selector, "Enter"); return { selector: p.selector, submitted: p.submit }; }); }
  async snapshot(sessionId: string): Promise<BrowserActionResult> { return this.withSession(sessionId, "snapshot", async (s) => { const text = await s.page.locator("body").innerText().catch(() => ""); const buf = Buffer.from(text, "utf8"); const artifact = await saveArtifact(sessionId, "dom_snapshot", "txt", buf, "text/plain; charset=utf-8", { url: s.page.url(), title: await s.page.title().catch(() => "") }); return { text: text.slice(0, 20_000), artifact }; }, true); }
  async screenshot(sessionId: string, input: z.infer<typeof BrowserScreenshotInput>): Promise<BrowserActionResult> { return this.withSession(sessionId, "screenshot", async (s) => { const buf = await s.page.screenshot({ fullPage: input.fullPage, type: "png" }); s.lastScreenshotBase64 = buf.toString("base64"); s.session.lastScreenshotAt = new Date().toISOString(); const artifact = await saveArtifact(sessionId, "screenshot", "png", buf, "image/png", { url: s.page.url(), title: await s.page.title().catch(() => ""), fullPage: input.fullPage }); return { mime: "image/png", base64: s.lastScreenshotBase64, artifact }; }, true); }
  async requestTakeover(sessionId: string, input: unknown): Promise<BrowserActionResult> { const p = BrowserTakeoverInput.parse(input); return this.withSession(sessionId, "takeover.request", async (s) => { s.session.status = "takeover"; s.session.control = { owner: "user", takeoverReason: p.reason, takeoverRequestedAt: new Date().toISOString(), resumedAt: null }; return { control: s.session.control }; }, true); }
  async resumeAgent(sessionId: string, input: unknown): Promise<BrowserActionResult> { const p = BrowserResumeInput.parse(input); return this.withSession(sessionId, "takeover.resume", async (s) => { s.session.status = "ready"; s.session.control = { owner: "agent", takeoverReason: null, takeoverRequestedAt: s.session.control.takeoverRequestedAt, resumedAt: new Date().toISOString() }; return { control: s.session.control, note: p.note ?? null }; }, true); }
  async externalAction(sessionId: string, input: unknown): Promise<BrowserActionResult> {
    const p = BrowserExternalActionInput.parse(input);
    return this.withSession(sessionId, `external.${p.action}`, async (s) => {
      if (p.selector) await s.page.click(p.selector, { timeout: 10_000 });
      const shot = await s.page.screenshot({ fullPage: false, type: "png" });
      s.lastScreenshotBase64 = shot.toString("base64"); s.session.lastScreenshotAt = new Date().toISOString();
      const artifact = await saveArtifact(sessionId, "external_action_evidence", "png", shot, "image/png", { action: p.action, actionHash: p.actionHash, idempotencyKey: p.idempotencyKey, approvalId: p.approvalId, url: s.page.url() });
      return { action: p.action, actionHash: p.actionHash, idempotencyKey: p.idempotencyKey, approvalId: p.approvalId, artifact, executed: true };
    });
  }

  async closeSession(sessionId: string): Promise<BrowserActionResult> {
    const state = await this.ensure(sessionId);
    if (!state) return { ok: false, sessionId, action: "close", error: { code: "NOT_FOUND", message: "Browser session not found", retryable: false } };
    if (state.closeTimer) clearTimeout(state.closeTimer);
    try { if (state.cdp) await state.cdp.send("Page.stopScreencast").catch(() => {}); } catch {}
    await state.context.close().catch(() => undefined); await state.browser.close().catch(() => undefined);
    state.session.status = "closed"; state.session.updatedAt = new Date().toISOString(); await persistState(state).catch(() => undefined);
    this.sessions.delete(sessionId);
    return { ok: true, sessionId, action: "close" };
  }
}
