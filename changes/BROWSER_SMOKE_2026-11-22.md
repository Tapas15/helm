# Browser Worker Smoke Test

Manual smoke (2026-11-22, Playwright chromium-headless-shell installed):

1. Start: `pnpm --filter @helm/browser-worker dev`
2. `GET /health` -> `{"ok":true,"service":"helm-browser-worker","provider":"playwright"}`
3. `POST /v1/sessions` `{headless:true, initialUrl:"https://example.com"}` -> ready session, `title:"Example Domain"`
4. `POST /v1/sessions/:id/snapshot` -> `ok:true`, text contains "This domain is for use..."
5. `POST /v1/sessions/:id/screenshot` `{fullPage:false}` -> `ok:true`, `mime:image/png`, base64Len 47312
6. `POST /v1/sessions/:id/close` -> `ok:true`

Status: PASS (local). Automated test/script pending.
