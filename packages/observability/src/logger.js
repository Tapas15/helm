import pino from "pino";
import { buildRedactConfig } from "./redaction.js";
import { pickTraceFields } from "./context.js";
function wrap(logger) {
    return {
        debug: (obj, msg) => logger.debug(obj, msg),
        info: (obj, msg) => logger.info(obj, msg),
        warn: (obj, msg) => logger.warn(obj, msg),
        error: (obj, msg) => logger.error(obj, msg),
        child: (bindings) => wrap(logger.child({ ...pickTraceFields(bindings), ...bindings })),
        raw: logger,
    };
}
function envLevel() {
    const p = globalThis.process;
    return p?.env?.LOG_LEVEL;
}
export function createLogger(options) {
    const logger = pino({
        name: options.name,
        level: options.level ?? envLevel() ?? "info",
        base: options.base,
        redact: buildRedactConfig(),
        transport: options.transport,
    });
    return wrap(logger);
}
//# sourceMappingURL=logger.js.map