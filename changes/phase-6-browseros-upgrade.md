# Phase 6 - Advanced Browser Capability Upgrade (Optional External Adapter)

**Status:** `[ ]` Not started  
**Blueprint refs:** Phase 6, `06-Deterministic-Browser-and-Computer-Execution.md`

## Goal
Improve browser execution quality/speed with optional external browser adapters behind Helm's `BrowserExecutor` contract, while keeping Playwright as default fallback and Helm as original implementation.

## IP/License Guardrail
- **No BrowserOS/Obscura/Hermes source code copying.** Implement capabilities in Helm with original code.
- Any external adapter must be isolated (sidecar/service), license-reviewed, and never vendored as AGPL/copyleft code into Helm.

## Completed
- [ ] None.

## Remaining
- [ ] Evaluate external CDP/browser adapters (including BrowserOS/Obscura) as optional sidecars only.
- [ ] Capability detection and fallback to Playwright.
- [ ] Playbook recorder/import format (initial).
- [ ] Performance benchmarking vs Playwright baseline.
- [ ] ADR + compliance review before any external runtime integration.

## Verification Evidence
- None.
