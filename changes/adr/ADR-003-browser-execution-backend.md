# ADR-003: Browser Execution Backend

- **Date:** 2026-11-22
- **Status:** Accepted (initial)
- **Phase:** 3/6

## Context
Helm needs smooth prompt-driven browser execution, live preview/takeover, evidence capture, and optional CAPTCHA handling. BrowserOS offers agent-oriented browser runtime features, but its codebase is AGPL-3.0 and operationally heavier. Playwright+Chromium is permissive and straightforward but requires Helm to build session/preview/takeover/captcha flows.

## Decision
- Define a Helm-owned `BrowserExecutor` contract in `@helm/shared`.
- Implement **Playwright + Chromium** as the default Phase 3 backend in `backend/browser-worker`.
- Keep BrowserOS as an optional future adapter behind the same contract (sidecar/integration), not copied code, pending AGPL/compliance/ops review.
- CAPTCHA handling is explicit: optional third-party solver integration and/or human takeover. No bypass/evasion claims.

## Consequences
- **Positive:** Replaceable backend, clean licensing for Helm core, fast MVP path, matches blueprint invariants.
- **Negative:** Helm must build preview/takeover/trace UX itself; CAPTCHA solving is not automatic without provider config.
- **Follow-up:** Add BrowserOS adapter ADR addendum if/when integrating; add security/compliance review before AGPL runtime integration.
