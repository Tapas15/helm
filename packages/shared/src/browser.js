import { z } from "zod";
export const BrowserProvider = z.enum(["playwright", "browseros"]);
export const BrowserSessionStatus = z.enum(["starting", "ready", "takeover", "closed", "error"]);
export const CreateBrowserSessionInput = z.object({
    taskId: z.string().optional(),
    runId: z.string().optional(),
    provider: BrowserProvider.default("playwright"),
    headless: z.boolean().default(true),
    viewport: z.object({ width: z.number().int().min(320).default(1280), height: z.number().int().min(240).default(720) }).default({ width: 1280, height: 720 }),
    initialUrl: z.string().url().optional(),
});
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
});
export const BrowserNavigateInput = z.object({ url: z.string().url() });
export const BrowserClickInput = z.object({ selector: z.string().min(1) });
export const BrowserFillInput = z.object({ selector: z.string().min(1), value: z.string(), submit: z.boolean().default(false) });
export const BrowserScreenshotInput = z.object({ fullPage: z.boolean().default(false) });
export const BrowserActionResult = z.object({
    ok: z.boolean(),
    sessionId: z.string(),
    action: z.string(),
    url: z.string().nullable().optional(),
    title: z.string().nullable().optional(),
    data: z.record(z.unknown()).optional(),
    error: z.object({ code: z.string(), message: z.string(), retryable: z.boolean() }).optional(),
});
//# sourceMappingURL=browser.js.map