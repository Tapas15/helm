import "dotenv/config";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { WebSocketServer, WebSocket } from "ws";
import { createDb } from "@helm/db";
import { HELM_ERROR_CODES, helmErrorToApiError, toHelmError } from "@helm/shared";
import { logger as log } from "./lib/logger.js";
import { ensureDevUser } from "./lib/bootstrap.js";
import { taskRoutes } from "./routes/tasks.js";
import { eventRoutes } from "./routes/events.js";
import { approvalRoutes } from "./routes/approvals.js";
import { browserRoutes } from "./routes/browser.js";
import { artifactRoutes, receiptRoutes } from "./routes/evidence.js";
import { authRoutes } from "./routes/auth.js";
import { connectorRoutes } from "./routes/connectors.js";
import { connectorAccountRoutes } from "./routes/connector-accounts.js";
import { gmailRoutes } from "./routes/gmail.js";
import { calendarRoutes } from "./routes/calendar.js";
import { memoryRoutes } from "./routes/memory.js";
import { skillsRoutes } from "./routes/skills.js";
import { proactivityRoutes } from "./routes/proactivity.js";
import { identityRoutes } from "./routes/identity.js";
import { reconciliationRoutes } from "./routes/reconciliation.js";
import { authMiddleware } from "./middleware/auth.js";
import { requestContextMiddleware } from "./middleware/requestContext.js";
import { resolveAuth } from "./lib/auth.js";
import { reconcileUncertainReceipts } from "./lib/reconciliation.js";
import type { AppEnv } from "./types.js";

const port = Number(process.env.PORT ?? 8787);
const dbUrl = process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/helm";
const browserUrl = process.env.BROWSER_WORKER_URL ?? "http://127.0.0.1:8790";
const browserToken = process.env.BROWSER_WORKER_TOKEN ?? "dev-browser-token";
const { db, pool } = createDb(dbUrl);

const app = new Hono<AppEnv>();
app.use("*", cors());
app.use("*", requestContextMiddleware);

app.get("/health", (c) => c.json({ ok: true, service: "helm-api", ts: new Date().toISOString() }));

app.use("/v1/*", authMiddleware(db));
app.route("/v1/auth", authRoutes(db));
app.route("/v1/connectors", connectorRoutes(db));
app.route("/v1/connectors/accounts", connectorAccountRoutes(db));
app.route("/v1/connectors/gmail", gmailRoutes(db));
app.route("/v1/connectors/calendar", calendarRoutes(db));
app.route("/v1/identity", identityRoutes(db));
app.route("/v1/memory", memoryRoutes(db));
app.route("/v1/skills", skillsRoutes(db));
app.route("/v1/proactivity", proactivityRoutes(db));
app.route("/v1/reconciliation", reconciliationRoutes(db));
app.route("/v1/tasks", taskRoutes(db));
app.route("/v1/events", eventRoutes(db));
app.route("/v1/approvals", approvalRoutes(db));
app.route("/v1/browser", browserRoutes(db));
app.route("/v1/artifacts", artifactRoutes(db));
app.route("/v1/receipts", receiptRoutes(db));

app.onError((err, c) => {
  const helmError = toHelmError(err, {
    code: HELM_ERROR_CODES.INTERNAL_ERROR, message: "Internal server error", retryable: true,
    traceId: c.get("requestId"), correlationId: c.get("correlationId"),
  });
  const l = c.get("logger") ?? log;
  l.error({ err: helmError.toJSON(), requestId: c.get("requestId"), correlationId: c.get("correlationId"), userId: c.get("userId") }, "unhandled error");
  return c.json(helmErrorToApiError(helmError.toJSON()), 500);
});

let reconcileTimer: ReturnType<typeof setInterval> | null = null;
async function main() {
  await ensureDevUser(db, log);
  if (process.env.HELM_RECONCILIATION_ENABLED === "1") {
    const intervalMs = Math.max(Number(process.env.HELM_RECONCILIATION_INTERVAL_MS ?? 60_000), 10_000);
    const olderThanMs = Math.max(Number(process.env.HELM_RECONCILIATION_OLDER_THAN_MS ?? 60_000), 0);
    const limit = Math.min(Math.max(Number(process.env.HELM_RECONCILIATION_LIMIT ?? 20), 1), 100);
    const tick = async () => {
      try { const r = await reconcileUncertainReceipts(db, { olderThanMs, limit }); if (r.scanned > 0) log.info({ reconciliation: r }, "reconciliation tick"); }
      catch (err) { log.warn({ err }, "reconciliation tick failed"); }
    };
    reconcileTimer = setInterval(() => { void tick(); }, intervalMs);
    void tick();
    log.info({ intervalMs, olderThanMs, limit }, "reconciliation scheduler enabled");
  }
  const server = serve({ fetch: app.fetch, port }, () => log.info({ port }, "helm-api listening"));
  const wss = new WebSocketServer({ noServer: true });
  server.on("upgrade", (req, socket, head) => {
    try {
      const url = new URL(req.url ?? "/", `http://${req.headers.host ?? `127.0.0.1:${port}`}`);
      const m = url.pathname.match(/^\/v1\/browser\/sessions\/([^/]+)\/stream$/);
      if (!m) { socket.destroy(); return; }
      void (async () => {
        const token = url.searchParams.get("token");
        const resolved = await resolveAuth(db, { authorization: req.headers.authorization, xUserId: Array.isArray(req.headers["x-user-id"]) ? req.headers["x-user-id"][0] : req.headers["x-user-id"], token });
        if (!resolved.ok) { socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n"); socket.destroy(); return; }
        const userId = resolved.userId;
        const sessionId = decodeURIComponent(m[1] ?? "");
        const sessionRes = await fetch(`${browserUrl}/v1/sessions/${encodeURIComponent(sessionId)}`, { headers: { authorization: `Bearer ${browserToken}` } });
        if (!sessionRes.ok) { socket.write("HTTP/1.1 404 Not Found\r\n\r\n"); socket.destroy(); return; }
        const sessionJson = await sessionRes.json().catch(() => null);
        const taskId = sessionJson?.session?.taskId;
        if (taskId) {
          const [task] = await db.select({ id: (await import("@helm/db")).tasks.id }).from((await import("@helm/db")).tasks).where((await import("drizzle-orm")).and((await import("drizzle-orm")).eq((await import("@helm/db")).tasks.id, taskId), (await import("drizzle-orm")).eq((await import("@helm/db")).tasks.userId, userId))).limit(1);
          if (!task) { socket.write("HTTP/1.1 403 Forbidden\r\n\r\n"); socket.destroy(); return; }
        } else {
          socket.write("HTTP/1.1 403 Forbidden\r\n\r\n"); socket.destroy(); return;
        }
        const upstreamUrl = browserUrl.replace(/^http/, "ws") + `/v1/sessions/${encodeURIComponent(sessionId)}/stream`;
        wss.handleUpgrade(req, socket, head, (client) => {
          const upstream = new WebSocket(upstreamUrl, { headers: { authorization: `Bearer ${browserToken}` } });
          upstream.on("message", (data) => { if (client.readyState === client.OPEN) client.send(data.toString()); });
          upstream.on("close", () => { if (client.readyState === client.OPEN) client.close(); });
          upstream.on("error", () => { if (client.readyState === client.OPEN) client.close(); });
          client.on("close", () => { if (upstream.readyState === upstream.OPEN || upstream.readyState === upstream.CONNECTING) upstream.close(); });
          client.on("error", () => { if (upstream.readyState === upstream.OPEN || upstream.readyState === upstream.CONNECTING) upstream.close(); });
        });
      })().catch((e) => { log.error({ err: e }, "browser ws proxy failed"); socket.destroy(); });
      return;
    } catch (e) {
      log.error({ err: e }, "browser ws proxy failed");
      socket.destroy();
    }
  });
  const shutdown = async () => { log.info({ signal: "shutdown" }, "shutting down"); if (reconcileTimer) clearInterval(reconcileTimer); server.close(); await pool.end(); process.exit(0); };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}
void main().catch(async (err) => { log.error({ err }, "helm-api failed to start"); await pool.end().catch(() => undefined); process.exit(1); });

