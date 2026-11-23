# 03 - Frontend - OpenFUSE-Style UI Blueprint

## 1. UI Goal

Deliver an **OpenFUSE-like** interface where the user can delegate work, watch execution live, intervene safely, and trust outcomes. The UI is a control surface over real backend state.

## 2. Design Principles

- **Calm, operational, evidence-first.** No fake "agent magic".
- **Live but stable.** Stream updates without layout jitter.
- **Actionable transparency.** Every step shows what, why, where, and result.
- **Control always available.** Pause/stop/takeover/approve are one click away.
- **Risk clarity.** Sensitive actions visually distinct and require deliberate confirmation.

## 3. Information Architecture

```text
App Shell
├── Chat (primary)
│   ├── Thread list / main thread
│   ├── Message composer
│   ├── Agent response stream
│   └── Inline cards (plan, browser, email, files, approvals, artifacts)
├── Activity / Tasks
│   ├── Task list (active, waiting, scheduled, completed, failed)
│   ├── Task detail (timeline, evidence, receipts, logs)
│   └── Run controls (pause/resume/cancel/retry)
├── Browser Workspace
│   ├── Live session preview
│   ├── URL/title/status
│   ├── Takeover / Return control
│   └── Downloads/screenshots
├── Computer Workspace (v1)
│   ├── Terminal
│   ├── Files
│   └── Desktop stream (optional provider)
├── Integrations / Apps
│   ├── Connected accounts
│   ├── MCP servers
│   └── Permissions/scopes
├── Memory / Skills
│   ├── Memory inspect/edit/delete/export
│   └── Skill registry/playbooks
└── Settings
    ├── Models/providers/routing
    ├── Approval policy defaults
    ├── Privacy/data retention
    └── Diagnostics/export
```

## 4. Primary Screens and Components

### 4.1 Chat Screen (Home)

**Layout:** 3-column responsive (collapsible on mobile)
- Left: thread/task nav.
- Center: conversation + inline execution cards.
- Right: context panel (current task, approvals, artifacts, browser preview).

**Components:**
- `Composer`: multiline input, attach files, mode/model indicator, send/stop button in same control.
- `MessageList`: virtualized, sticky "jump to latest", streaming tokens/steps.
- `PlanCard`: checklist with step states (`pending/running/waiting/done/failed`).
- `ToolCallCard`: tool name, args summary, status, elapsed, output preview.
- `ApprovalCard`: exact action, target, diff/preview, expiry, approve/deny.
- `EvidenceCard`: sources, screenshots, citations, artifact links.
- `TakeoverBanner`: "Agent paused - you have control".

### 4.2 Activity/Tasks Screen

- Task table/cards with filters: `active`, `waiting_approval`, `waiting_input`, `scheduled`, `failed`, `completed`.
- Task detail timeline merges: plan steps, tool calls, approvals, checkpoints, errors, receipts.
- Controls: pause/resume/cancel/retry/clone-as-template.
- Failure panel: human-readable cause, last good checkpoint, safe retry options.

### 4.3 Browser Workspace

- Live preview (screenshot stream or embedded remote browser view).
- Session metadata: URL, title, profile, owner (agent/user), backend (BrowserOS/Playwright).
- Controls: refresh, navigate, click/type helper (when user in control), take over, return control.
- Evidence rail: screenshots, DOM snapshot hash, downloads, console/network warnings.

### 4.4 Approvals Center

- Pending approvals queue with risk badges.
- Approval detail shows immutable payload:
  - action type, connector/account, target, parameters, diff/preview, idempotency key, expiry.
- Buttons: Approve once, Deny, Edit & re-propose (creates new proposal).
- Receipt view after execution: status, provider response, timestamp, audit ID.

### 4.5 Integrations / Apps

- Connector cards: status, account, scopes, last health check, test action.
- OAuth connect/reconnect/disconnect.
- MCP server registry: endpoint, tools discovered, trust level, enable/disable.
- Per-connector policy defaults (read auto, write ask, destructive block).

### 4.6 Settings

- Model providers: add key/base URL/local endpoint, model roles, routing rules, data-sensitivity policy.
- Execution: browser backend preference, sandbox limits, timeout defaults.
- Privacy: memory toggle, retention, export/delete, telemetry opt-in.
- Developer: event log viewer, webhook/debug mode, feature flags.

## 5. UI State Model

### 5.1 Frontend State Layers

| Layer | Store | Examples |
|---|---|---|
| Server state | TanStack Query / RTK Query | tasks, threads, approvals, connectors, artifacts |
| Realtime event state | WebSocket/AG-UI stream reducer | token deltas, step updates, tool events |
| Local UI state | Zustand/Redux/UI reducer | selected tab, panel open, draft text, filters |
| Ephemeral media state | component state | screenshot blob URL, console scroll |

### 5.2 Canonical UI Task State

```ts
type UiTaskStatus =
  | "queued" | "planning" | "running" | "waiting_approval"
  | "waiting_input" | "paused" | "scheduled" | "succeeded"
  | "failed" | "cancelled" | "blocked";
```

UI must render only backend-confirmed states. Optimistic updates allowed only for view controls, not execution truth.

## 6. Event-Driven Rendering (AG-UI / Event Schema)

Use an AG-UI-compatible event stream as the base, extended with OpenFUSE-style execution events.

```ts
type UiEvent = {
  eventId: string;
  taskId: string;
  runId?: string;
  sessionId?: string;
  sequence: number;
  ts: string;
  type:
    | "assistant.message.delta" | "assistant.message.completed"
    | "task.plan.created" | "task.step.updated"
    | "tool.started" | "tool.progress" | "tool.completed" | "tool.failed"
    | "approval.required" | "approval.resolved"
    | "browser.frame" | "browser.state"
    | "artifact.created" | "task.completed" | "task.failed";
  payload: Record<string, unknown>;
};
```

**Reducer rules:**
- Ignore duplicate `eventId`.
- Buffer out-of-order events by `sequence` per task/run.
- Mark stream stale if heartbeat missing > N seconds.
- Never render secret-bearing payload fields.

## 7. OpenFUSE UI Patterns to Reuse

From `Demo/openfuse`:
- **Composer send/stop in same control** and draft retention.
- **Inline tool/browser/email/PDF/plan/finance cards** in chat.
- **Visible follow-up queue**; stopping reply does not cancel durable task.
- **Action review** as distinct, stored object with explicit decision.
- **Browser takeover console** tied to same session.
- **Activity/receipt navigation** from chat cards.
- **Capybara/avatar state** indicating active/waiting/needs input (optional branding).

## 8. Visual Design System (Helm Premium White)

Helm adopts an original premium white design language inspired by Muse usability/simplicity, but with no copied source code, assets, branding, or exact layouts.

| Element | Direction |
|---|---|
| Main background | Pure white / warm white |
| Sidebar | Soft off-white |
| Cards | White with subtle borders |
| Typography | Inter or Geist |
| Primary text | Near-black |
| Secondary text | Muted grey |
| Accent | Restrained blue or violet |
| Borders | Thin, light grey |
| Shadows | Very subtle |
| Corners | 10–14px |
| Animations | Smooth, subtle |
| Icons | Lucide |

Interaction requirements: smooth page transitions; animated expandable panels; resizable three-panel workspace; interactive chat cards; live agent activity; interactive task timelines; drag-and-drop agent workflows; browser preview/takeover; approval dialogs; contextual menus/popovers; responsive mobile navigation; keyboard shortcuts and command palette.

Quality objective: polished premium personal AI application, not a conventional developer dashboard. White UI must remain consistent across chat, agents, computer control, approvals, workflows, and settings.

## 9. Component Library and Frontend Stack

| Layer | Recommendation | Notes |
|---|---|---|
| Framework | React + TypeScript + Vite | Fast web shell; Tauri/Electron optional desktop later |
| Styling | Tailwind CSS v4 | Token-driven theme, light premium white surfaces |
| UI primitives | shadcn/ui + Radix UI | Accessible, composable, original Helm styling |
| Motion | Motion | Smooth transitions, expandable panels, subtle feedback |
| App state | Zustand | Local UI/workspace/command palette state |
| Server state | TanStack Query | Tasks, approvals, artifacts, connectors, settings |
| Realtime | WebSockets + SSE + event reducer | AG-UI-compatible stream rendering and live previews |
| Workflows | React Flow | Drag-and-drop agent/workflow graph editor |
| Rich text | Tiptap | Prompt/doc/artifact editing surfaces |
| DnD | dnd-kit | Workflow cards, panels, reorder interactions |
| Charts | Recharts | Usage, reliability, run metrics; lightweight and calm |
| Icons | Lucide | Consistent, restrained iconography |

## 10. Accessibility and UX Quality

- Keyboard navigable approvals and task controls.
- ARIA live regions for task status changes.
- Color not sole risk indicator; use labels/icons/text.
- Focus trap in approval modal; confirm destructive actions.
- "What happened?" panel for every failure.
- Mobile: collapse to chat + activity + approvals; browser preview as snapshot.

## 11. Frontend Security

- No secrets/tokens in localStorage; use httpOnly cookies or secure desktop storage.
- Render untrusted tool/web content as data, never HTML-executable by default.
- Sanitize markdown; disable raw HTML or use strict allowlist.
- Signed URLs for artifacts/screenshots with short TTL.
- CSP, frame protections, origin checks.

## 12. Implementation Checklist

1. Build app shell, routing, auth guard, theme/tokens.
2. Implement chat thread + composer + stream renderer.
3. Implement task list/detail with realtime reducer.
4. Implement approval cards/center with exact payload display.
5. Implement browser workspace preview/takeover.
6. Implement integrations/settings pages.
7. Add error boundaries, skeletons, empty/loading states.
8. Add E2E tests for stream ordering, approval, takeover, cancel.

## 13. Acceptance Criteria

- User can distinguish agent running vs waiting vs failed within 1 glance.
- Approval screen shows exact action and cannot approve stale/changed payload.
- Browser preview corresponds to actual controlled session ID.
- Task timeline reconstructs from persisted events after refresh.
- Stop/cancel immediately updates UI after backend acknowledgement.
- UI remains usable on desktop and narrow viewport.



