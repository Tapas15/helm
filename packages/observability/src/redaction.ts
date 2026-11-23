export const REDACT_PATHS = [
  "req.headers.authorization",
  "req.headers.cookie",
  "request.headers.authorization",
  "request.headers.cookie",
  "headers.authorization",
  "headers.cookie",
  "authorization",
  "cookie",
  "set-cookie",
  "password",
  "passwd",
  "secret",
  "token",
  "accessToken",
  "refreshToken",
  "apiKey",
  "apikey",
  "credential",
  "credentials",
  "privateKey",
  "clientSecret",
  "*.authorization",
  "*.cookie",
  "*.set-cookie",
  "*.password",
  "*.passwd",
  "*.secret",
  "*.token",
  "*.accessToken",
  "*.refreshToken",
  "*.apiKey",
  "*.apikey",
  "*.credential",
  "*.credentials",
  "*.privateKey",
  "*.clientSecret",
] as const;

export const REDACT_CENSOR = "[REDACTED]";

export function buildRedactConfig(): { paths: string[]; censor: string } {
  return { paths: [...REDACT_PATHS], censor: REDACT_CENSOR };
}