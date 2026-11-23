import { z } from "zod";

export const VaultSecretRef = z.object({
  id: z.string(),
  ownerUserId: z.string(),
  provider: z.string(),
  name: z.string(),
  version: z.number().int().nonnegative().default(1),
  createdAt: z.string().datetime(),
});
export type VaultSecretRef = z.infer<typeof VaultSecretRef>;

export interface CredentialBroker {
  putSecret(input: { ownerUserId: string; provider: string; name: string; value: string }): Promise<VaultSecretRef>;
  getSecretRef(input: { ownerUserId: string; provider: string; name: string }): Promise<VaultSecretRef | null>;
  revokeSecret(input: { ownerUserId: string; secretId: string; reason?: string }): Promise<{ ok: boolean }>;
}

export const ConnectorKind = z.enum(["oauth", "api_key", "webhook"]);
export type ConnectorKind = z.infer<typeof ConnectorKind>;

export const ConnectorDefinition = z.object({
  id: z.string(),
  kind: ConnectorKind,
  displayName: z.string(),
  capabilities: z.array(z.string()).default([]),
  enabled: z.boolean().default(false),
});
export type ConnectorDefinition = z.infer<typeof ConnectorDefinition>;

export const ConnectorAccount = z.object({
  id: z.string(),
  userId: z.string(),
  connectorId: z.string(),
  status: z.enum(["pending", "active", "revoked", "error"]).default("pending"),
  secretRefId: z.string().nullable().default(null),
  scopes: z.array(z.string()).default([]),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type ConnectorAccount = z.infer<typeof ConnectorAccount>;
