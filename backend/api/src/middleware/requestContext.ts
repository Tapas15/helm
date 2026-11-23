import type { MiddlewareHandler } from "hono";
import { TRACE_HEADER, ensureTraceFields } from "@helm/observability";
import { requestLogger } from "../lib/logger.js";
import type { AppEnv } from "../types.js";

export const requestContextMiddleware: MiddlewareHandler<AppEnv> = async (c, next) => {
  const trace = ensureTraceFields(
    {
      requestId: c.req.header(TRACE_HEADER.requestId) ?? undefined,
      correlationId: c.req.header(TRACE_HEADER.correlationId) ?? undefined,
      causationId: c.req.header(TRACE_HEADER.causationId) ?? undefined,
    },
    () => crypto.randomUUID(),
  );

  c.set("requestId", trace.requestId);
  c.set("correlationId", trace.correlationId);
  c.set("causationId", trace.causationId);
  c.set("logger", requestLogger(trace.requestId, trace.correlationId));

  c.header(TRACE_HEADER.requestId, trace.requestId);
  c.header(TRACE_HEADER.correlationId, trace.correlationId);

  const start = Date.now();
  try {
    await next();
  } finally {
    c.get("logger").info(
      {
        method: c.req.method,
        path: c.req.path,
        status: c.res.status,
        ms: Date.now() - start,
      },
      "request",
    );
  }
};