# Helm — Premium White UI Design System

**Status:** Planning baseline (UI direction)  
**Date:** 2026-11-23  
**Applies to:** `frontend/web`, future desktop/mobile shells, and all Helm product surfaces  
**Related:** `Planning/03-Frontend-OpenFUSE-UI.md`, `changes/PLANNING_MISSING_ITEMS.md`, `ROADMAP.md`

## Intent

Create an original, premium, minimalist white interface inspired by the usability and visual simplicity of Muse. Helm must feel like a polished, premium personal AI application rather than a conventional developer dashboard.

**Originality constraint:** Maintain an original Helm design system. Do not copy Muse's source code, proprietary assets, branding, or exact layouts.

## Visual Identity

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

## Design Principles

- **Calm, premium, evidence-first.** The UI should feel confident and quiet, not noisy or "developer-tool" dense.
- **White-space discipline.** Spacing and hierarchy do the work; avoid heavy containers and dark chrome.
- **Operational clarity.** Agent activity, approvals, browser state, and receipts remain visible and trustworthy.
- **Original Helm identity.** Inspired by Muse usability/simplicity only; no copied assets, branding, or exact layouts.

## Interaction Requirements

- Smooth page transitions.
- Animated expandable panels.
- Resizable three-panel workspace.
- Interactive chat cards.
- Live agent activity.
- Interactive task timelines.
- Drag-and-drop agent workflows.
- Browser preview and takeover.
- Approval dialogs.
- Contextual menus and popovers.
- Responsive mobile navigation.
- Keyboard shortcuts and command palette.

## Technology Stack

- React + Vite
- TypeScript
- Tailwind CSS v4
- shadcn/ui + Radix UI
- Motion
- Zustand
- TanStack Query
- React Flow
- Tiptap
- dnd-kit
- Recharts
- WebSockets + SSE

## Surface Coverage

White UI must remain consistent across:
- Chat
- Agents
- Computer control
- Approvals
- Workflows
- Settings

## Implementation Notes

- Build a Helm design token layer first (color, type, spacing, radius, shadow, motion, z-index).
- Use shadcn/ui + Radix primitives for accessible base components; style with Helm tokens.
- Keep execution truth backend-driven; animations never imply unconfirmed state.
- Add keyboard/command palette (`Cmd/Ctrl+K`) and responsive nav early.
- Treat browser preview, approvals, and timeline evidence as first-class premium surfaces, not debug panels.
