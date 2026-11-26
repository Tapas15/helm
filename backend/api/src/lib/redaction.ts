export const SENSITIVE_KEYS = new Set([
  "authorization", "cookie", "set-cookie", "password", "passwd", "secret", "token",
  "accesstoken", "refreshtoken", "apikey", "credential", "credentials", "privatekey",
  "clientsecret", "sessiontoken", "vaultkey", "encryptedvalue", "pkceverifier", "pkceverifierencrypted",
]);

export function redactSensitive(value: unknown, keyHint = ""): unknown {
  const lower = keyHint.toLowerCase();
  if (SENSITIVE_KEYS.has(lower)) return "[REDACTED]";
  if (lower.includes("path") && typeof value === "string" && (/^[/\\]/.test(value) || /^[A-Za-z]:[\\/]/.test(value))) return "[REDACTED_PATH]";
  if (typeof value === "string" && (/^[/\\]/.test(value) || /^[A-Za-z]:[\\/]/.test(value))) {
    if (lower.includes("path") || lower.includes("dir") || lower.includes("file") || /[/\\]/.test(value)) return "[REDACTED_PATH]";
  }
  if (Array.isArray(value)) return value.map((v) => redactSensitive(v));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, redactSensitive(v, k)]));
  return value;
}
