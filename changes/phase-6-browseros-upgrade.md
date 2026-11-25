# Phase 6 - BrowserOS Adapter Upgrade (Optional External Adapter)

**Status:** `[~]` 58%  
**Blueprint refs:** Phase 6, `06-Deterministic-Browser-and-Computer-Execution.md`

## Goal
Improve browser execution with optional external BrowserOS adapter behind Helm `BrowserExecutor`/adapter contract, while keeping Playwright default fallback and Helm original.

## What we have done
- **Adapter boundary**: `backend/api/src/lib/browser-adapter.ts` implements `BrowserOSAdapter`/`PlaywrightBrowserAdapter`, `BrowserOSAdapterStub`, `BrowserOSHttpAdapter` (`BROWSEROS_BASE_URL`/`BROWSEROS_TOKEN`), and `BrowserOSMcpAdapter` (`BROWSEROS_MCP_URL`, streamable HTTP MCP `/mcp`) via `browseros-mcp-client.ts`/`browseros-mcp-executor.ts`.
- **Safe default/fallback**: Playwright remains default behavior; no BrowserOS/Obscura/Hermes code copied; BrowserOS runs as external runtime only (user confirmed `external-adapter OK`).
- **API/dispatch hooks**: `GET /v1/browser/adapter/status`; `GET /v1/browser/adapters/browseros/capabilities`; `HELM_BROWSER_ADAPTER_DISPATCH` flag; adapter-aware browser routes/session lookup; request/requestBinary dispatch supported.
- **Hardening**: MCP timeout `BROWSEROS_MCP_TIMEOUT_MS` (default 30s); capability detection via `tools/list` (required `tabs,navigate,snapshot,screenshot`); structured error classification `BROWSEROS_TIMEOUT/UNAVAILABLE/CAPABILITY_MISSING/SELECTOR_NOT_FOUND`; click/fill use `evaluate_in_page` returning `selector_not_found|ok` for reliable selector detection (`0616ad1`, local unpushed).
- **Verification**: `backend/api/src/lib/browser-adapter.test.ts` PASS (12/12). Env-gated smoke `HELM_BROWSEROS_MCP_SMOKE=1 BROWSEROS_MCP_URL=http://127.0.0.1:9210/mcp BROWSEROS_MCP_SMOKE_URL=https://example.com BROWSEROS_MCP_TIMEOUT_MS=45000` PASS (3/3): capabilities + create/navigate/snapshot/close, structured unknown-session error, click/fill selector-not-found structured error; screenshot best-effort (timeout classified retryable).
- **Commits**: pushed `e5391c1`,`a91885a`,`9dc78e6`,`4bfc19c`,`69361b3`,`4f2047e`,`e36e4f3`,`03c0095`,`505736f`,`5631007`,`2fb891a`,`b02e541`,`3a8073c`; local unpushed `0616ad1`.

## IP/License Guardrail
- [x] No BrowserOS/Obscura/Hermes source code copying.
- [x] External adapter isolated behind contract; no AGPL/copyleft code vendored into Helm.
- [ ] ADR + compliance review before real external runtime integration enabled by default.

## Checklist

### Completed
- [x] Adapter boundary: `backend/api/src/lib/browser-adapter.ts` (`BrowserOSAdapter`, `PlaywrightBrowserAdapter`, `BrowserOSAdapterStub`, `createBrowserAdapter`, `BrowserOSHttpAdapter` when `BROWSER_ADAPTER=browseros` and `BROWSEROS_BASE_URL`/`BROWSEROS_TOKEN` set).
- [x] Default Playwright behavior unchanged.
- [x] Adapter status endpoint: `GET /v1/browser/adapter/status`.
- [x] `HELM_BROWSER_ADAPTER_DISPATCH` flag; adapter-aware browser routes/session lookup.
- [x] Request/requestBinary dispatch supported.
- [x] Contract tests: `backend/api/src/lib/browser-adapter.test.ts` PASS (6/6).

### Remaining / Blocked
- [x] External runtime decision: BrowserOS neo MCP endpoint `http://127.0.0.1:9210/mcp` probed; AGPL external-runtime-only boundary confirmed by user (`external-adapter OK`).
- [~] MCP adapter scaffold integrated behind contract; capability/report + timeout/error classification added; env-gated smoke PASS (3/3: capabilities/create/navigate/snapshot/close, unknown-session structured error, click/fill selector-not-found structured error; screenshot best-effort). Still needed: positive click/fill success on controlled selector, takeover semantics, artifact/error parity depth, security review.
- [ ] Security/compliance review for external adapter isolation (process boundary, auth, data handling).
- [~] Capability detection/report added (`tools/list` required-tool check, `/v1/capabilities` adapter path) with deterministic contract tests for missing capabilities/timeout mapping; automatic fallback/dispatch policy still explicit-only (no silent default switch).
- [x] Push `0616ad1` and verify GitHub Actions CI green (CI [45540317436](https://github.com/Tapas15/helm/actions/runs/45540317436) green on `c2989db`).
- [ ] Wire adapter dispatch by default only after parity.
- [ ] Performance benchmarking vs Playwright baseline.

## Evidence
- `backend/api/src/lib/browser-adapter.test.ts` PASS (12/12).
- `backend/api/src/routes/browseros-mcp-smoke.test.ts` PASS (3/3) with `HELM_BROWSEROS_MCP_SMOKE=1 BROWSEROS_MCP_URL=http://127.0.0.1:9210/mcp BROWSEROS_MCP_SMOKE_URL=https://example.com BROWSEROS_MCP_TIMEOUT_MS=45000` (screenshot best-effort timeout observed).
- `pnpm -C backend/api exec tsc -p tsconfig.json --noEmit` PASS.
- CI: [45540317436](https://github.com/Tapas15/helm/actions/runs/45540317436) green (`c2989db`, main).
- Commits: pushed through `c2989db` (includes `0616ad1` selector hardening + docs sync).
