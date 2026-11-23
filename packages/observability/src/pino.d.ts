declare module "pino" {
  export interface LoggerOptions {
    name?: string;
    level?: string;
    base?: Record<string, unknown> | null;
    redact?: string[] | { paths: string[]; censor?: string };
    transport?: unknown;
  }
  export interface Logger {
    debug: (obj: Record<string, unknown>, msg?: string) => void;
    info: (obj: Record<string, unknown>, msg?: string) => void;
    warn: (obj: Record<string, unknown>, msg?: string) => void;
    error: (obj: Record<string, unknown>, msg?: string) => void;
    child: (bindings: Record<string, unknown>) => Logger;
  }
  function pino(options?: LoggerOptions): Logger;
  export default pino;
}