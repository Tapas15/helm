import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { vaultSecrets, type Database } from "@helm/db";
import type { CredentialBroker, VaultSecretRef } from "@helm/shared";

const uid = (p: string) => `${p}_${crypto.randomUUID().replace(/-/g, "")}`;

function keyFromEnv(): Buffer {
  const raw = process.env.HELM_VAULT_MASTER_KEY ?? process.env.ENCRYPTION_KEY ?? "dev-vault-master-key-change-me";
  return createHash("sha256").update(raw).digest();
}

export function encryptVaultValue(plain: string): string {
  const key = keyFromEnv();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${iv.toString("base64url")}.${tag.toString("base64url")}.${enc.toString("base64url")}`;
}

export function decryptVaultValue(payload: string): string {
  const [v, ivB64, tagB64, dataB64] = payload.split(".");
  if (v !== "v1" || !ivB64 || !tagB64 || !dataB64) throw new Error("Unsupported vault payload");
  const key = keyFromEnv();
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivB64, "base64url"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64url"));
  const dec = Buffer.concat([decipher.update(Buffer.from(dataB64, "base64url")), decipher.final()]);
  return dec.toString("utf8");
}

export async function getGoogleToken(vault: DbCredentialBroker, userId: string, accountId: string): Promise<Record<string, any> | null> {
  const secretValue = await vault.getSecretValue({ ownerUserId: userId, provider: "google", name: `google-oauth:${accountId}` });
  if (!secretValue) return null;
  try { return JSON.parse(secretValue) as Record<string, any>; } catch { return null; }
}

export async function saveGoogleToken(vault: DbCredentialBroker, userId: string, accountId: string, token: Record<string, any>, metadata?: Record<string, unknown>) {
  await vault.putSecret({ ownerUserId: userId, provider: "google", name: `google-oauth:${accountId}`, value: JSON.stringify(token), metadata });
}

export class DbCredentialBroker implements CredentialBroker {
  constructor(private db: Database) {}

  async putSecret(input: { ownerUserId: string; provider: string; name: string; value: string; metadata?: Record<string, unknown> }): Promise<VaultSecretRef> {
    const existing = await this.db.select().from(vaultSecrets).where(and(eq(vaultSecrets.userId, input.ownerUserId), eq(vaultSecrets.provider, input.provider), eq(vaultSecrets.name, input.name), isNull(vaultSecrets.revokedAt))).limit(1);
    const now = new Date();
    if (existing[0]) {
      const current = existing[0];
      const [row] = await this.db.update(vaultSecrets).set({
        encryptedValue: encryptVaultValue(input.value),
        version: (current.version ?? 1) + 1,
        rotatedAt: now,
        metadata: { ...(current.metadata as Record<string, unknown> ?? {}), ...(input.metadata ?? {}) },
      }).where(eq(vaultSecrets.id, current.id)).returning();
      if (!row) throw new Error("Failed to rotate vault secret");
      return { id: row.id, ownerUserId: row.userId, provider: row.provider, name: row.name, version: row.version, createdAt: row.createdAt.toISOString() };
    }
    const id = uid("vsec");
    const [row] = await this.db.insert(vaultSecrets).values({
      id, userId: input.ownerUserId, provider: input.provider, name: input.name, version: 1,
      encryptedValue: encryptVaultValue(input.value), keyId: "local-master-v1", metadata: input.metadata ?? {}, createdAt: now,
    }).returning();
    if (!row) throw new Error("Failed to create vault secret");
    return { id: row.id, ownerUserId: row.userId, provider: row.provider, name: row.name, version: row.version, createdAt: row.createdAt.toISOString() };
  }

  async getSecretRef(input: { ownerUserId: string; provider: string; name: string }): Promise<VaultSecretRef | null> {
    const [row] = await this.db.select().from(vaultSecrets).where(and(eq(vaultSecrets.userId, input.ownerUserId), eq(vaultSecrets.provider, input.provider), eq(vaultSecrets.name, input.name), isNull(vaultSecrets.revokedAt))).limit(1);
    if (!row) return null;
    return { id: row.id, ownerUserId: row.userId, provider: row.provider, name: row.name, version: row.version, createdAt: row.createdAt.toISOString() };
  }

  async getSecretValue(input: { ownerUserId: string; provider: string; name: string }): Promise<string | null> {
    const [row] = await this.db.select().from(vaultSecrets).where(and(eq(vaultSecrets.userId, input.ownerUserId), eq(vaultSecrets.provider, input.provider), eq(vaultSecrets.name, input.name), isNull(vaultSecrets.revokedAt))).limit(1);
    if (!row) return null;
    return decryptVaultValue(row.encryptedValue);
  }

  async revokeSecret(input: { ownerUserId: string; secretId: string; reason?: string }): Promise<{ ok: boolean }> {
    const [row] = await this.db.select().from(vaultSecrets).where(and(eq(vaultSecrets.id, input.secretId), eq(vaultSecrets.userId, input.ownerUserId), isNull(vaultSecrets.revokedAt))).limit(1);
    if (!row) return { ok: false };
    await this.db.update(vaultSecrets).set({ revokedAt: new Date(), metadata: { ...(row.metadata as Record<string, unknown> ?? {}), revokeReason: input.reason ?? null } }).where(eq(vaultSecrets.id, row.id));
    return { ok: true };
  }
}
