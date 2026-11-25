# Phase 6 - BrowserOS Adapter Upgrade (Optional External Adapter)

**Status:** `[~]` 60%  
**Blueprint refs:** Phase 6, `06-Deterministic-Browser-and-Computer-Execution.md`

## Goal
Improve browser execution with optional external BrowserOS adapter behind Helm `BrowserExecutor`/adapter contract, while keeping Playwright default fallback and Helm original.

## What we have done
- **Adapter boundary**: `backend/api/src/lib/browser-adapter.ts` implements `BrowserOSAdapter`/`PlaywrightBrowserAdapter`, `BrowserOSAdapterStub`, `BrowserOSHttpAdapter` (`BROWSEROS_BASE_URL`/`BROWSEROS_TOKEN`), and `BrowserOSMcpAdapter` (`BROWSEROS_MCP_URL`, streamable HTTP MCP `/mcp`) via `browseros-mcp-client.ts`/`browseros-mcp-executor.ts`.
- **Safe default/fallback**: Playwright remains default behavior; no BrowserOS/Obscura/Hermes code copied; BrowserOS runs as external runtime only (user confirmed `external-adapter OK`).
- **API/dispatch hooks**: `GET /v1/browser/adapter/status`; `GET /v1/browser/adapters/browseros/capabilities`; `HELM_BROWSER_ADAPTER_DISPATCH` flag; adapter-aware browser routes/session lookup; request/requestBinary dispatch supported.
- **Hardening**: MCP timeout `BROWSEROS_MCP_TIMEOUT_MS` (default 30s); capability detection via `tools/list` (required `tabs,navigate,snapshot,screenshot`); structured error classification `BROWSEROS_TIMEOUT/UNAVAILABLE/CAPABILITY_MISSING/SELECTOR_NOT_FOUND`; click/fill use `evaluate_in_page` returning `selector_not_found|ok` for reliable selector detection (`0616ad1`); adapter endpoint URL validation (http/https only) + explicit partial-config stub errors (`dab1583`); non-loopback BrowserOS endpoint rejected by default unless `HELM_BROWSEROS_ALLOW_REMOTE=1` (`7c77161`).
- **Verification**: `backend/api/src/lib/browser-adapter.test.ts` PASS (17/17). Env-gated smoke `HELM_BROWSEROS_MCP_SMOKE=1 BROWSEROS_MCP_URL=http://127.0.0.1:9210/mcp BROWSEROS_MCP_SMOKE_URL=https://example.com BROWSEROS_MCP_TIMEOUT_MS=45000` PASS (5/5, 2026-11-25): capabilities + create/navigate/snapshot/close, structured unknown-session error, click/fill selector-not-found structured error, **positive click/fill success on controlled local page (no external side effects)**, **adapter-level takeover request/resume/stream-status parity**; screenshot best-effort (timeout classified retryable).
- **Commits**: pushed through `dbd59ef` on `main`; latest CI [45561356201](https://github.com/Tapas15/helm/actions/runs/45561356201) green.

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
- [x] Contract tests: `backend/api/src/lib/browser-adapter.test.ts` PASS (17/17) including URL validation/remote-endpoint guard.

### Remaining / Blocked
- [x] External runtime decision: BrowserOS neo MCP endpoint `http://127.0.0.1:9210/mcp` probed; AGPL external-runtime-only boundary confirmed by user (`external-adapter OK`).
- [~] MCP adapter scaffold integrated behind contract; capability/report + timeout/error classification added; env-gated smoke PASS (6/6, 2026-11-25): capabilities/create/navigate/snapshot/close, unknown-session structured error, click/fill selector-not-found structured error, positive click/fill success on controlled local page, adapter-level takeover request/resume/stream-status parity, **perf/parity baseline on controlled local page** (capabilities 9ms, create 80ms, navigate 458ms, snapshot 40ms, fill 61ms, click 206ms, takeover req/resume 0/1ms, close 33ms). Screenshot best-effort. Still needed: deeper artifact/error parity, BrowserOS-vs-Playwright takeover semantics under real browser control.
- [~] Security/compliance review baseline recorded (2026-11-25): AGPL boundary/no copied code confirmed, Helm route authZ preserved, no adapter secret logging; **operator URL validation added** (http/https only, explicit config errors, partial base/token stub messages) and **non-loopback remote endpoint guard** (`HELM_BROWSEROS_ALLOW_REMOTE=1` opt-in). Remaining: deeper SSRF/private-network/operator policy, external-runtime credential handling, artifact/PII retention review, formal threat-model signoff.
- [~] Capability detection/report added (`tools/list` required-tool check, `/v1/capabilities` adapter path) with deterministic contract tests for missing capabilities/timeout mapping; automatic fallback/dispatch policy still explicit-only (no silent default switch).
- [x] Push and verify GitHub Actions CI green (latest: [45561356201](https://github.com/Tapas15/helm/actions/runs/45561356201), `dbd59ef`).
- [ ] Default dispatch only after parity+security signoff evidence.
- [x] Performance benchmarking vs Playwright baseline (env-gated, controlled local page, no external side effects, 2026-11-25). BrowserOS MCP 6/6 PASS: `{"capabilities":9,"create":80,"navigate":458,"snapshot":40,"fill":61,"click":206,"takeover_request":0,"takeover_resume":1,"close":33}` ms. Playwright 1/1 PASS: `{"create":6307,"navigate":572,"snapshot":500,"fill":332,"click":705,"takeover_request":81,"takeover_resume":60,"close":903}` ms. Comparison is baseline-only (different runtimes/adapters); do not use as default-dispatch justification.

## Evidence
- `backend/api/src/lib/browser-adapter.test.ts` PASS (19/19).
- `backend/api/src/routes/browseros-mcp-smoke.test.ts` PASS (6/6, 2026-11-25) with `HELM_BROWSEROS_MCP_SMOKE=1 BROWSEROS_MCP_URL=http://127.0.0.1:9210/mcp BROWSEROS_MCP_SMOKE_URL=https://example.com BROWSEROS_MCP_TIMEOUT_MS=45000`: capabilities/create/navigate/snapshot/close; unknown-session structured error; click/fill selector-not-found structured error; positive click/fill on controlled local page (no external side effects); adapter-level takeover request/resume/stream-status parity; perf/parity baseline. Screenshot best-effort (timeout classified retryable).
- `backend/browser-worker/src/playwright-perf-smoke.test.ts` PASS (1/1, 2026-11-25) with `HELM_PLAYWRIGHT_PERF_SMOKE=1`: controlled local page create/navigate/snapshot/fill/click/takeover-request/resume/close; artifact sha256 shape asserted.
- Perf baseline logs (2026-11-25, controlled local page, env-gated):
  - BrowserOS MCP: `{"capabilities":9,"create":80,"navigate":458,"snapshot":40,"fill":61,"click":206,"takeover_request":0,"takeover_resume":1,"close":33}` ms.
  - Playwright: `{"create":6307,"navigate":572,"snapshot":500,"fill":332,"click":705,"takeover_request":81,"takeover_resume":60,"close":903}` ms.
- `pnpm -C backend/api exec tsc -p tsconfig.json --noEmit` PASS.
- `pnpm -C backend/browser-worker exec tsc -p tsconfig.json --noEmit` PASS.
- CI: latest run recorded in `changes/CURRENT_STATE.md` after push.
- Commits: pushed on `main` (see git log / CURRENT_STATE).

## Security / Compliance Review (2026-11-25, code-audit baseline)

**Status:** baseline review recorded; not a full security signoff.

### Boundary / License
- [x] **No copied BrowserOS code** in Helm repo tracked source (`git ls-files '*browseros*'` only Helm adapter/client/executor/smoke/phase doc). BrowserOS runs as **external runtime** (user-confirmed `external-adapter OK`); AGPL boundary preserved by process/network contract.
- [x] **No vendored AGPL/copyleft artifacts** added by this adapter. Third-party notices refresh remains required on dependency changes (P8/legal).

### Process / Auth / Data handling
- [x] **Process isolation:** MCP adapter calls external BrowserOS MCP over configured URL (`BROWSEROS_MCP_URL`); legacy HTTP adapter uses `BROWSEROS_BASE_URL` + bearer `BROWSEROS_TOKEN`. No BrowserOS SDK embedded.
- [x] **Helm authZ boundary preserved at API routes:** `backend/api/src/routes/browser.ts` resolves owned session/task before proxying mutating/read actions; guarded actions still require approval/actionHash/idempotency. Adapter dispatch occurs only after route-level ownership checks.
- [x] **No secret logging in adapter code:** `browser-adapter.ts`, `browseros-mcp-client.ts`, `browseros-mcp-executor.ts` contain no console logger calls; legacy token is used only in Authorization header construction.
- [~] **Data exposure to external runtime:** BrowserOS MCP receives tool args including URLs, selectors, fill values, and may return page text/screenshot/base64. This is expected for browser automation but must be treated as **data egress to a local external process**. Do not send vault secrets/unredacted credentials; fill values for sensitive flows should remain approval-gated and policy-reviewed.
- [~] **Network target trust:** `BROWSEROS_MCP_URL` / `BROWSEROS_BASE_URL` are operator-configured. Production/operator docs should restrict to trusted loopback/internal endpoints; SSRF/private-network policy for arbitrary operator URLs not yet enforced by schema.
- [ ] **Credential handling review:** confirm BrowserOS runtime stores no Helm vault secrets; confirm MCP transport auth/TLS expectations for non-loopback deployments.
- [ ] **Artifact/data retention review:** screenshot/snapshot artifacts captured by executor follow artifact-dir policy; need explicit retention/redaction review for pages containing PII/secrets.
- [ ] **Threat-model signoff:** full STRIDE/threat-model evidence still P8/manual.

### Dispatch / Fallback
- [x] **No silent fallback/default dispatch:** `createBrowserAdapter` selects explicitly by env; `HELM_BROWSER_ADAPTER_DISPATCH` defaults off. Adapter errors surface structured `code/message/retryable`.
- [ ] **Default-dispatch gate:** only after deeper parity, security review signoff, and CI/env-gated evidence.
- **Default**: `BROWSER_ADAPTER=playwright` / dispatch off by default behavior remains Playwright.
- **Opt-in**: BrowserOS MCP only when explicitly configured (`BROWSEROS_MCP_URL`, and/or explicit adapter/dispatch env per route integration). No automatic runtime fallback from Playwright to BrowserOS or vice versa for a failing action.
- **Error surfacing**: Adapter errors must be structured (`code/message/retryable`); caller/route decides retry based on policy, never blind retry of uncertain external writes.
- **Parity gate before default dispatch**: require positive action parity, takeover/artifact/error parity, security review, and CI/env-gated evidence. Keep `HELM_BROWSER_ADAPTER_DISPATCH` explicit until gate passes.
