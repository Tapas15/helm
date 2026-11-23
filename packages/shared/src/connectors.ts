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
  putSecret(input: { ownerUserId: string; provider: string; name: string; value: string; metadata?: Record<string, unknown> }): Promise<VaultSecretRef>;
  getSecretRef(input: { ownerUserId: string; provider: string; name: string }): Promise<VaultSecretRef | null>;
  getSecretValue(input: { ownerUserId: string; provider: string; name: string }): Promise<string | null>;
  revokeSecret(input: { ownerUserId: string; secretId: string; reason?: string }): Promise<{ ok: boolean }>;
}

export const ConnectorKind = z.enum(["oauth", "api_key", "webhook"]);
export type ConnectorKind = z.infer<typeof ConnectorKind>;

export const ConnectorDefinition = z.object({
  id: z.string(),
  kind: ConnectorKind,
  displayName: z.string(),
  capabilities: z.array(z.string()).default([]),
  scopes: z.array(z.string()).default([]),
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

export const OAuthStartInput = z.object({
  connectorId: z.string().min(1),
  scopes: z.array(z.string().min(1)).default([]),
  redirectUri: z.string().url().optional(),
});
export type OAuthStartInput = z.infer<typeof OAuthStartInput>;

export const GmailSendInput = z.object({
  accountId: z.string().min(1),
  to: z.array(z.string().email()).min(1),
  subject: z.string().min(1).max(500),
  bodyText: z.string().min(1).max(20000),
  idempotencyKey: z.string().min(1).max(200),
  approvalId: z.string().min(1),
  actionHash: z.string().min(1),
});
export type GmailSendInput = z.infer<typeof GmailSendInput>;

export const CalendarCreateEventInput = z.object({
  accountId: z.string().min(1),
  calendarId: z.string().min(1).default("primary"),
  summary: z.string().min(1).max(500),
  description: z.string().max(5000).optional(),
  startIso: z.string().datetime(),
  endIso: z.string().datetime(),
  timeZone: z.string().max(100).optional(),
  attendees: z.array(z.string().email()).max(20).default([]),
  idempotencyKey: z.string().min(1).max(200),
  approvalId: z.string().min(1),
  actionHash: z.string().min(1),
});
export type CalendarCreateEventInput = z.infer<typeof CalendarCreateEventInput>;
