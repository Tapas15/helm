import { z } from "zod";

export const IdentityClass = z.enum(["helm-owned", "user-delegated"]);
export type IdentityClass = z.infer<typeof IdentityClass>;

export const IdentityRef = z.object({
  id: z.string(),
  userId: z.string(),
  class: IdentityClass,
  label: z.string().min(1).max(200),
  email: z.string().email().optional(),
  provider: z.string().optional(),
  scopes: z.array(z.string()).default([]),
  status: z.enum(["active", "revoked", "pending"]).default("pending"),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type IdentityRef = z.infer<typeof IdentityRef>;

export const IdentityPolicy = z.object({
  identityId: z.string(),
  allowedDomains: z.array(z.string()).default([]),
  allowedRecipients: z.array(z.string()).default([]),
  allowExternalWrites: z.boolean().default(false),
  requireApproval: z.boolean().default(true),
});
export type IdentityPolicy = z.infer<typeof IdentityPolicy>;
