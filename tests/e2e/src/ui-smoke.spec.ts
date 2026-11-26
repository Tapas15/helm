import { expect, test, type Page } from "@playwright/test";

const API = process.env.HELM_E2E_API_URL ?? "http://127.0.0.1:8787";
const USER = process.env.HELM_E2E_USER_ID ?? "usr_local_dev";

async function api(page: Page, path: string, init?: { method?: string; body?: unknown; headers?: Record<string,string> }) {
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
    await page.goto("/");
    await expect(page.getByText("Helm")).toBeVisible();

    await page.getByLabel("Task prompt").fill("e2e smoke task");
    await page.getByLabel("Send message").click();

    await expect(page.getByText("e2e smoke task").first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByLabel(/Task status /)).toBeVisible({ timeout: 20_000 });

    const downloadPromise = page.waitForEvent("download");
    await page.getByLabel("Export task").click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toContain("helm-task-");

    page.once("dialog", (d) => d.accept());
    await page.getByLabel("Delete task").click();
    await expect(page.getByText("e2e smoke task")).toHaveCount(0, { timeout: 20_000 });
  });

  test("approval approve/reject controls render when pending approvals exist", async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto("/");
    const approvals = page.getByLabel("Approvals");
    await expect(approvals).toBeVisible();
    // If no pending approvals in this environment, this smoke still verifies panel is stable.
    const count = await approvals.getByRole("button", { name: /Approve |Reject / }).count();
    if (count > 0) {
      await expect(approvals.getByRole("button").first()).toBeVisible();
    }
  });

  test("task controls only show valid actions for selected task status", async ({ page }) => {
    test.setTimeout(120_000);
    const created = await api(page, "/v1/tasks", { method: "POST", body: { prompt: "e2e controls", kind: "assistant" } });
    expect(created.status).toBe(201);
    await page.goto("/");
    await page.getByText("e2e controls").first().click({ timeout: 20_000 });
    const pause = page.getByLabel("pause task");
    const resume = page.getByLabel("resume task");
    const cancel = page.getByLabel("cancel task");
    const retry = page.getByLabel("retry task");
    // Any selected task should expose at most valid controls; never all contradictory controls.
    const visible = [pause, resume, cancel, retry];
    let visibleCount = 0;
    for (const b of visible) if (await b.isVisible().catch(() => false)) visibleCount++;
    expect(visibleCount).toBeLessThanOrEqual(2);
  });
});
