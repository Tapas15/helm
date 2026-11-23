import { z } from "zod";

export const AuthSession = z.object({
  id: z.string(),
  userId: z.string(),
  createdAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
  revokedAt: z.string().datetime().nullable().default(null),
  lastSeenAt: z.string().datetime().nullable().default(null),
  userAgent: z.string().nullable().default(null),
  ipHash: z.string().nullable().default(null),
});
export type AuthSession = z.infer<typeof AuthSession>;

export const CreateAuthSessionInput = z.object({
  userId: z.string().min(1),
  ttlHours: z.number().int().min(1).max(24 * 30).default(24 * 7),
  userAgent: z.string().max(500).optional(),
  ipHash: z.string().max(200).optional(),
});
export type CreateAuthSessionInput = z.infer<typeof CreateAuthSessionInput>;

export const AuthContext = z.object({
  userId: z.string(),
  sessionId: z.string().nullable().default(null),
  method: z.enum(["dev_header", "session_token", "system"]),
});
export type AuthContext = z.infer<typeof AuthContext>;
