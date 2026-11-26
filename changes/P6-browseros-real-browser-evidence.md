# P6 BrowserOS Real-Browser Takeover / Parity Evidence

**Status:** Draft evidence capture (not signoff)  
**Date:** 2026-11-26  
**Runtime:** BrowserOS MCP `127.0.0.1:9210` (pid 18188 observed), browseros-cli 0.4.0  
**Scope:** Controlled local pages / example.com smoke only. No external side effects.

## Automated Smoke Evidence (local, env-gated)

- Command: `$env:HELM_BROWSEROS_MCP_SMOKE='1'; $env:BROWSEROS_MCP_URL='http://127.0.0.1:9210/mcp'; $env:BROWSEROS_MCP_SMOKE_URL='https://example.com'; $env:BROWSEROS_MCP_TIMEOUT_MS='45000'; pnpm -C backend/api exec vitest run src/routes/browseros-mcp-smoke.test.ts`
- Result: **PASS 6/6** (2026-11-26).
- Baseline: `{"capabilities":19,"create":183,"navigate":680,"snapshot":64,"fill":67,"click":221,"takeover_request":0,"takeover_resume":0,"close":48}` ms (controlled local page, baseline-only).
- Coverage: capabilities/create/navigate/snapshot/close; unknown-session structured error; click/fill selector-not-found structured error; positive click/fill on controlled local page; adapter-level takeover request/resume/stream-status parity; perf/parity baseline.

## Deterministic Contract Evidence (local)

- Targeted browser suite: **PASS 48/48**.
- `pnpm -C backend/api typecheck`: **PASS**.
- Includes dispatch-off/on, binary screenshot route mapping, adapter error mapping/no-secret assertions, takeover/edge/artifacts contracts.

## 2026-11-26 Controlled Parity Baseline (automated, local, no external side effects)

**Environment**: Windows local, BrowserOS MCP `127.0.0.1:9210` (pid 18188, browseros-cli 0.4.0), Playwright 1.65.1. Both tests used controlled local `127.0.0.1` HTML page; BrowserOS smoke also opened `https://example.com` for smoke navigation case.

| Flow | BrowserOS MCP (ms) | Playwright (ms) | BrowserOS result | Playwright result | Parity note |
|---|---:|---:|---|---|---|
| capabilities | 12 | n/a (not exposed by perf smoke) | ok, tools present, missing=[] | n/a | BrowserOS-specific capability report; not a Playwright parity field |
| create session | 91 | 2518 | ok, provider=browseros | ok, provider=playwright, status=ready | Shape compatible at contract level; timing differs (different runtime) |
| navigate local page | 479 | 401 | ok | ok | Pass |
| snapshot | 48 | 312 | ok, dom_snapshot artifact sha256/size/mime present | ok, dom_snapshot artifact sha256 present | Pass for artifact kind/sha256 presence |
| fill #name | 53 | 616 | ok | ok | Pass |
| click #btn | 205 | 392 | ok | ok | Pass |
| takeover request | 1 | 50 | ok, control.owner=user | ok, control.owner=user | Pass |
| takeover resume | 0 | 45 | ok, control.owner=agent | ok, control.owner=agent | Pass |
| close | 35 | 718 | ok | ok | Pass |

**Error/shape contracts (deterministic, same day)**: targeted browser suite 48/48 PASS + typecheck PASS. Covers selector-not-found structured non-retryable, timeout retryable `BROWSEROS_TIMEOUT`, TAKEOVER_ACTIVE retryable, snapshot/screenshot allowed during takeover with artifact parity, dispatch off/on routing, binary screenshot bytes/content-type/no-store and structured binary error no-secret leakage.

**Deviations / gaps**:
- Timing is not parity evidence (different runtimes). Use only as baseline.
- Playwright perf smoke does not expose MCP capabilities endpoint; capability-report parity is BrowserOS-adapter-specific.
- Real-browser takeover UI semantics and in-flight action interruption still require human observation (checklist below).
- Deep artifact byte-for-byte parity not required; shape/hash/size/mime parity is the contract target.

## Manual Real-Browser Takeover Checklist (needs human observation)

Use controlled local page or `https://example.com`. Record screen/video and API/event IDs.

| Scenario | Expected | Observed | Pass/Fail | Evidence |
|---|---|---|---|---|
| Request takeover while idle | Session control owner becomes `user`; task moves to `waiting_input`/takeover active; audit/event emitted |  |  |  |
| Request takeover during in-flight action | Action handling safe; no blind retry; control state observable; no secret leakage |  |  |  |
| Snapshot during takeover | Allowed/readable; artifact metadata shape valid |  |  |  |
| Screenshot during takeover | Allowed/readable; artifact metadata shape valid; no-store headers on route path |  |  |  |
| Resume after takeover | Control owner becomes `agent`; task resumes queued/runnable path per contract; resume event/audit emitted |  |  |  |
| Close/recovery | Session closes cleanly; no orphaned active control state |  |  |  |
| BrowserOS vs Playwright parity | Same flow gives compatible status/error/artifact/control shape or documented deviation |  |  |  |

## Gaps Remaining After This Evidence

- [~] Automated controlled-flow parity baseline recorded 2026-11-26 (BrowserOS 6/6 smoke PASS, Playwright 1/1 perf smoke PASS; status/artifact/control shape compared). Remaining: deeper real-flow parity on richer scenarios and human-observed takeover UI.
- [ ] Human-observed live takeover in BrowserOS UI.
- [ ] Formal STRIDE/PII retention/legal/privacy signoff.
- [ ] Non-loopback credential-handling deployment verification or explicit “not used” decision.
- [ ] BrowserOS CI gate decision/implementation.