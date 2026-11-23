# Helm Workspace Rules

Follow `AGENTS.md` at repo root. Also follow `changes/README.md` for session handoff.

## Critical
- Build Helm, not Hermes. Hermes is external adapter (Phase 2).
- No secrets in logs/events/prompts.
- External writes require policy + idempotency + receipts (implement as phases mature).
- Update `changes/CURRENT_STATE.md` and `changes/SESSION_LOG.md` after meaningful work.
- Prefer small verified slices; run typecheck/tests/build relevant to changes.
