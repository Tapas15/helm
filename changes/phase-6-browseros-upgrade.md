# Phase 6 - BrowserOS Adapter Upgrade (Optional External Adapter)

**Status:** `[~]` 52%  
**Blueprint refs:** Phase 6, `06-Deterministic-Browser-and-Computer-Execution.md`

## Goal
Improve browser execution with optional external BrowserOS adapter behind Helm `BrowserExecutor`/adapter contract, while keeping Playwright default fallback and Helm original.

## What we have done
- **Adapter boundary**: `backend/api/src/lib/browser-adapter.ts` implements `BrowserOSAdapter`/`PlaywrightBrowserAdapter`, `BrowserOSAdapterStub`, `BrowserOSHttpAdapter` (`BROWSEROS_BASE_URL`/`BROWSEROS_TOKEN`), and `BrowserOSMcpAdapter` (`BROWSEROS_MCP_URL`, streamable HTTP MCP `/mcp`) via `browseros-mcp-client.ts`/`browseros-mcp-executor.ts`.
- **Safe default/fallback**: Playwright remains default behavior; no BrowserOS/Obscura/Hermes code copied; BrowserOS runs as external runtime only (user confirmed `external-adapter OK`).
- **API/dispatch hooks**: `GET /v1/browser/adapter/status`; `HELM_BROWSER_ADAPTER_DISPATCH` flag; adapter-aware browser routes/session lookup; request/requestBinary dispatch supported.
- **Verification**: `backend/api/src/lib/browser-adapter.test.ts` PASS (11/11). Env-gated smoke `HELM_BROWSEROS_MCP_SMOKE=1 BROWSEROS_MCP_URL=http://127.0.0.1:9210/mcp BROWSEROS_MCP_SMOKE_URL=https://example.com BROWSEROS_MCP_TIMEOUT_MS=45000` PASS (1/1): create session, snapshot required, screenshot best-effort (timeout classified `BROWSEROS_TIMEOUT` retryable), close.
- **Commits**: `e5391c1`,`a91885a`,`9dc78e6`,`4bfc19c`,`69361b3` recorded in state history.

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
- [~] MCP adapter scaffold integrated behind contract; capability detection + timeout/error classification added; env-gated smoke PASS (snapshot required, screenshot best-effort). Full parity still needed: click/fill/selector semantics, takeover, artifacts, errors, security, session semantics against Playwright contract.
- [ ] Security/compliance review for external adapter isolation (process boundary, auth, data handling).
- [~] Capability detection added (`tools/list` required-tool check) with deterministic contract tests for missing capabilities/timeout mapping; automatic fallback/dispatch policy still explicit-only (no silent default switch).
- [ ] Wire adapter dispatch by default only after parity.
- [ ] Performance benchmarking vs Playwright baseline.

## Evidence
- `backend/api/src/lib/browser-adapter.test.ts` PASS (11/11).
- `backend/api/src/routes/browseros-mcp-smoke.test.ts` PASS (1/1) with `HELM_BROWSEROS_MCP_SMOKE=1 BROWSEROS_MCP_URL=http://127.0.0.1:9210/mcp BROWSEROS_MCP_SMOKE_URL=https://example.com BROWSEROS_MCP_TIMEOUT_MS=45000` (screenshot best-effort timeout observed).
- `pnpm -C backend/api exec tsc -p tsconfig.json --noEmit` PASS.
- Commits: `e5391c1`,`a91885a`,`9dc78e6`,`4bfc19c`,`69361b3` (prior); this slice pending commit.
