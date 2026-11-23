import { z } from "zod";

export const BrowserProvider = z.enum(["playwright", "browseros"]);
export type BrowserProvider = z.infer<typeof BrowserProvider>;

export const BrowserSessionStatus = z.enum(["starting", "ready", "takeover", "closed", "error"]);
export type BrowserSessionStatus = z.infer<typeof BrowserSessionStatus>;

export const BrowserControlState = z.object({
  owner: z.enum(["agent", "user"]).default("agent"),
  takeoverReason: z.string().nullable().default(null),
  takeoverRequestedAt: z.string().datetime().nullable().default(null),
  resumedAt: z.string().datetime().nullable().default(null),
});
export type BrowserControlState = z.infer<typeof BrowserControlState>;

export const CreateBrowserSessionInput = z.object({
  taskId: z.string().optional(),
  runId: z.string().optional(),
  provider: BrowserProvider.default("playwright"),
  headless: z.boolean().default(true),
  viewport: z.object({ width: z.number().int().min(320).default(1280), height: z.number().int().min(240).default(720) }).default({ width: 1280, height: 720 }),
  initialUrl: z.string().url().optional(),
});
export type CreateBrowserSessionInput = z.infer<typeof CreateBrowserSessionInput>;

export const BrowserSession = z.object({
  id: z.string(),
  provider: BrowserProvider,
  status: BrowserSessionStatus,
  taskId: z.string().nullable(),
  runId: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  currentUrl: z.string().nullable(),
  title: z.string().nullable(),
  headless: z.boolean(),
  control: BrowserControlState.default({ owner: "agent", takeoverReason: null, takeoverRequestedAt: null, resumedAt: null }),
  lastScreenshotAt: z.string().datetime().nullable().default(null),
});
export type BrowserSession = z.infer<typeof BrowserSession>;

export const BrowserActionGuard = z.object({
  approvalId: z.string().min(1),
  actionHash: z.string().min(1),
  idempotencyKey: z.string().min(1),
});
export type BrowserActionGuard = z.infer<typeof BrowserActionGuard>;

export const BrowserNavigateInput = z.object({ url: z.string().url() });
export const BrowserClickInput = z.object({ selector: z.string().min(1) });
export const BrowserFillInput = z.object({ selector: z.string().min(1), value: z.string(), submit: z.boolean().default(false) });
export const BrowserScreenshotInput = z.object({ fullPage: z.boolean().default(false) });
export const BrowserTakeoverInput = z.object({ reason: z.string().min(1).max(500) });
export const BrowserResumeInput = z.object({ note: z.string().max(500).optional() });
export const BrowserExternalActionInput = z.object({
  action: z.enum(["submit", "purchase", "checkout", "payment", "send_email", "delete"]),
  actionHash: z.string().min(1),
  idempotencyKey: z.string().min(1),
  approvalId: z.string().min(1),
  selector: z.string().optional(),
  metadata: z.record(z.unknown()).default({}),
});

export const BrowserActionResult = z.object({
  ok: z.boolean(),
  sessionId: z.string(),
  action: z.string(),
  url: z.string().nullable().optional(),
  title: z.string().nullable().optional(),
  data: z.record(z.unknown()).optional(),
  error: z.object({ code: z.string(), message: z.string(), retryable: z.boolean() }).optional(),
});
export type BrowserActionResult = z.infer<typeof BrowserActionResult>;

export interface BrowserExecutor {
  createSession(input: CreateBrowserSessionInput): Promise<BrowserSession>;
  listSessions?(): Promise<BrowserSession[]>;
  getSession(sessionId: string): Promise<BrowserSession | null>;
  navigate(sessionId: string, input: z.infer<typeof BrowserNavigateInput>): Promise<BrowserActionResult>;
  click(sessionId: string, input: z.infer<typeof BrowserClickInput>): Promise<BrowserActionResult>;
  fill(sessionId: string, input: z.infer<typeof BrowserFillInput>): Promise<BrowserActionResult>;
  snapshot(sessionId: string): Promise<BrowserActionResult>;
  screenshot(sessionId: string, input: z.infer<typeof BrowserScreenshotInput>): Promise<BrowserActionResult>;
  closeSession(sessionId: string): Promise<BrowserActionResult>;
  requestTakeover?(sessionId: string, input: z.infer<typeof BrowserTakeoverInput>): Promise<BrowserActionResult>;
  resumeAgent?(sessionId: string, input: z.infer<typeof BrowserResumeInput>): Promise<BrowserActionResult>;
  externalAction?(sessionId: string, input: z.infer<typeof BrowserExternalActionInput>): Promise<BrowserActionResult>;
}
