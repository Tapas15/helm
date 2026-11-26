# Phase 6 - BrowserOS Adapter Upgrade (Optional External Adapter)

**Status:** `[~]` 66%  
**Blueprint refs:** Phase 6, `06-Deterministic-Browser-and-Computer-Execution.md`

## Goal
Improve browser execution with optional external BrowserOS adapter behind Helm `BrowserExecutor`/adapter contract, while keeping Playwright default fallback and Helm original.

## What we have done
- **Adapter boundary**: `backend/api/src/lib/browser-adapter.ts` implements `BrowserOSAdapter`/`PlaywrightBrowserAdapter`, `BrowserOSAdapterStub`, `BrowserOSHttpAdapter` (`BROWSEROS_BASE_URL`/`BROWSEROS_TOKEN`), and `BrowserOSMcpAdapter` (`BROWSEROS_MCP_URL`, streamable HTTP MCP `/mcp`) via `browseros-mcp-client.ts`/`browseros-mcp-executor.ts`.
- **Safe default/fallback**: Playwright remains default behavior; no BrowserOS/Obscura/Hermes code copied; BrowserOS runs as external runtime only (user confirmed `external-adapter OK`).
- **API/dispatch hooks**: `GET /v1/browser/adapter/status`; `GET /v1/browser/adapters/browseros/capabilities`; `HELM_BROWSER_ADAPTER_DISPATCH` flag; adapter-aware browser routes/session lookup; request/requestBinary dispatch supported.
- **Hardening**: MCP timeout `BROWSEROS_MCP_TIMEOUT_MS` (default 30s); capability detection via `tools/list` (required `tabs,navigate,snapshot,screenshot`); structured error classification `BROWSEROS_TIMEOUT/UNAVAILABLE/CAPABILITY_MISSING/SELECTOR_NOT_FOUND`; click/fill use `evaluate_in_page` returning `selector_not_found|ok` for reliable selector detection (`0616ad1`); adapter endpoint URL validation (http/https only) + explicit partial-config stub errors (`dab1583`); non-loopback BrowserOS endpoint rejected by default unless `HELM_BROWSEROS_ALLOW_REMOTE=1` (`7c77161`).
- **Verification**: `backend/api/src/lib/browser-adapter.test.ts` PASS (17/17, 2026-11-25 local rerun). Env-gated smoke `HELM_BROWSEROS_MCP_SMOKE=1 BROWSEROS_MCP_URL=http://127.0.0.1:9210/mcp BROWSEROS_MCP_SMOKE_URL=https://example.com BROWSEROS_MCP_TIMEOUT_MS=45000` PASS (6/6, 2026-11-25 rerun): capabilities+create/navigate/snapshot/optional screenshot/close, structured unknown-session error, click/fill selector-not-found structured error, positive click/fill on controlled local page, adapter-level takeover request/resume/stream-status parity, perf/parity baseline. Baseline: `{"capabilities":23,"create":204,"navigate":975,"snapshot":90,"fill":116,"click":267,"takeover_request":1,"takeover_resume":1,"close":75}` ms (controlled local page, baseline-only). Screenshot best-effort (timeout classified retryable).
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
- [~] MCP adapter scaffold integrated behind contract; capability/report + timeout/error classification added; deterministic contract hardening added 2026-11-26 (ackend/api/src/lib/browser-adapter-parity.test.ts, 4/4): click/fill selector-not-found structured non-retryable errors, MCP timeout -> retryable BROWSEROS_TIMEOUT, takeover request/resume + stream-status parity shapes. Env-gated smoke PASS (6/6, 2026-11-26 rerun, local BrowserOS 127.0.0.1:9210, pid observed): capabilities/create/navigate/snapshot/close, unknown-session structured error, click/fill selector-not-found structured error, positive click/fill success on controlled local page, adapter-level takeover request/resume/stream-status parity, perf/parity baseline (`caps 19ms, create 183ms, nav 680ms, snap 64ms, fill 67ms, click 221ms, takeover 0/0ms, close 48ms`; baseline-only, no dispatch change). Prior 2026-11-25 baseline retained below. Screenshot best-effort. Still needed: deeper artifact/error parity, BrowserOS-vs-Playwright takeover semantics under real browser control, route-level dispatch-off contract covered by `backend/api/src/routes/browser.dispatch.test.ts` (2/2).
- [~] Security/compliance review baseline recorded (2026-11-25): AGPL boundary/no copied code confirmed, Helm route authZ preserved, no adapter secret logging; operator URL validation (http/https only), explicit partial-config stub errors, and non-loopback remote endpoint guard (`HELM_BROWSEROS_ALLOW_REMOTE=1` opt-in) added. **Human signoff (2026-11-25, user: "yes to all, keep defaults"):** AGPL external-runtime boundary OK; endpoint policy OK; data handling OK (no vault secrets, sensitive fills approval-gated); credential handling OK (BrowserOS must not store Helm vault secrets; non-loopback requires trusted network/TLS/auth if ever used); artifact/PII retention accepted as interim with manual caution until P8 policy; default-dispatch gate remains off until parity+security+CI evidence. **Still pending for full signoff:** formal STRIDE/threat-model evidence, PII retention/redaction policy implementation, deeper SSRF/private-network operator policy, credential-handling verification in real non-loopback deployment (if used).
- [~] Capability detection/report added (`tools/list` required-tool check, `/v1/capabilities` adapter path) with deterministic contract tests for missing capabilities/timeout mapping; automatic fallback/dispatch policy still explicit-only (no silent default switch).
- [x] Push and verify GitHub Actions CI green (latest: [45561356201](https://github.com/Tapas15/helm/actions/runs/45561356201), `dbd59ef`).
- [ ] Default dispatch only after parity+security signoff evidence.
- [x] Performance benchmarking vs Playwright baseline (env-gated, controlled local page, no external side effects, 2026-11-25). BrowserOS MCP 6/6 PASS: `{"capabilities":9,"create":80,"navigate":458,"snapshot":40,"fill":61,"click":206,"takeover_request":0,"takeover_resume":1,"close":33}` ms. Playwright 1/1 PASS: `{"create":6307,"navigate":572,"snapshot":500,"fill":332,"click":705,"takeover_request":81,"takeover_resume":60,"close":903}` ms. Comparison is baseline-only (different runtimes/adapters); do not use as default-dispatch justification.

## Evidence
- `backend/api/src/lib/browser-adapter.test.ts` PASS (19/19, 2026-11-26 local).
- `backend/api/src/lib/browser-adapter-parity.test.ts` PASS (4/4, 2026-11-26 local): selector-not-found click/fill, MCP timeout retryable, takeover request/resume + stream-status parity shapes.
- `backend/api/src/lib/browser-adapter-edge.test.ts` PASS (6/6, 2026-11-26 local): missing-session NOT_FOUND, unavailable MCP retryable, navigate timeout retryable, unsupported binary 404, TAKEOVER_ACTIVE blocks action retryable, snapshot/screenshot allowed during takeover with artifact parity.
- Targeted deterministic browser contracts PASS (48/48, 2026-11-26 local): `browser-adapter.test.ts`, `browser-adapter-parity.test.ts`, `browser-adapter-edge.test.ts`, `browser.dispatch.test.ts`, `browser.adapter-error-mapping.test.ts`, `browser.binary-error-mapping.test.ts`, `browser.binary-dispatch-off.test.ts`, `browser.takeover.test.ts`, `browser.takeover.edge.test.ts`, `browser.artifacts.test.ts`, `browser.artifacts-list.test.ts`.
- `pnpm -C backend/api typecheck` PASS (2026-11-26).
- Env-gated BrowserOS MCP smoke PASS (6/6, 2026-11-26 rerun, local BrowserOS `127.0.0.1:9210`, browseros-cli 0.4.0): `{"capabilities":19,"create":183,"navigate":680,"snapshot":64,"fill":67,"click":221,"takeover_request":0,"takeover_resume":0,"close":48}` ms (controlled local page, baseline-only).
- `backend/api/src/routes/browseros-mcp-smoke.test.ts` PASS (6/6, 2026-11-25 rerun) with `HELM_BROWSEROS_MCP_SMOKE=1 BROWSEROS_MCP_URL=http://127.0.0.1:9210/mcp BROWSEROS_MCP_SMOKE_URL=https://example.com BROWSEROS_MCP_TIMEOUT_MS=45000`: capabilities/create/navigate/snapshot/close; unknown-session structured error; click/fill selector-not-found structured error; positive click/fill on controlled local page (no external side effects); adapter-level takeover request/resume/stream-status parity; perf/parity baseline. Screenshot best-effort (timeout classified retryable).
- `backend/browser-worker/src/playwright-perf-smoke.test.ts` PASS (1/1, 2026-11-25) with `HELM_PLAYWRIGHT_PERF_SMOKE=1`: controlled local page create/navigate/snapshot/fill/click/takeover-request/resume/close; artifact sha256 shape asserted.
- Perf baseline logs (2026-11-25, controlled local page, env-gated):
  - BrowserOS MCP rerun: `{"capabilities":23,"create":204,"navigate":975,"snapshot":90,"fill":116,"click":267,"takeover_request":1,"takeover_resume":1,"close":75}` ms.
  - BrowserOS MCP prior baseline: `{"capabilities":9,"create":80,"navigate":458,"snapshot":40,"fill":61,"click":206,"takeover_request":0,"takeover_resume":1,"close":33}` ms.
  - Playwright: `{"create":6307,"navigate":572,"snapshot":500,"fill":332,"click":705,"takeover_request":81,"takeover_resume":60,"close":903}` ms.
- `pnpm -C backend/api exec tsc -p tsconfig.json --noEmit` PASS.
- `pnpm -C backend/browser-worker exec tsc -p tsconfig.json --noEmit` PASS.
- CI: latest run recorded in `changes/CURRENT_STATE.md` after push.
- Commits: pushed on `main` (see git log / CURRENT_STATE).

## Security / Compliance Review (2026-11-25, code-audit baseline + human interim signoff)`r`n`r`n**Draft signoff package (2026-11-26):** `changes/P6-browseros-security-signoff-draft.md` (STRIDE, PII retention/redaction, CI gate options, signoff table). **Draft evidence capture:** `changes/P6-browseros-real-browser-evidence.md` (automated smoke/contract evidence + manual takeover checklist). Both drafts are unapproved; formal signoff still required.

**Status:** human interim signoff recorded (2026-11-25, user: "yes"); full security signoff still pending formal P8 evidence.

### Human Interim Signoff (2026-11-25)
- [x] AGPL boundary OK: BrowserOS external runtime only; no BrowserOS code copied into Helm.
- [x] Endpoint policy OK (interim): http/https only; non-loopback blocked unless `HELM_BROWSEROS_ALLOW_REMOTE=1`.
- [x] Data handling OK (interim): URLs/selectors/fill values/page text/screenshots may go to local external BrowserOS runtime; no vault secrets sent; sensitive fills approval-gated.
- [x] Credential handling OK (interim): BrowserOS runtime must not store Helm vault secrets; non-loopback requires trusted network/TLS/auth if ever used.
- [x] Artifact/PII retention OK (interim): artifacts in `BROWSER_ARTIFACT_DIR` accepted with manual caution until P8 PII retention/redaction policy.
- [x] Default-dispatch gate OK: keep `HELM_BROWSER_ADAPTER_DISPATCH` default off until parity+security+CI evidence complete.

### Boundary / License
- [x] **No copied BrowserOS code** in Helm repo tracked source (`git ls-files '*browseros*'` only Helm adapter/client/executor/smoke/phase doc). BrowserOS runs as **external runtime** (user-confirmed `external-adapter OK`); AGPL boundary preserved by process/network contract.
- [x] **No vendored AGPL/copyleft artifacts** added by this adapter. Third-party notices refresh remains required on dependency changes (P8/legal).

### Process / Auth / Data handling
- [x] **Process isolation:** MCP adapter calls external BrowserOS MCP over configured URL (`BROWSEROS_MCP_URL`); legacy HTTP adapter uses `BROWSEROS_BASE_URL` + bearer `BROWSEROS_TOKEN`. No BrowserOS SDK embedded.
- [x] **Helm authZ boundary preserved at API routes:** `backend/api/src/routes/browser.ts` resolves owned session/task before proxying mutating/read actions; guarded actions still require approval/actionHash/idempotency. Adapter dispatch occurs only after route-level ownership checks.
- [x] **No secret logging in adapter code:** `browser-adapter.ts`, `browseros-mcp-client.ts`, `browseros-mcp-executor.ts` contain no console logger calls; legacy token is used only in Authorization header construction.
- [~] **Data exposure to external runtime:** BrowserOS MCP receives tool args including URLs, selectors, fill values, and may return page text/screenshot/base64. This is expected for browser automation but must be treated as **data egress to a local external process**. Do not send vault secrets/unredacted credentials; fill values for sensitive flows should remain approval-gated and policy-reviewed.
- [~] **Network target trust:** `BROWSEROS_MCP_URL` / `BROWSEROS_BASE_URL` are operator-configured. Production/operator docs should restrict to trusted loopback/internal endpoints; SSRF/private-network policy for arbitrary operator URLs not yet enforced by schema.
- [ ] **Credential handling review:** confirm BrowserOS runtime stores no Helm vault secrets; confirm MCP transport auth/TLS expectations for non-loopback deployments. (Interim policy accepted by user 2026-11-25; technical verification pending.)
- [ ] **Artifact/data retention review:** screenshot/snapshot artifacts captured by executor follow artifact-dir policy; need explicit retention/redaction review for pages containing PII/secrets. (Interim manual caution accepted by user 2026-11-25; P8 policy pending.)
- [ ] **Threat-model signoff:** full STRIDE/threat-model evidence still P8/manual.

### Dispatch / Fallback
- [x] **No silent fallback/default dispatch:** `createBrowserAdapter` selects explicitly by env; `HELM_BROWSER_ADAPTER_DISPATCH` defaults off. Adapter errors surface structured `code/message/retryable`.
- [x] **Default-dispatch gate policy (human interim signoff 2026-11-25):** keep default off until parity+security+CI evidence complete. Technical parity + formal security evidence still required before enabling by default.
- **Default**: `BROWSER_ADAPTER=playwright` / dispatch off by default behavior remains Playwright.
- **Opt-in**: BrowserOS MCP only when explicitly configured (`BROWSEROS_MCP_URL`, and/or explicit adapter/dispatch env per route integration). No automatic runtime fallback from Playwright to BrowserOS or vice versa for a failing action.
- **Error surfacing**: Adapter errors must be structured (`code/message/retryable`); caller/route decides retry based on policy, never blind retry of uncertain external writes.
- **Parity gate before default dispatch**: require positive action parity, takeover/artifact/error parity, security review, and CI/env-gated evidence. Keep `HELM_BROWSER_ADAPTER_DISPATCH` explicit until gate passes.
