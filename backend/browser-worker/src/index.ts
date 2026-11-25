import "dotenv/config";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { z } from "zod";
import { WebSocketServer } from "ws";
import { TRACE_HEADER, ensureTraceFields } from "@helm/observability";
import { BrowserClickInput, BrowserExternalActionInput, BrowserFillInput, BrowserNavigateInput, BrowserResumeInput, BrowserScreenshotInput, BrowserTakeoverInput, CreateBrowserSessionInput, HELM_ERROR_CODES } from "@helm/shared";
import { logger as log } from "./lib/logger.js";
import { PlaywrightBrowserExecutor } from "./playwrightExecutor.js";

const port = Number(process.env.BROWSER_WORKER_PORT ?? 8790);
const token = process.env.BROWSER_WORKER_TOKEN ?? "dev-browser-token";
const executor = new PlaywrightBrowserExecutor();
type BrowserEnv = { Variables: { requestId: string; correlationId: string } };
const app = new Hono<BrowserEnv>();
const err = (code: string, message: string, retryable = false, details?: unknown) => ({ error: { code, message, retryable, ...(details !== undefined ? { details } : {}) } });

app.use("*", async (c, next) => {
  const trace = ensureTraceFields({ requestId: c.req.header(TRACE_HEADER.requestId) ?? undefined, correlationId: c.req.header(TRACE_HEADER.correlationId) ?? undefined }, () => crypto.randomUUID());
  c.set("requestId", trace.requestId); c.set("correlationId", trace.correlationId);
  c.header(TRACE_HEADER.requestId, trace.requestId); c.header(TRACE_HEADER.correlationId, trace.correlationId);
  if (c.req.path !== "/health") { const auth = c.req.header("authorization"); if (auth !== `Bearer ${token}`) return c.json(err(HELM_ERROR_CODES.UNAUTHORIZED, "Invalid token"), 401); }
  const start = Date.now(); await next();
  log.info({ requestId: trace.requestId, correlationId: trace.correlationId, method: c.req.method, path: c.req.path, status: c.res.status, ms: Date.now() - start }, "request");
});

app.get("/health", (c) => c.json({ ok: true, service: "helm-browser-worker", provider: "playwright", ts: new Date().toISOString() }));
app.get("/v1/sessions", async (c) => c.json({ sessions: await executor.listSessions() }));
app.post("/v1/sessions", async (c) => { const body = await c.req.json().catch(() => null); const parsed = CreateBrowserSessionInput.safeParse(body); if (!parsed.success) return c.json(err(HELM_ERROR_CODES.VALIDATION_ERROR, "Invalid session input", false, parsed.error.flatten()), 400); if (parsed.data.provider !== "playwright") return c.json(err(HELM_ERROR_CODES.NOT_IMPLEMENTED, `Provider ${parsed.data.provider} not enabled`, false), 501); return c.json({ session: await executor.createSession(parsed.data) }, 201); });
app.get("/v1/sessions/:id", async (c) => { const session = await executor.getSession(c.req.param("id")); if (!session) return c.json(err(HELM_ERROR_CODES.NOT_FOUND, "Browser session not found"), 404); return c.json({ session }); });
app.get("/v1/sessions/:id/screenshot.png", async (c) => { const b64 = await executor.getScreenshot(c.req.param("id")); if (!b64) return c.json(err(HELM_ERROR_CODES.NOT_FOUND, "No screenshot available"), 404); c.header("content-type","image/png"); c.header("cache-control","no-store"); return c.body(Buffer.from(b64,"base64")); });
app.get("/v1/sessions/:id/stream/status", async (c) => c.json(await executor.streamStatus(c.req.param("id"))));
function correlationFrom(input: any) {
  const c = input && typeof input === "object" ? input : {};
  const pick = (k: string) => typeof c[k] === "string" && c[k].trim() ? c[k].trim().slice(0, 200) : undefined;
  const corr = {
    userId: pick("userId"),
    taskId: pick("taskId"),
    runId: typeof c.runId === "string" && c.runId.trim() ? c.runId.trim().slice(0, 200) : c.runId === null ? null : undefined,
    correlationId: pick("correlationId"),
    approvalId: pick("approvalId"),
    actionHash: pick("actionHash"),
  };
  return Object.fromEntries(Object.entries(corr).filter(([, v]) => v !== undefined));
}

async function action<T extends z.ZodTypeAny>(c: any, schema: T, actionName: string, fn: (input: z.infer<T>) => Promise<unknown>) {
  const body = await c.req.json().catch(() => ({}));
  const corr = correlationFrom(body);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return c.json(err(HELM_ERROR_CODES.VALIDATION_ERROR, "Invalid action input", false, { issues: parsed.error.flatten(), correlation: corr }), 400);
  const safeCorr = correlationFrom(parsed.data);
  const result = await fn(parsed.data);
  const ok = !!(result as any)?.ok;
  log.info({ requestId: c.get("requestId"), traceCorrelationId: c.get("correlationId"), sessionId: c.req.param("id"), action: actionName, ok, ...safeCorr }, "browser action");
  const payload = result && typeof result === "object" ? { ...(result as Record<string, unknown>), correlation: safeCorr } : result;
  return c.json(payload, ok ? 200 : 400);
}
app.post("/v1/sessions/:id/navigate", (c) => action(c, BrowserNavigateInput, "navigate", (input) => executor.navigate(c.req.param("id"), input)));
app.post("/v1/sessions/:id/click", (c) => action(c, BrowserClickInput, "click", (input) => executor.click(c.req.param("id"), input)));
app.post("/v1/sessions/:id/fill", (c) => action(c, BrowserFillInput, "fill", (input) => executor.fill(c.req.param("id"), input)));
app.post("/v1/sessions/:id/snapshot", async (c) => c.json(await executor.snapshot(c.req.param("id"))));
app.post("/v1/sessions/:id/screenshot", (c) => action(c, BrowserScreenshotInput, "screenshot", (input) => executor.screenshot(c.req.param("id"), input)));
app.post("/v1/sessions/:id/takeover/request", (c) => action(c, BrowserTakeoverInput, "takeover.request", (input) => executor.requestTakeover(c.req.param("id"), input)));
app.post("/v1/sessions/:id/takeover/resume", (c) => action(c, BrowserResumeInput, "takeover.resume", (input) => executor.resumeAgent(c.req.param("id"), input)));
app.post("/v1/sessions/:id/external-action", (c) => action(c, BrowserExternalActionInput, "external-action", (input) => executor.externalAction(c.req.param("id"), input)));
app.post("/v1/sessions/:id/close", async (c) => c.json(await executor.closeSession(c.req.param("id"))));
app.onError((caught, c) => { log.error({ err: caught, requestId: c.get("requestId"), correlationId: c.get("correlationId") }, "unhandled error"); return c.json(err(HELM_ERROR_CODES.INTERNAL_ERROR, "Internal server error", true), 500); });

const server = serve({ fetch: app.fetch, port }, () => log.info({ port }, "helm-browser-worker listening"));
const wss = new WebSocketServer({ noServer: true });
server.on("upgrade", async (req, socket, head) => {
  try {
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? `127.0.0.1:${port}`}`);
    const m = url.pathname.match(/^\/v1\/sessions\/([^/]+)\/stream$/);
    if (!m) { socket.destroy(); return; }
    const auth = req.headers.authorization;
    if (auth !== `Bearer ${token}`) { socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n"); socket.destroy(); return; }
    const sessionId = decodeURIComponent(m[1] ?? "");
    const session = await executor.getSession(sessionId);
    if (!session) { socket.write("HTTP/1.1 404 Not Found\r\n\r\n"); socket.destroy(); return; }
    wss.handleUpgrade(req, socket, head, (ws) => {
      const send = (obj: unknown) => { if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(obj)); };
      send({ type: "session", session });
      const last = executor.getLastFrame(sessionId);
      if (last) send({ type: "frame", sessionId, data: last, ts: Date.now() });
      const unsub = executor.subscribe(sessionId, (frame) => send({ type: "frame", ...frame }));
      const ping = setInterval(() => send({ type: "ping", ts: Date.now() }), 15000);
      ws.on("message", async (raw) => {
        try {
          const msg = JSON.parse(String(raw));
          if (msg?.type === "input") {
            const result = await executor.sendInput(sessionId, msg.input ?? msg);
            send({ type: "input.result", ...result, ts: Date.now() });
          }
        } catch (e) { send({ type: "input.result", ok: false, error: e instanceof Error ? e.message : String(e) }); }
      });
      ws.on("close", () => { clearInterval(ping); unsub?.(); });
      ws.on("error", () => { clearInterval(ping); unsub?.(); });
    });
  } catch (e) { log.error({ err: e }, "ws upgrade failed"); socket.destroy(); }
});
