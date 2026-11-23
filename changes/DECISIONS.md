# Decisions & Assumptions — Helm

> Record decisions so future sessions don't re-litigate or guess. Include date, context, decision, alternatives, consequences.

## 2026-11-22 — Project name: Helm
- **Context:** User asked to name the project and implement blueprint from scratch.
- **Decision:** Name = **Helm**. Package scope `@helm/*`.
- **Alternatives:** PAP (blueprint working name), other names.
- **Consequences:** All packages/apps named `@helm/*`; can rename later via codemod if user prefers.

## 2026-11-22 — Hermes is external, not built here
- **Context:** User asked "you are building my agent right not hermes?"
- **Decision:** Build Helm platform; integrate Hermes later behind `AgentRuntime` adapter contract per `05-Hermes-Agent-Runtime.md`. Do not reimplement Hermes.
- **Consequences:** Phase 2 requires adapter/sidecar integration; control plane remains authoritative.

## 2026-11-22 — Phase 0 scaffold before verification
- **Decision:** Created minimal Phase 0 vertical slice skeleton; marked unverified until smoke pass. Smoke later passed.
- **Consequences:** Continue hardening (bootstrap, CI, real tests, transition/idempotency).

## 2026-11-22 — Dev auth skeleton
- **Decision:** API uses `x-user-id` header or falls back to `usr_local_dev` for Phase 0. No real OIDC/session.
- **Consequences:** Replace in later phase with proper auth; never expose beyond local dev.

## 2026-11-22 — Event sequence allocation
- **Decision:** Phase 0 uses `max(sequence)+1` read per task event insert. Acceptable for single-worker/dev.
- **Risk:** Concurrent writers can race; fix with DB sequence/transactional counter in Phase 1 hardening.

## 2026-11-22 — Replaceable technology by contract
- **Context:** User asked if underlying technology can be changed later.
- **Decision:** All major components must sit behind contracts/adapters in `packages/shared` or package boundaries. Swaps require ADR + migration + rollback + verification. Stable: event envelope, task/approval/receipt/error schemas, audit semantics. Swappable: model/provider, Hermes mode, browser backend, connectors, queue/durable engine, UI libs, ORM where isolated.
- **Consequences:** No vendor SDK types leak outside adapters; add ADRs before major swaps.

## 2026-11-22 — Observability/debug/trace/fix-audit are mandatory
- **Context:** User requested print/debug statements, agent trace, stress/error root-cause reporting, agent-assisted fix workflow, and tracking/auditing fixes.
- **Decision:** Adopt `changes/REPLACEABILITY_OBSERVABILITY_AUDIT_PLAN.md`. Structured Pino logs with redaction; debug flags for verbose dev trace; no ad-hoc prod console.log. Stable `HelmError` codes; cause chains; redacted context. Agent trace events in task timeline. Every non-trivial fix recorded in `changes/FIX_LOG.md` and audit/event metadata.
- **Consequences:** Add observability package/helpers, error taxonomy, debug bundle, fault injection, and regression-test requirement for fixes.

## Open Decisions
- [ ] Confirm product display name/branding (Helm vs other).
- [ ] ADR-001 Hermes integration mode (sidecar/service/embedded) — Phase 2.
- [ ] ADR-002 Temporal scope (all tasks vs long-running only) — Phase 5.
- [ ] ADR-003 Browser primary backend (BrowserOS vs Playwright first) — Phase 3/6.
- [ ] ADR-004 Canonical event schema (AG-UI extension vs custom).
- [ ] ADR-005 Secret vault implementation.
- [ ] ADR-006 Observability stack (Pino+OTel now; later Loki/Tempo/Prometheus/Grafana?).

## DEC-20261122-task-control-shared
- **Date:** 2026-11-22
- **Decision:** Centralize task control transition rules in `@helm/shared/task-control` and make lint scripts run `tsc --noEmit`.
- **Rationale:** Prevent API/worker/UI drift on lifecycle rules; make CI lint gate meaningful without adding ESLint dependency during Phase 0 hardening.
- **Alternatives:** Keep local route map; add ESLint now. Rejected: duplication risk; extra setup churn before Phase 0 baseline is green.
- **Impact:** Shared contract owns allowed transitions; all packages gain type-aware lint command; CI lint now enforces type cleanliness.

## DEC-20261122-browser-executor-contract
- **Date:** 2026-11-22
- **Decision:** Adopt Helm-owned BrowserExecutor contract in @helm/shared; implement Playwright+Chromium as Phase 3 default; keep BrowserOS as optional external adapter behind same contract after AGPL/compliance/ops review.
- **Rationale:** User wants BrowserOS-like smooth prompt browsing/takeover; Playwright gives permissive MVP path while preserving replaceability. BrowserOS captcha solve is provider-backed and not a bypass.
- **Impact:** Added packages/shared/src/browser.ts, ADR-003, and Playwright browser-worker session/action scaffold.

## DEC-20261122-helm-native-hermes-like-runtime
- **Date:** 2026-11-22
- **Decision:** Helm will implement selected Hermes-like capabilities (model routing, agent loop, tools/MCP-style extensibility, memory, skills, scheduler, subagents, checkpoints) as Helm-owned contracts/runtime. Hermes remains optional, behind the same AgentRuntime adapter; no Hermes code copied.
- **Rationale:** User wants similar capabilities, not full Hermes dependency/identity. Preserves Helm invariants: control plane authority, policy/approval gates, audit/redaction, replaceable adapters.
- **Impact:** Phase 2 plan rewritten; execution prioritizes @helm/shared AgentRuntime contract + minimal Helm-native runtime before optional Hermes adapter.

## DEC-20261122-browser-obscura-eval
- **Date:** 2026-11-22
- **Decision:** Evaluate Obscura (h4ckf0r0day/obscura, Apache-2.0) only as an optional CDP browser backend behind Helm BrowserExecutor. Keep Playwright+Chromium as default MVP path. Do not claim/implement anti-bot/CAPTCHA bypass; real-task purchases require human approval + takeover.
- **Rationale:** User wants real task execution (e.g., Amazon/Flipkart purchase) with approval. Obscura has useful CDP/stealth/rendering features but no guarantee against bot blocking; Helm needs owned control-plane safety.
- **Impact:** Phase 3 adds Obscura evaluation item; purchase flow requires approval gate, takeover, evidence, idempotency, audit.

## DEC-20261122-license-compliance
- **Date:** 2026-11-22
- **Decision:** Add LICENSE (all rights reserved, competition context) and THIRD_PARTY_NOTICES.md generated from pnpm dependency licenses. No GPL/AGPL/LGPL/SSPL/BUSL dependencies found in installed pnpm deps. BrowserOS/AGPL remains external-only; Obscura/Hermes only as external/adapters with notices if integrated.
- **Rationale:** User requested Dubai competition license/conflict compliance.
- **Impact:** Repo now has explicit ownership and dependency attribution baseline; regenerate notices when dependencies change.

## DEC-20261122-original-capability-implementation
- **Date:** 2026-11-22
- **Decision:** Helm will implement BrowserOS/Hermes/Obscura-like capabilities as original Helm-owned code and contracts. No third-party project source code is copied/vendored into Helm. External runtimes, if ever used, must be optional isolated adapters/services with license/compliance review; no AGPL/copyleft vendoring.
- **Rationale:** User explicitly requested similar/better features, not copied proprietary/third-party code, for Dubai competition.
- **Impact:** AGENTS/README/phase plans updated; all future implementation must follow original-code + adapter-boundary rule.
