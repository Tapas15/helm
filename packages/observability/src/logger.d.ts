import { type Logger, type LoggerOptions } from "pino";
import { type TraceFields } from "./context.js";
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
export declare function createLogger(options: CreateLoggerOptions): HelmLogger;
//# sourceMappingURL=logger.d.ts.map