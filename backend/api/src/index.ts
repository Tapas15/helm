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
import { authMiddleware } from "./middleware/auth.js";
import { requestContextMiddleware } from "./middleware/requestContext.js";
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

app.use("/v1/*", authMiddleware);
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

async function main() {
  await ensureDevUser(db, log);
  const server = serve({ fetch: app.fetch, port }, () => log.info({ port }, "helm-api listening"));
  const wss = new WebSocketServer({ noServer: true });
  server.on("upgrade", (req, socket, head) => {
    try {
      const url = new URL(req.url ?? "/", `http://${req.headers.host ?? `127.0.0.1:${port}`}`);
      const m = url.pathname.match(/^\/v1\/browser\/sessions\/([^/]+)\/stream$/);
      if (!m) { socket.destroy(); return; }
      const userId = url.searchParams.get("userId") ?? "usr_local_dev"; // dev auth parity; real auth pending
      if (!userId) { socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n"); socket.destroy(); return; }
      const sessionId = decodeURIComponent(m[1] ?? "");
      const upstreamUrl = browserUrl.replace(/^http/, "ws") + `/v1/sessions/${encodeURIComponent(sessionId)}/stream`;
      wss.handleUpgrade(req, socket, head, (client) => {
        const upstream = new WebSocket(upstreamUrl, { headers: { authorization: `Bearer ${browserToken}` } });
        upstream.on("message", (data) => { if (client.readyState === client.OPEN) client.send(data.toString()); });
        upstream.on("close", () => { if (client.readyState === client.OPEN) client.close(); });
        upstream.on("error", () => { if (client.readyState === client.OPEN) client.close(); });
        client.on("close", () => { if (upstream.readyState === upstream.OPEN || upstream.readyState === upstream.CONNECTING) upstream.close(); });
        client.on("error", () => { if (upstream.readyState === upstream.OPEN || upstream.readyState === upstream.CONNECTING) upstream.close(); });
      });
    } catch (e) {
      log.error({ err: e }, "browser ws proxy failed");
      socket.destroy();
    }
  });
  const shutdown = async () => { log.info({ signal: "shutdown" }, "shutting down"); server.close(); await pool.end(); process.exit(0); };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}
void main().catch(async (err) => { log.error({ err }, "helm-api failed to start"); await pool.end().catch(() => undefined); process.exit(1); });

