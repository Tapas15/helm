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

- [ ] Deep real-flow parity beyond controlled smoke (same scenarios on Playwright + BrowserOS, compare artifacts/errors/control).
- [ ] Human-observed live takeover in BrowserOS UI.
- [ ] Formal STRIDE/PII retention/legal/privacy signoff.
- [ ] Non-loopback credential-handling deployment verification or explicit “not used” decision.
- [ ] BrowserOS CI gate decision/implementation.