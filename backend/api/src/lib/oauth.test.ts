import { afterEach, describe, expect, it, vi } from "vitest";
import { buildGoogleAuthUrl, buildPkce, isGoogleTokenExpired, refreshGoogleAccessToken, sha256Base64Url } from "./oauth.js";

afterEach(() => { vi.restoreAllMocks(); });

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
    expect(isGoogleTokenExpired({})).toBe(false);
  });

  it("refreshGoogleAccessToken posts refresh grant and returns token", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ access_token: "new", expires_in: 3600, token_type: "Bearer" }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    const tok = await refreshGoogleAccessToken({ clientId: "cid", clientSecret: "sec", refreshToken: "rt" });
    expect(tok.access_token).toBe("new");
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as any;
    expect(String(url)).toContain("oauth2.googleapis.com/token");
    expect(String((init.body as URLSearchParams).get("grant_type"))).toBe("refresh_token");
  });

  it("refreshGoogleAccessToken throws redacted-friendly error on failure", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "invalid_grant", error_description: "bad refresh" }), { status: 400, headers: { "content-type": "application/json" } })));
    await expect(refreshGoogleAccessToken({ clientId: "cid", clientSecret: "sec", refreshToken: "rt" })).rejects.toThrow(/bad refresh|invalid_grant/);
  });
});
