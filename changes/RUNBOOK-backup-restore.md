# Backup/Restore Runbook (P8 thin slice)

## Scope
- Postgres (Helm DB), browser artifacts dir, vault master key/env, Temporal dev state (optional).

## Backup
1. `docker exec infra-postgres-1 pg_dump -U postgres -d helm -Fc -f /tmp/helm.dump`
2. `docker cp infra-postgres-1:/tmp/helm.dump ./backups/helm-$(date +%F).dump`
3. Copy browser artifacts: `BROWSER_ARTIFACT_DIR` (default worker artifacts dir) and `BROWSER_STATE_DIR`.
4. Securely record `HELM_VAULT_MASTER_KEY`/`ENCRYPTION_KEY`; encrypted vault secrets cannot be restored without it.

## Restore
1. Stop API/worker/browser-worker.
2. `docker exec -i infra-postgres-1 pg_restore -U postgres -d helm --clean --if-exists < backups/helm.dump`
3. Restore artifact/state dirs to same paths.
4. Restore env secrets; start services; verify `/health`, task list, receipts/artifacts.

## Verification
- Task/event/approval/receipt rows present.
- Artifact download resolves.
- Vault-backed connector account status returns token metadata (no secret plaintext).

## Gaps
- No automated scheduled backup; no restore drill evidence yet; no encrypted backup envelope.
