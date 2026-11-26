# P6 BrowserOS Evidence Pack (Working)

**Status:** Working evidence (pre-signoff)  
**Captured:** 2026-11-26 16:25:13+05:30  
**Repo:** `C:\Users\Tapas\Documents\projects\Dubai_competetion_projects\helm`  
**Branch:** `main`  
**HEAD:** `ed0b6c7d42cb9e06c0c413573423eface9263a95` (`docs(p8): add report-only security scan workflow and refresh hardening evidence`)  
**Remote:** `origin https://github.com/Tapas15/helm.git`  
**Scope:** Collect P6 BrowserOS gate evidence before formal security/legal/privacy/dispatch signoff. This pack is evidence, not approval.

## 1) Evidence Pack — Collected Before Signing

| Evidence item | Status | Evidence | Notes / gap |
|---|---|---|---|
| AGPL boundary / no vendored BrowserOS source | **PASS (working)** | `git ls-files` BrowserOS-path inventory shows only Helm adapter/client/executor/smoke/docs; no BrowserOS package in manifests/lockfile; disk scan shows only Helm paths + untracked `backend/api/dist` build artifacts | External runtime only; formal legal signoff still pending |
| BrowserOS MCP env-gated smoke (controlled) | **PASS** | `P6-browseros-real-browser-evidence.md`: 2026-11-26 BrowserOS MCP smoke 6/6 PASS; baseline `caps 12, create 91, nav 479, snap 48, fill 53, click 205, takeover 1/0, close 35` ms | Controlled local page/example.com only; no external side effects |
| Playwright controlled parity baseline | **PASS** | `P6-browseros-real-browser-evidence.md`: Playwright perf smoke 1/1 PASS; `create 2518, nav 401, snap 312, fill 616, click 392, takeover 50/45, close 718` ms | Timing not parity evidence; shape/control/artifact contract compared |
| Deterministic browser contract suite | **PASS** | `P6-browseros-real-browser-evidence.md`: targeted browser suite 48/48 PASS; `pnpm -C backend/api typecheck` PASS | Covers dispatch off/on, binary route, error mapping, takeover/edge/artifacts |
| Real-browser takeover UI human observation | **PENDING (owner)** | Manual checklist in `P6-browseros-real-browser-evidence.md` | In-flight interruption/resume/snapshot-during-takeover/close evidence needed |
| STRIDE/PII retention/redaction/legal/privacy signoff | **PENDING (owner)** | Draft: `P6-browseros-security-signoff-draft.md` | Date/owner/signature required |
| Non-loopback endpoint decision/verification | **PENDING (owner)** | Draft decision table in signoff draft | Default: not used, keep `HELM_BROWSEROS_ALLOW_REMOTE` guard |
| BrowserOS CI gate decision | **PENDING (owner)** | Draft options A/B/C in signoff draft | Recommended B now, A before default dispatch |
| Default dispatch enablement | **BLOCKED** | `HELM_BROWSER_ADAPTER_DISPATCH` OFF by default | Requires parity+security+CI evidence + explicit approval |

## 2) AGPL Boundary — External Runtime Only

**Conclusion (working evidence):** BrowserOS is used as an **external local/runtime service** via MCP/HTTP contract adapters owned by Helm. No BrowserOS source is copied/vendored into the Helm git repository. Helm-owned integration code is limited to adapter/client/executor/smoke/docs.

### 2.1 Tracked BrowserOS/adapter file inventory

Command:

```powershell
git -C C:\Users\Tapas\Documents\projects\Dubai_competetion_projects\helm ls-files "*browseros*" "*BrowserOS*" "*browser-adapter*"
```

Output (2026-11-26):

```text
backend/api/src/lib/browser-adapter-edge.test.ts
backend/api/src/lib/browser-adapter-parity.test.ts
backend/api/src/lib/browser-adapter.test.ts
backend/api/src/lib/browser-adapter.ts
backend/api/src/lib/browseros-mcp-client.ts
backend/api/src/lib/browseros-mcp-executor.ts
backend/api/src/routes/browseros-mcp-smoke.test.ts
changes/P6-browseros-real-browser-evidence.md
changes/P6-browseros-security-signoff-draft.md
changes/phase-6-browseros-upgrade.md
```

Assessment: all tracked matches are Helm-owned adapter/client/executor tests, smoke test, or P6 documentation/evidence. No BrowserOS upstream source tree, license-bearing BrowserOS vendor directory, or BrowserOS package source is tracked.

### 2.2 Broader tracked browseros-name search

Command:

```powershell
git -C C:\Users\Tapas\Documents\projects\Dubai_competetion_projects\helm ls-files | Select-String -Pattern "browseros|browser-adapter|browser_adapter"
```

Output matches the same 10 tracked files above (no additional tracked BrowserOS source files).

### 2.3 Disk scan (including untracked build artifacts)

Command:

```powershell
Get-ChildItem -Path C:\Users\Tapas\Documents\projects\Dubai_competetion_projects\helm -Recurse -Force -ErrorAction SilentlyContinue |
  Where-Object { $_.FullName -notmatch '\\node_modules\\|\\.git\\' -and $_.Name -match 'browseros' } |
  Select-Object -ExpandProperty FullName
```

Observed: the same Helm source/docs files plus untracked `backend/api/dist/.../browseros-mcp-client.*` and `browseros-mcp-executor.*` compiled build artifacts. `git ls-files --error-unmatch backend/api/dist/backend/api/src/lib/browseros-mcp-client.js` confirms dist files are **not tracked**. No BrowserOS upstream source directory was found.

### 2.4 Dependency/lockfile check

Commands:

```powershell
Select-String -Path helm\pnpm-lock.yaml -Pattern "browseros" -SimpleMatch
Select-String -Path helm\package.json,helm\backend\api\package.json,helm\packages\shared\package.json -Pattern "browseros|@browseros" -SimpleMatch
```

Output: no matches. Helm does not declare or lock a BrowserOS package dependency.

### 2.5 Code boundary markers

- `backend/api/src/lib/browser-adapter.ts` validates/configures external BrowserOS endpoint (`BROWSEROS_MCP_URL` / legacy HTTP base+token), enforces loopback-by-default guard for remote endpoints (`HELM_BROWSEROS_ALLOW_REMOTE=1` opt-in), and defaults to Playwright when `BROWSER_ADAPTER!=browseros`.
- `backend/api/src/lib/browseros-mcp-client.ts` is a Helm-owned MCP JSON-RPC client talking to configured external MCP URL; it does not embed BrowserOS source.
- `backend/api/src/lib/browseros-mcp-executor.ts` is a Helm-owned executor mapping Helm browser actions to MCP tools over that external runtime.
- AGPL policy/boundary statements exist in `AGENTS.md`, `README.md`, `ROADMAP.md`, `THIRD_PARTY_NOTICES.md`, and P6 phase/signoff docs.

### 2.6 Remaining signoff gap

This is **working technical evidence**, not legal/compliance signoff. Before enabling default dispatch or making distribution claims, owner/legal/privacy/security must sign `changes/P6-browseros-security-signoff-draft.md`.

## 3) Evidence References

- `changes/P6-browseros-real-browser-evidence.md` — automated parity baseline + manual takeover checklist.
- `changes/P6-browseros-security-signoff-draft.md` — STRIDE/PII/credential/CI-gate/dispatch signoff draft.
- `changes/phase-6-browseros-upgrade.md` — P6 phase status and dispatch gate.
- `changes/CURRENT_STATE.md` — program status; P6 66%, P8 46%, overall 83.3%.

## 4) Integrity Notes

- No secrets captured. No external side-effecting browser flows run by this evidence-pack creation step.
- Worktree had unrelated pre-existing changes before this step: `M changes/memory_implementation.md`, `?? backups/`; not modified by this evidence-pack step.
- This pack should be updated when new P6 evidence is captured (CI gate run, human takeover recording, signoff dates/owners).
