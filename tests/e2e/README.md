# Helm E2E (Playwright)

## Prereqs
- Stack running: Postgres, API, worker, web (browser-worker optional for preview/takeover smoke).
- Install deps: `pnpm install`
- Install browser: `pnpm --filter @helm/e2e-tests install:browsers`

## Run
```powershell
$env:HELM_E2E="1"
$env:HELM_E2E_BASE_URL="http://127.0.0.1:5173"
$env:HELM_E2E_API_URL="http://127.0.0.1:8787"
$env:HELM_E2E_USER_ID="usr_local_dev"
pnpm --filter @helm/e2e-tests test
```

## Coverage
- `sse-reconnect.spec.ts`: drops active `EventSource`, verifies stale/offline then live recovery, checks sequence monotonicity/no duplicates and reconnect `after=` cursor.
- `ui-smoke.spec.ts`: basic create/export/delete and control/approval panel smoke. Approval/retry/pause/resume/cancel/preview/takeover full-state coverage requires deterministic fixture env or seeded tasks.

## Notes
- Tests are skipped unless `HELM_E2E=1`.
- Delete smoke requires `HELM_ALLOW_TASK_DELETE=1` on API.
- Not a replacement for manual visual evidence; attach Playwright report/screenshots/traces when closing P1 blockers.
