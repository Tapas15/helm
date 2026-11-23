# Runbook — Helm

## Prerequisites
- Node v22+ (confirmed: v22.19.0)
- pnpm (confirmed: 11.19.0)
- Docker Desktop (confirmed installed: Docker 29.9.3; must be running)

## First-time Setup
```powershell
cd C:\Users\Tapas\Documents\projects\Dubai_competetion_projects\helm
pnpm install
Copy-Item .env.example .env -ErrorAction SilentlyContinue
docker compose -f infra/docker-compose.yml up -d
pnpm db:push
pnpm db:seed
```

## Dev
```powershell
cd C:\Users\Tapas\Documents\projects\Dubai_competetion_projects\helm
pnpm dev   # turbo dev - runs api/worker/browser-worker/web as configured
```

Individual:
```powershell
pnpm --filter @helm/api dev
pnpm --filter @helm/worker dev
pnpm --filter @helm/browser-worker dev
pnpm --filter @helm/web dev
```

## Verify (Phase 0 smoke)
```powershell
# After pnpm dev / services up
Invoke-RestMethod http://localhost:8787/health
$task = Invoke-RestMethod -Method Post -Uri http://localhost:8787/v1/tasks -ContentType 'application/json' -Body '{"prompt":"Smoke test task"}'
$task
Invoke-RestMethod "http://localhost:8787/v1/tasks/$($task.task.id)"
Invoke-RestMethod "http://localhost:8787/v1/tasks/$($task.task.id)/events"
# Wait for worker, then check status becomes succeeded
Start-Sleep -Seconds 5
Invoke-RestMethod "http://localhost:8787/v1/tasks/$($task.task.id)"
```

## Quality Gates
```powershell
pnpm lint        # runs tsc --noEmit across packages (Turbo lint task)
pnpm typecheck
pnpm test
pnpm build
```

## DB
```powershell
pnpm db:generate   # drizzle-kit generate
pnpm db:push       # drizzle-kit push (dev)
pnpm db:migrate    # drizzle-kit migrate
pnpm db:seed       # idempotent seed (usr_local_dev)
```

## CI
- GitHub Actions: `.github/workflows/ci.yml` runs `pnpm install --frozen-lockfile`, then `lint`, `typecheck`, `test`, `build` on Node 22.

## Troubleshooting
- **Docker not running**: start Docker Desktop; rerun compose up.
- **DB connection refused**: ensure postgres container healthy: `docker compose -f infra/docker-compose.yml ps`.
- **pnpm install fails**: delete `node_modules`, `pnpm-lock.yaml` only if necessary; retry.
- **Port conflict**: change PORT/BROWSER_WORKER_PORT/Vite port in env/config.
- **Worker not picking task**: check `DATABASE_URL`, worker logs, task status/lease fields.

## Update Tracker After Every Session
1. `changes/CURRENT_STATE.md` - update snapshot, next move, verification.
2. `changes/SESSION_LOG.md` - append entry at top with commands/results/files/blockers.
3. Active phase file - check off completed, add evidence, remaining.
4. `changes/DECISIONS.md` - add any decisions/assumptions.
