# ECC for Helm — How to Use

Source: `C:\Users\Tapas\Documents\projects\Dubai_competetion_projects\everything-claude-code` (cloned).  
Do **not** blindly copy everything into Helm; selectively adopt patterns that fit this stack and blueprint.

## What helps Helm immediately

| ECC component | Use in Helm | Install/copy |
|---|---|---|
| `rules/security.md`, `coding-style.md`, `testing.md`, `git-workflow.md`, `agents.md` | Baseline discipline; adapted into `helm/AGENTS.md` and `.kilo/rules/helm.md` | Already adapted |
| `agents/planner.md`, `architect.md`, `tdd-guide.md`, `code-reviewer.md`, `security-reviewer.md`, `build-error-resolver.md` | Use as subagent prompts/checklists during work | Reference in place; optionally copy into `.kilo/agents/` later |
| `commands/plan.md`, `tdd.md`, `code-review.md`, `build-fix.md`, `verify.md`, `checkpoint.md` | Workflow discipline for Phase 0+ slices | Reference/copy selectively |
| `skills/tdd-workflow`, `security-review`, `verification-loop`, `backend-patterns`, `frontend-patterns`, `coding-standards` | Reusable guidance; pick only relevant parts | Reference in place initially |
| `hooks/memory-persistence`, `strategic-compact` | Useful for long sessions; may need adaptation for Kilo/this repo | Evaluate later |

## What NOT to install blindly
- Do not copy all hooks/commands/MCP configs globally; they add context overhead and may conflict with Kilo behavior.
- Do not import Claude Code plugin metadata as-is; Kilo has its own config model (`.kilo/`).
- Do not enable many MCP servers; follow ECC warning: too many tools shrink effective context.

## Recommended lightweight setup for Helm
1. **Keep ECC repo as reference library** at `../everything-claude-code`.
2. **Use Helm-native rules**: `helm/AGENTS.md` + `helm/.kilo/rules/helm.md` (created).
3. **Use Helm change tracker**: `helm/changes/*` as the source of truth across sessions.
4. **Selectively port agents/commands** into `.kilo/agents/` or `.kilo/commands/` only when a repeated need appears.
5. **Adopt verification loop**: after each slice run lint/typecheck/test/build/smoke; record evidence in `changes/SESSION_LOG.md`.

## Mapping to Helm phases
- **Phase 0-1**: planner, tdd-guide, code-reviewer, build-error-resolver, verification-loop.
- **Phase 2**: architect, security-reviewer, coding-standards, backend-patterns.
- **Phase 3-4**: security-reviewer, e2e-runner, integration/contract testing discipline.
- **Phase 5-8**: eval-harness, verification-loop, security audits, release gates.

## Install? 
**No global install required.** ECC is already cloned locally. For Helm, we’ve installed the *useful subset as project rules/docs*. If you want, I can next port specific ECC agents/commands into `helm/.kilo/` in Kilo-compatible format.
