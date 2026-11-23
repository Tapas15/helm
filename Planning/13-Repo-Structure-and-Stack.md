# 13 - Repository Structure and Tech Stack

## 1. Monorepo Layout

```text
personal-assistant/
├── apps/
│   ├── web/                    # OpenFUSE-style React UI
│   ├── api/                    # Control plane API + WS
│   ├── worker/                 # Task/Temporal activity worker
│   ├── browser-worker/         # Playwright/BrowserOS executor
│   ├── computer-worker/        # Sandbox command/file/desktop
│   └── desktop/                # Optional Tauri shell
├── packages/
│   ├── shared/                 # types, schemas, event contracts
│   ├── db/                     # Prisma/Drizzle schema, migrations
│   ├── policy/                 # Sentinel rules, risk engine
│   ├── connectors/             # connector manifests/adapters
│   ├── model-adapters/         # OpenAI/Anthropic/local/Hermes adapters
│   ├── browser-core/           # BrowserExecutionProvider + playbooks
│   ├── workflows/              # Temporal workflows/activities
│   └── observability/          # logger, otel, redaction
├── infra/
│   ├── docker-compose.yml
│   ├── docker/
│   ├── k8s/                    # optional later
│   └── terraform/              # optional later
├── tests/
│   ├── unit/
│   ├── integration/
│   ├── e2e/
│   ├── security/
│   └── fixtures/
├── docs/
│   └── adr/
├── .env.example
├── package.json / pnpm-workspace.yaml
└── turbo.json
```

## 2. Recommended Stack

| Layer | Choice | Rationale |
|---|---|---|
| Language | TypeScript (Node 22+) | matches OpenFUSE patterns, fast iteration |
| Frontend | React + Vite + Tailwind + Radix/shadcn | OpenFUSE-style UI, accessible |
| State/data | TanStack Query + Zustand | server state + local UI |
| API | Hono or Fastify | lightweight, typed, fast |
| WS/realtime | ws / Socket.IO / SSE | event stream |
| DB | PostgreSQL 16 | durable, relational, pgvector option |
| ORM | Drizzle or Prisma | typed schema/migrations |
| Queue/cache | Redis | pubsub, rate limits, lightweight jobs |
| Durable workflows | Temporal | required for no-silent-fail execution |
| Object storage | MinIO (dev) / S3 | artifacts/screenshots |
| Browser | Playwright + BrowserOS adapter | fallback + deterministic capability |
| Sandbox | Docker | computer worker isolation |
| Auth | Lucia/Auth.js/custom local session | single-user MVP |
| Secrets | Vault/SOPS/OS keychain adapter | no plaintext secrets |
| Observability | OpenTelemetry + Pino + Prometheus/Grafana | traces/metrics/logs |
| Testing | Vitest + Playwright + Testcontainers | full pyramid |
| Monorepo | pnpm + Turborepo | fast builds/caching |

## 3. Key Dependencies

```json
{
  "dependencies": {
    "hono": "...",
    "zod": "...",
    "drizzle-orm": "...",
    "pg": "...",
    "ioredis": "...",
    "@temporalio/client": "...",
    "@temporalio/worker": "...",
    "playwright": "...",
    "pino": "...",
    "@opentelemetry/api": "...",
    "jose": "..."
  }
}
```

## 4. Environment Variables

```env
# Core
NODE_ENV=development
PORT=8787
PUBLIC_URL=http://localhost:8787
DATABASE_URL=postgres://...
REDIS_URL=redis://...
OBJECT_STORE_ENDPOINT=...
OBJECT_STORE_BUCKET=...

# Auth/Security
SESSION_SECRET=...
ENCRYPTION_KEY=...
VAULT_ADDR=...

# Models
OPENAI_API_KEY=
ANTHROPIC_API_KEY=
OLLAMA_BASE_URL=http://localhost:11434

# Hermes
HERMES_URL=http://localhost:8080
HERMES_TOKEN=

# Browser
BROWSER_WORKER_URL=http://localhost:8790
BROWSER_WORKER_TOKEN=

# Temporal
TEMPORAL_ADDRESS=localhost:7233
TEMPORAL_NAMESPACE=default
TEMPORAL_TASK_QUEUE=assistant-main

# Connectors
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=
```

## 5. Docker Compose (Dev)

Services:
- `postgres`
- `redis`
- `minio`
- `temporal` + `temporal-ui` + `temporal-postgres` (or dev server)
- `api`
- `worker`
- `browser-worker`
- `web`
- `hermes` (sidecar, when available)

## 6. CI/CD Pipeline

```yaml
# .github/workflows/ci.yml
- lint
- typecheck
- unit
- integration (testcontainers)
- build
- e2e (nightly/release)
- security scan (deps/container/sast)
- docker image build/push
```

Release: semantic versioning, changelog, migration check, rollback artifact.

## 7. Coding Standards

- Zod schemas at boundaries; infer TS types.
- No `any` in core contracts.
- All external actions return typed `ActionResult`/receipt.
- Errors mapped to stable codes.
- Redaction middleware mandatory.
- ADR for boundary/security changes.

## 8. Local Dev Quickstart

```bash
pnpm install
cp .env.example .env
docker compose up -d postgres redis minio temporal
pnpm db:migrate
pnpm dev
# web: http://localhost:5173
# api: http://localhost:8787
# temporal ui: http://localhost:8088
```

## 9. Migration from OpenFUSE Demo

Reusable patterns from `Demo/openfuse`:
- Task domain model and status enums.
- DB lease worker compare-and-swap.
- Action proposal hash/expiry/uncertain outcome handling.
- Browser worker token auth and session preview model.
- Chat inline card UX.

Replace/upgrade:
- PGlite-first -> Postgres-first.
- In-process worker reliability -> Temporal for durable flows.
- Sample/model CopilotKit agent -> Hermes adapter + policy gateway.
- Ad hoc connector logic -> manifest-driven connector workers.
