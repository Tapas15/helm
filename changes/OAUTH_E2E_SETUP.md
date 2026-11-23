# OAuth E2E Setup (Google Gmail + Calendar)

## Required env
Set in `.env` (local, not committed):
- `GOOGLE_CLIENT_ID=...`
- `GOOGLE_CLIENT_SECRET=...`
- `GOOGLE_REDIRECT_URI=http://localhost:8787/v1/connectors/google/callback`
- `WEB_URL=http://localhost:5173`
- `HELM_VAULT_MASTER_KEY=<stable secret>` (required to decrypt stored tokens across restarts)

## Google Cloud setup
1. Create/select a Google Cloud project.
2. Enable APIs: **Gmail API**, **Google Calendar API**.
3. Configure OAuth consent screen (External for personal testing; add your Google account as test user).
4. Create OAuth Client ID type **Web application**.
5. Add Authorized redirect URI: `http://localhost:8787/v1/connectors/google/callback`.
6. Copy client ID/secret into `.env`.

## Local run
```powershell
# infra (if not running)
docker compose -f infra/docker-compose.yml up -d
# api
pnpm --filter @helm/api dev
# web
pnpm --filter @helm/web dev
# worker (for approval-gated task flows)
pnpm --filter @helm/worker dev
```

## E2E checklist
1. Open `http://localhost:5173`, sign in/create session.
2. Connectors panel: click **Connect** for Gmail/Calendar; complete Google consent.
3. Verify callback redirects to web with `?oauth=success...`; account appears active with scopes/refresh/expiry.
4. Click **Test** on Gmail account (expects profile response) and Calendar account (expects calendar count).
5. Click **Read events** on Calendar account (expects events JSON).
6. Gmail send (approval-gated): create task producing approval for `gmail.send`; approve; call `POST /v1/connectors/gmail/send` with `approvalId`, matching `actionHash`, `idempotencyKey`; verify receipt executed/uncertain handling.
7. Calendar create (approval-gated): call `POST /v1/connectors/calendar/events/create` with approval/actionHash/idempotency; verify receipt/externalRef; test uncertain reconcile endpoint.

## Troubleshooting
- `GOOGLE_CLIENT_ID not configured` / `Google OAuth client not configured`: check `.env` and restart API.
- `OAuth state not found/expired`: restart flow; state TTL is 10 min.
- `missing_refresh_token`: re-connect with consent; Google may omit refresh token on repeat consent without prompt (we request `prompt=consent access_type=offline`).
- `tokenExpired` but refresh fails: verify client secret, refresh token present, account not revoked.
- Callback lands on JSON page: ensure latest API deployed with `WEB_URL` redirect.
