# Phase 6 - BrowserOS Adapter Upgrade (Optional External Adapter)

**Status:** `[~]` 60%  
**Blueprint refs:** Phase 6, `06-Deterministic-Browser-and-Computer-Execution.md`

## Goal
Improve browser execution with optional external BrowserOS adapter behind Helm `BrowserExecutor`/adapter contract, while keeping Playwright default fallback and Helm original.

## What we have done
- **Adapter boundary**: `backend/api/src/lib/browser-adapter.ts` implements `BrowserOSAdapter`/`PlaywrightBrowserAdapter`, `BrowserOSAdapterStub`, `BrowserOSHttpAdapter` (`BROWSEROS_BASE_URL`/`BROWSEROS_TOKEN`), and `BrowserOSMcpAdapter` (`BROWSEROS_MCP_URL`, streamable HTTP MCP `/mcp`) via `browseros-mcp-client.ts`/`browseros-mcp-executor.ts`.
- **Safe default/fallback**: Playwright remains default behavior; no BrowserOS/Obscura/Hermes code copied; BrowserOS runs as external runtime only (user confirmed `external-adapter OK`).
- **API/dispatch hooks**: `GET /v1/browser/adapter/status`; `GET /v1/browser/adapters/browseros/capabilities`; `HELM_BROWSER_ADAPTER_DISPATCH` flag; adapter-aware browser routes/session lookup; request/requestBinary dispatch supported.
- **Hardening**: MCP timeout `BROWSEROS_MCP_TIMEOUT_MS` (default 30s); capability detection via `tools/list` (required `tabs,navigate,snapshot,screenshot`); structured error classification `BROWSEROS_TIMEOUT/UNAVAILABLE/CAPABILITY_MISSING/SELECTOR_NOT_FOUND`; click/fill use `evaluate_in_page` returning `selector_not_found|ok` for reliable selector detection (`0616ad1`).
- **Verification**: `backend/api/src/lib/browser-adapter.test.ts` PASS (12/12). Env-gated smoke `HELM_BROWSEROS_MCP_SMOKE=1 BROWSEROS_MCP_URL=http://127.0.0.1:9210/mcp BROWSEROS_MCP_SMOKE_URL=https://example.com BROWSEROS_MCP_TIMEOUT_MS=45000` PASS (5/5, 2026-11-25): capabilities + create/navigate/snapshot/close, structured unknown-session error, click/fill selector-not-found structured error, **positive click/fill success on controlled local page (no external side effects)**, **adapter-level takeover request/resume/stream-status parity**; screenshot best-effort (timeout classified retryable).
- **Commits**: pushed through `098bebe` on `main`; CI [45541052283](https://github.com/Tapas15/helm/actions/runs/45541052283) green for `098bebe`.

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
- [~] MCP adapter scaffold integrated behind contract; capability/report + timeout/error classification added; env-gated smoke PASS (5/5, 2026-11-25): capabilities/create/navigate/snapshot/close, unknown-session structured error, click/fill selector-not-found structured error, **positive click/fill success on controlled local page**, **adapter-level takeover request/resume/stream-status parity**; screenshot best-effort. Still needed: deeper artifact/error parity, BrowserOS-vs-Playwright takeover semantics under real browser control, security review.
- [ ] Security/compliance review for external adapter isolation (process boundary, auth, data handling).
- [~] Capability detection/report added (`tools/list` required-tool check, `/v1/capabilities` adapter path) with deterministic contract tests for missing capabilities/timeout mapping; automatic fallback/dispatch policy still explicit-only (no silent default switch).
- [x] Push `0616ad1` and verify GitHub Actions CI green (CI [45541052283](https://github.com/Tapas15/helm/actions/runs/45541052283) green on `098bebe`).
- [ ] Define explicit fallback/dispatch policy: Playwright default, BrowserOS opt-in only via explicit env/config; no silent runtime switch; dispatch by default only after parity+security evidence.
- [ ] Performance benchmarking vs Playwright baseline.

## Evidence
- `backend/api/src/lib/browser-adapter.test.ts` PASS (12/12).
- `backend/api/src/routes/browseros-mcp-smoke.test.ts` PASS (5/5, 2026-11-25) with `HELM_BROWSEROS_MCP_SMOKE=1 BROWSEROS_MCP_URL=http://127.0.0.1:9210/mcp BROWSEROS_MCP_SMOKE_URL=https://example.com BROWSEROS_MCP_TIMEOUT_MS=45000`: capabilities/create/navigate/snapshot/close; unknown-session structured error; click/fill selector-not-found structured error; positive click/fill on controlled local page (no external side effects); adapter-level takeover request/resume/stream-status parity. Screenshot best-effort (timeout classified retryable).
- `pnpm -C backend/api exec tsc -p tsconfig.json --noEmit` PASS.
- CI: [45541052283](https://github.com/Tapas15/helm/actions/runs/45541052283) green (`098bebe`, main).
- Commits: pushed through `098bebe` on `main`.

## Dispatch / Fallback Policy (explicit, no silent switch)
- **Default**: `BROWSER_ADAPTER=playwright` / dispatch off by default behavior remains Playwright.
- **Opt-in**: BrowserOS MCP only when explicitly configured (`BROWSEROS_MCP_URL`, and/or explicit adapter/dispatch env per route integration). No automatic runtime fallback from Playwright to BrowserOS or vice versa for a failing action.
- **Error surfacing**: Adapter errors must be structured (`code/message/retryable`); caller/route decides retry based on policy, never blind retry of uncertain external writes.
- **Parity gate before default dispatch**: require positive action parity, takeover/artifact/error parity, security review, and CI/env-gated evidence. Keep `HELM_BROWSER_ADAPTER_DISPATCH` explicit until gate passes.
