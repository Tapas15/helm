export const SENSITIVE_KEYS = new Set([
  "authorization", "cookie", "set-cookie", "password", "passwd", "secret", "token",
  "accesstoken", "refreshtoken", "apikey", "credential", "credentials", "privatekey",
  "clientsecret", "sessiontoken", "vaultkey", "encryptedvalue", "pkceverifier", "pkceverifierencrypted",
]);

export function redactSensitive(value: unknown, keyHint = "", seen = new WeakSet<object>()): unknown {
  const lower = keyHint.toLowerCase();
  if (SENSITIVE_KEYS.has(lower)) return "[REDACTED]";
  if (lower.includes("path") && typeof value === "string" && (/^[/\\]/.test(value) || /^[A-Za-z]:[\\/]/.test(value))) return "[REDACTED_PATH]";
  if (typeof value === "string" && (/^[/\\]/.test(value) || /^[A-Za-z]:[\\/]/.test(value))) {
    if (lower.includes("path") || lower.includes("dir") || lower.includes("file") || /[/\\]/.test(value)) return "[REDACTED_PATH]";
  }
  if (Array.isArray(value)) {
    if (seen.has(value)) return "[REDACTED_CYCLE]";
    seen.add(value);
    return value.map((v) => redactSensitive(v, "", seen));
  }
  if (value && typeof value === "object") {
    if (seen.has(value)) return "[REDACTED_CYCLE]";
    seen.add(value);
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, redactSensitive(v, k, seen)]));
  }
  return value;
}
