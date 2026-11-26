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

test.describe("P1 UI smoke", () => {
  test.skip(process.env.HELM_E2E !== "1", "Set HELM_E2E=1 with running web/api/worker/db stack");

  test("create task, export, and delete flow", async ({ page }) => {
    test.setTimeout(120_000);
    const prompt = `e2e smoke task ${Date.now()}`;
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Helm" })).toBeVisible();

    await page.getByLabel("Task prompt").fill(prompt);
    await page.getByLabel("Send message").click();

    const taskOption = page.getByRole("option", { name: new RegExp(prompt) }).first();
    await expect(taskOption).toBeVisible({ timeout: 20_000 });
    await taskOption.click();
    await expect(page.getByLabel(/Task status /)).toBeVisible({ timeout: 20_000 });

    const downloadPromise = page.waitForEvent("download");
    await page.getByLabel("Export task").click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toContain("helm-task-");

    page.once("dialog", (d) => d.accept());
    await page.getByLabel("Delete task").click();
    await expect(page.getByRole("option", { name: new RegExp(prompt) })).toHaveCount(0, { timeout: 20_000 });
  });

  test("approval approve/reject controls render when pending approvals exist", async ({ page }) => {
    test.setTimeout(120_000);
    const created = await api(page, "/v1/tasks", { method: "POST", body: { prompt: "e2e approval seed", kind: "assistant" } });
    expect(created.status).toBe(201);
    const taskId = created.json?.task?.id as string;
    expect(taskId).toBeTruthy();

    const seeded = await api(page, `/v1/test/tasks/${taskId}/seed-approval`, { method: "POST", body: { summary: "E2E seeded approval" } });
    expect(seeded.status).toBe(200);
    const approvalId = seeded.json?.approval?.id as string;
    expect(approvalId).toBeTruthy();

    await page.goto("/");
    await page.getByText("e2e approval seed").first().click({ timeout: 20_000 });
    const approvals = page.getByLabel("Approvals");
    await expect(approvals).toBeVisible();
    const card = approvals.locator("div").filter({ hasText: approvalId }).first();
    await expect(card).toBeVisible({ timeout: 20_000 });
    await expect(card.getByRole("button", { name: /^Approve\b/ })).toBeVisible();
    await expect(card.getByRole("button", { name: /^Reject\b/ })).toBeVisible();
  });

  test("task control actions execute across pause/resume/cancel/retry states", async ({ page }) => {
    test.setTimeout(120_000);
    const prompt = `e2e controls ${Date.now()}`;
    const created = await api(page, "/v1/tasks", { method: "POST", body: { prompt, kind: "assistant" } });
    expect(created.status).toBe(201);
    const taskId = created.json?.task?.id as string;
    expect(taskId).toBeTruthy();

    const waitStatus = async (expected: string[], timeout = 20_000) => {
      await expect.poll(async () => {
        const res = await api(page, `/v1/tasks/${taskId}`);
        const status = String(res.json?.task?.status ?? "");
        return expected.includes(status);
      }, { timeout }).toBe(true);
    };

    await page.goto("/");
    await page.getByText(prompt).first().click({ timeout: 20_000 });

    await api(page, `/v1/test/tasks/${taskId}/set-status`, { method: "POST", body: { status: "running" } });
    await page.reload();
    await page.getByText(prompt).first().click({ timeout: 20_000 });
    await expect(page.getByLabel("pause task")).toBeVisible({ timeout: 20_000 });
    await page.getByLabel("pause task").click();
    await waitStatus(["paused"]);
    await expect(page.getByLabel(/Task status paused/)).toBeVisible({ timeout: 20_000 });
    await expect(page.getByLabel("resume task")).toBeVisible();
    await page.getByLabel("resume task").click();
    await waitStatus(["queued", "running", "succeeded", "failed", "waiting_approval", "waiting_input", "paused"]);

    await api(page, `/v1/test/tasks/${taskId}/set-status`, { method: "POST", body: { status: "running" } });
    await page.reload();
    await page.getByText(prompt).first().click({ timeout: 20_000 });
    await expect(page.getByLabel(/Task status running/)).toBeVisible({ timeout: 20_000 });
    await expect(page.getByLabel("cancel task")).toBeVisible({ timeout: 20_000 });
    await page.getByLabel("cancel task").click();
    await waitStatus(["cancelled"]);
    await expect(page.getByLabel(/Task status cancelled/)).toBeVisible({ timeout: 20_000 });

    await api(page, `/v1/test/tasks/${taskId}/set-status`, { method: "POST", body: { status: "failed" } });
    await page.reload();
    await page.getByText(prompt).first().click({ timeout: 20_000 });
    await expect(page.getByLabel("retry task")).toBeVisible({ timeout: 20_000 });
    await page.getByLabel("retry task").click();
    await waitStatus(["queued", "running", "succeeded", "failed", "waiting_approval", "waiting_input"]);
  });

  test("approval resolve actions execute for seeded pending approvals", async ({ page }) => {
    test.setTimeout(120_000);
    const created = await api(page, "/v1/tasks", { method: "POST", body: { prompt: "e2e approval actions", kind: "assistant" } });
    expect(created.status).toBe(201);
    const taskId = created.json?.task?.id as string;
    expect(taskId).toBeTruthy();

    const approveSeed = await api(page, `/v1/test/tasks/${taskId}/seed-approval`, { method: "POST", body: { summary: "Approve me" } });
    expect(approveSeed.status).toBe(200);
    const approveId = approveSeed.json?.approval?.id as string;
    await page.goto("/");
    await page.getByText("e2e approval actions").first().click({ timeout: 20_000 });
    const approvals = page.getByLabel("Approvals");
    await expect(approvals.locator("div").filter({ hasText: approveId }).first()).toBeVisible({ timeout: 20_000 });
    await approvals.locator("div").filter({ hasText: approveId }).first().getByRole("button", { name: /^Approve\b/ }).click();
    await expect(approvals.locator("div").filter({ hasText: approveId })).toHaveCount(0, { timeout: 20_000 });

    const rejectSeed = await api(page, `/v1/test/tasks/${taskId}/seed-approval`, { method: "POST", body: { summary: "Reject me" } });
    expect(rejectSeed.status).toBe(200);
    const rejectId = rejectSeed.json?.approval?.id as string;
    await page.reload();
    await page.getByText("e2e approval actions").first().click({ timeout: 20_000 });
    const approvals2 = page.getByLabel("Approvals");
    await expect(approvals2.locator("div").filter({ hasText: rejectId }).first()).toBeVisible({ timeout: 20_000 });
    await approvals2.locator("div").filter({ hasText: rejectId }).first().getByRole("button", { name: /^Reject\b/ }).click();
    await expect(approvals2.locator("div").filter({ hasText: rejectId })).toHaveCount(0, { timeout: 20_000 });
  });
});

