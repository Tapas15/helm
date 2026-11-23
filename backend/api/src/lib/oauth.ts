import { createHash, randomBytes } from "node:crypto";

export function sha256Base64Url(input: string): string {
  return createHash("sha256").update(input).digest("base64url");
}

export function randomBase64Url(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function buildPkce() {
  const verifier = randomBase64Url(48);
  const challenge = sha256Base64Url(verifier);
  return { verifier, challenge, method: "S256" as const };
}

export function buildGoogleAuthUrl(input: { clientId: string; redirectUri: string; state: string; codeChallenge: string; scopes: string[] }) {
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", input.clientId);
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("include_granted_scopes", "true");
  url.searchParams.set("scope", input.scopes.join(" "));
  url.searchParams.set("state", input.state);
  url.searchParams.set("code_challenge", input.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  return url.toString();
}

export type GoogleToken = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
  obtained_at?: number;
};

export function isGoogleTokenExpired(token: GoogleToken, skewMs = 60_000): boolean {
  const obtained = Number(token.obtained_at ?? 0);
  const expiresIn = Number(token.expires_in ?? 0);
  if (!obtained || !expiresIn) return false;
  return Date.now() + skewMs >= obtained + expiresIn * 1000;
}

export async function refreshGoogleAccessToken(input: { clientId: string; clientSecret: string; refreshToken: string }): Promise<GoogleToken> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: input.clientId,
      client_secret: input.clientSecret,
      refresh_token: input.refreshToken,
      grant_type: "refresh_token",
    }),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(json?.error_description ?? json?.error ?? `Google refresh failed (${res.status})`);
  return json as GoogleToken;
}
