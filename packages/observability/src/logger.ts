import pino, { type Logger, type LoggerOptions } from "pino";
import { buildRedactConfig } from "./redaction.js";
import { pickTraceFields, type TraceFields } from "./context.js";

export interface CreateLoggerOptions {
  name: string;
  level?: string;
  base?: Record<string, unknown>;
  transport?: LoggerOptions["transport"];
}

export interface HelmLogger {
  debug: (obj: Record<string, unknown>, msg?: string) => void;
  info: (obj: Record<string, unknown>, msg?: string) => void;
  warn: (obj: Record<string, unknown>, msg?: string) => void;
  error: (obj: Record<string, unknown>, msg?: string) => void;
  child: (bindings: TraceFields & Record<string, unknown>) => HelmLogger;
  raw: Logger;
}

function wrap(logger: Logger): HelmLogger {
  return {
    debug: (obj, msg) => logger.debug(obj, msg),
    info: (obj, msg) => logger.info(obj, msg),
    warn: (obj, msg) => logger.warn(obj, msg),
    error: (obj, msg) => logger.error(obj, msg),
    child: (bindings) => wrap(logger.child({ ...pickTraceFields(bindings), ...bindings })),
    raw: logger,
  };
}

function envLevel(): string | undefined {
  const p = (globalThis as unknown as { process?: { env?: Record<string, string | undefined> } }).process;
  return p?.env?.LOG_LEVEL;
}

export function createLogger(options: CreateLoggerOptions): HelmLogger {
  const logger = pino({
    name: options.name,
    level: options.level ?? envLevel() ?? "info",
    base: options.base,
    redact: buildRedactConfig(),
    transport: options.transport,
  });
  return wrap(logger);
}