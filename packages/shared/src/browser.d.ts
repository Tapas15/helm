import { z } from "zod";
export declare const BrowserProvider: z.ZodEnum<["playwright", "browseros"]>;
export type BrowserProvider = z.infer<typeof BrowserProvider>;
export declare const BrowserSessionStatus: z.ZodEnum<["starting", "ready", "takeover", "closed", "error"]>;
export type BrowserSessionStatus = z.infer<typeof BrowserSessionStatus>;
export declare const CreateBrowserSessionInput: z.ZodObject<{
    taskId: z.ZodOptional<z.ZodString>;
    runId: z.ZodOptional<z.ZodString>;
    provider: z.ZodDefault<z.ZodEnum<["playwright", "browseros"]>>;
    headless: z.ZodDefault<z.ZodBoolean>;
    viewport: z.ZodDefault<z.ZodObject<{
        width: z.ZodDefault<z.ZodNumber>;
        height: z.ZodDefault<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        width: number;
        height: number;
    }, {
        width?: number | undefined;
        height?: number | undefined;
    }>>;
    initialUrl: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    provider: "playwright" | "browseros";
    headless: boolean;
    viewport: {
        width: number;
        height: number;
    };
    taskId?: string | undefined;
    runId?: string | undefined;
    initialUrl?: string | undefined;
}, {
    taskId?: string | undefined;
    runId?: string | undefined;
    provider?: "playwright" | "browseros" | undefined;
    headless?: boolean | undefined;
    viewport?: {
        width?: number | undefined;
        height?: number | undefined;
    } | undefined;
    initialUrl?: string | undefined;
}>;
export type CreateBrowserSessionInput = z.infer<typeof CreateBrowserSessionInput>;
export declare const BrowserSession: z.ZodObject<{
    id: z.ZodString;
    provider: z.ZodEnum<["playwright", "browseros"]>;
    status: z.ZodEnum<["starting", "ready", "takeover", "closed", "error"]>;
    taskId: z.ZodNullable<z.ZodString>;
    runId: z.ZodNullable<z.ZodString>;
    createdAt: z.ZodString;
    updatedAt: z.ZodString;
    currentUrl: z.ZodNullable<z.ZodString>;
    title: z.ZodNullable<z.ZodString>;
    headless: z.ZodBoolean;
}, "strip", z.ZodTypeAny, {
    id: string;
    createdAt: string;
    title: string | null;
    status: "starting" | "ready" | "takeover" | "closed" | "error";
    updatedAt: string;
    taskId: string | null;
    runId: string | null;
    provider: "playwright" | "browseros";
    headless: boolean;
    currentUrl: string | null;
}, {
    id: string;
    createdAt: string;
    title: string | null;
    status: "starting" | "ready" | "takeover" | "closed" | "error";
    updatedAt: string;
    taskId: string | null;
    runId: string | null;
    provider: "playwright" | "browseros";
    headless: boolean;
    currentUrl: string | null;
}>;
export type BrowserSession = z.infer<typeof BrowserSession>;
export declare const BrowserNavigateInput: z.ZodObject<{
    url: z.ZodString;
}, "strip", z.ZodTypeAny, {
    url: string;
}, {
    url: string;
}>;
export declare const BrowserClickInput: z.ZodObject<{
    selector: z.ZodString;
}, "strip", z.ZodTypeAny, {
    selector: string;
}, {
    selector: string;
}>;
export declare const BrowserFillInput: z.ZodObject<{
    selector: z.ZodString;
    value: z.ZodString;
    submit: z.ZodDefault<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    value: string;
    selector: string;
    submit: boolean;
}, {
    value: string;
    selector: string;
    submit?: boolean | undefined;
}>;
export declare const BrowserScreenshotInput: z.ZodObject<{
    fullPage: z.ZodDefault<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    fullPage: boolean;
}, {
    fullPage?: boolean | undefined;
}>;
export declare const BrowserActionResult: z.ZodObject<{
    ok: z.ZodBoolean;
    sessionId: z.ZodString;
    action: z.ZodString;
    url: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    title: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    data: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    error: z.ZodOptional<z.ZodObject<{
        code: z.ZodString;
        message: z.ZodString;
        retryable: z.ZodBoolean;
    }, "strip", z.ZodTypeAny, {
        code: string;
        message: string;
        retryable: boolean;
    }, {
        code: string;
        message: string;
        retryable: boolean;
    }>>;
}, "strip", z.ZodTypeAny, {
    sessionId: string;
    action: string;
    ok: boolean;
    data?: Record<string, unknown> | undefined;
    title?: string | null | undefined;
    error?: {
        code: string;
        message: string;
        retryable: boolean;
    } | undefined;
    url?: string | null | undefined;
}, {
    sessionId: string;
    action: string;
    ok: boolean;
    data?: Record<string, unknown> | undefined;
    title?: string | null | undefined;
    error?: {
        code: string;
        message: string;
        retryable: boolean;
    } | undefined;
    url?: string | null | undefined;
}>;
export type BrowserActionResult = z.infer<typeof BrowserActionResult>;
export interface BrowserExecutor {
    createSession(input: CreateBrowserSessionInput): Promise<BrowserSession>;
    getSession(sessionId: string): Promise<BrowserSession | null>;
    navigate(sessionId: string, input: z.infer<typeof BrowserNavigateInput>): Promise<BrowserActionResult>;
    click(sessionId: string, input: z.infer<typeof BrowserClickInput>): Promise<BrowserActionResult>;
    fill(sessionId: string, input: z.infer<typeof BrowserFillInput>): Promise<BrowserActionResult>;
    snapshot(sessionId: string): Promise<BrowserActionResult>;
    screenshot(sessionId: string, input: z.infer<typeof BrowserScreenshotInput>): Promise<BrowserActionResult>;
    closeSession(sessionId: string): Promise<BrowserActionResult>;
}
//# sourceMappingURL=browser.d.ts.map