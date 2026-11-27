import { expect, test, type Page } from "@playwright/test";

const API = process.env.HELM_E2E_API_URL ?? "http://127.0.0.1:8787";
const USER = process.env.HELM_E2E_USER_ID ?? "usr_local_dev";

async function api(page: Page, path: string, init?: { method?: string; body?: unknown; headers?: Record<string, string> }) {
  return page.evaluate(async ({ API, USER, path, init }) => {
    const res = await fetch(`${API}${path}`, {
      method: init?.method ?? "GET",
      headers: { "content-type": "application/json", "x-user-id": USER, ...(init?.headers ?? {}) },
      body: init?.body === undefined ? undefined : JSON.stringify(init.body),
    });
    const text = await res.text();
    let json: any = null;
    try { json = JSON.parse(text); } catch {}
    return { status: res.status, json, text };
  }, { API, USER, path, init });
}

test.describe("P1 browser preview/takeover E2E", () => {
  test.skip(process.env.HELM_E2E !== "1", "Set HELM_E2E=1 with running web/api/worker/browser-worker/db stack");

  test("preview renders and takeover/resume updates control state", async ({ page }) => {
    test.setTimeout(180_000);
    const prompt = `e2e takeover ${Date.now()}`;
    const created = await api(page, "/v1/tasks", { method: "POST", body: { prompt, kind: "browser" } });
    expect(created.status).toBe(201);
    const taskId = created.json?.task?.id as string;
    expect(taskId).toBeTruthy();

    const sessionRes = await api(page, "/v1/browser/sessions", { method: "POST", body: { taskId, provider: "playwright", headless: true, viewport: { width: 1280, height: 720 }, initialUrl: "about:blank" } });
    expect(sessionRes.status).toBe(201);
    const sessionId = sessionRes.json?.session?.id as string;
    expect(sessionId).toBeTruthy();

    await page.goto("/");
    await page.getByRole("option", { name: new RegExp(prompt) }).first().click({ timeout: 20_000 });
    await expect(page.getByRole("heading", { name: "Browser preview" })).toBeVisible({ timeout: 20_000 });
    await expect.poll(async () => {
      const r = await api(page, "/v1/browser/sessions");
      const sessions = r.json?.sessions ?? [];
      return sessions.some((s: any) => s.id === sessionId && s.taskId === taskId);
    }, { timeout: 30_000 }).toBe(true);
    await expect(page.locator('img[alt="Browser preview"]')).toBeVisible({ timeout: 45_000 });
    const uiSessionId = (await page.locator('div.card').filter({ has: page.getByRole('heading', { name: 'Browser preview' }) }).locator('span.muted').filter({ hasText: /^bs_/ }).first().textContent({ timeout: 20_000 }))?.trim() || "";
    expect(uiSessionId).toMatch(/^bs_/);
    const activeSessionId = uiSessionId;

    await page.getByRole("button", { name: "Request takeover" }).click();
    await expect.poll(async () => {
      const r = await api(page, `/v1/browser/sessions/${activeSessionId}`);
      return r.json?.session?.control?.owner;
    }, { timeout: 30_000 }).toBe("user");
    await expect(page.getByText("user", { exact: true }).first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/Takeover:/).first()).toBeVisible({ timeout: 20_000 });

    // P3: prove live interactive WS input through web WS proxy during takeover.
    await expect.poll(async () => page.evaluate(() => !!(window as any).__helmWs && (window as any).__helmWs.readyState === 1), { timeout: 30_000 }).toBe(true);
    const sendInput = async (input: Record<string, unknown>) => {
      await page.evaluate((inp) => { (window as any).__helmLastInputResult = null; (window as any).__helmWs.send(JSON.stringify({ type: "input", input: inp })); }, input);
      await expect.poll(async () => page.evaluate(() => (window as any).__helmLastInputResult), { timeout: 20_000 }).toMatchObject({ ok: true });
      return page.evaluate(() => (window as any).__helmLastInputResult);
    };
    await sendInput({ type: "click", x: 100, y: 120 });
    await sendInput({ type: "dblclick", x: 110, y: 130 });
    await sendInput({ type: "move", x: 140, y: 150 });
    await sendInput({ type: "drag", fromX: 140, fromY: 150, toX: 180, toY: 190 });
    await sendInput({ type: "type", text: "helm" });
    await sendInput({ type: "press", key: "Enter" });
    await sendInput({ type: "press", key: "L", modifiers: ["Control"] });
    await sendInput({ type: "keydown", key: "Shift" });
    await sendInput({ type: "keyup", key: "Shift" });
    await sendInput({ type: "scroll", deltaX: 0, deltaY: 120 });
    await sendInput({ type: "wheel", deltaX: 0, deltaY: -60 });

    await page.getByRole("button", { name: "Resume agent" }).click();
    await expect.poll(async () => {
      const r = await api(page, `/v1/browser/sessions/${activeSessionId}`);
      return r.json?.session?.control?.owner;
    }, { timeout: 30_000 }).toBe("agent");
    await expect.poll(async () => {
      const r = await api(page, `/v1/tasks/${taskId}`);
      return ["queued", "running", "planning", "waiting_approval", "waiting_input", "succeeded", "failed", "cancelled"].includes(String(r.json?.task?.status));
    }, { timeout: 30_000 }).toBe(true);

    const events = await api(page, `/v1/tasks/${taskId}/events?after=-1&limit=200`);
    expect(events.status).toBe(200);
    const types = (events.json?.events ?? []).map((e: any) => String(e.type));
    expect(types).toContain("browser.takeover.requested");
    expect(types).toContain("browser.takeover.resumed");
  });
});
