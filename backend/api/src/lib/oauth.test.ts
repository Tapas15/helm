import { describe, expect, it } from "vitest";
import { buildGoogleAuthUrl, buildPkce, isGoogleTokenExpired, sha256Base64Url } from "./oauth.js";

describe("oauth helpers", () => {
  it("buildPkce creates verifier/challenge", () => {
    const pkce = buildPkce();
    expect(pkce.method).toBe("S256");
    expect(pkce.challenge).toBe(sha256Base64Url(pkce.verifier));
  });
  it("buildGoogleAuthUrl includes required params", () => {
    const url = new URL(buildGoogleAuthUrl({ clientId: "cid", redirectUri: "http://localhost/cb", state: "s", codeChallenge: "c", scopes: ["a", "b"] }));
    expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(url.searchParams.get("client_id")).toBe("cid");
    expect(url.searchParams.get("scope")).toBe("a b");
    expect(url.searchParams.get("code_challenge")).toBe("c");
  });
  it("isGoogleTokenExpired respects skew", () => {
    const now = Date.now();
    expect(isGoogleTokenExpired({ obtained_at: now - 3600_000, expires_in: 3600 }, 60_000)).toBe(true);
    expect(isGoogleTokenExpired({ obtained_at: now, expires_in: 3600 }, 60_000)).toBe(false);
  });
});
