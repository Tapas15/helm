import { expect, test, type Page } from "@playwright/test";

const API = process.env.HELM_E2E_API_URL ?? "http://127.0.0.1:8787";
const USER = process.env.HELM_E2E_USER_ID ?? "usr_local_dev";

async function api(page: Page, path: string, init?: { method?: string; body?: unknown }) {
  return page.evaluate(async ({ API, USER, path, init }) => {
    const res = await fetch(`${API}${path}`, {
      method: init?.method ?? "GET",
      headers: { "content-type": "application/json", "x-user-id": USER },
      body: init?.body === undefined ? undefined : JSON.stringify(init.body),
    });
    const text = await res.text();
    let json: any = null;
    try { json = JSON.parse(text); } catch {}
    return { status: res.status, json, text };
  }, { API, USER, path, init });
}

test.describe("P1 SSE reconnect cursor resume", () => {
  test.skip(process.env.HELM_E2E !== "1", "Set HELM_E2E=1 with running web/api/worker/db stack");

  test("reconnects after stream drop without duplicate/missing sequence events", async ({ page }) => {
    test.setTimeout(120_000);

    const created = await api(page, "/v1/tasks", { method: "POST", body: { prompt: "e2e sse reconnect", kind: "assistant" } });
    expect(created.status).toBe(201);
    const taskId = created.json?.task?.id as string;
    expect(taskId).toBeTruthy();

    await page.goto("/");
    await page.getByRole("option", { name: new RegExp(taskId.slice(0, 8)) }).or(page.getByText(taskId)).first().click({ timeout: 15_000 }).catch(async () => {
      await page.getByText("e2e sse reconnect").first().click({ timeout: 15_000 });
    });

    await expect(page.getByLabel("Event timeline")).toBeVisible();
    await expect(page.getByLabel(/Event stream (live|stale|offline)/)).toBeVisible();

    // Wait for initial events to render
    await expect.poll(async () => page.locator('[aria-label="Event timeline"] strong').count(), { timeout: 20_000 }).toBeGreaterThan(0);

    const readSeqs = async () => page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('[aria-label="Event timeline"] .pill'));
      return rows.map((r) => (r.textContent ?? "").trim()).filter((t) => /^#\d+$/.test(t)).map((t) => Number(t.slice(1)));
    });

    const before = await readSeqs();
    expect(before.length).toBeGreaterThan(0);
    const maxBefore = Math.max(...before);

    // Drop active EventSource connections; hook should set stale/offline and reopen with after=lastSeq.
    await page.evaluate(() => {
      const Original = window.EventSource;
      (window as any).__helmOriginalEventSource = Original;
      (window as any).__helmEsCount = 0;
      (window as any).__helmEsUrls = [];
      // @ts-ignore
      window.EventSource = class extends Original {
        constructor(url: string | URL, init?: EventSourceInit) {
          super(url, init);
          (window as any).__helmEsCount++;
          (window as any).__helmEsUrls.push(String(url));
          setTimeout(() => { try { this.close(); } catch {} try { this.dispatchEvent(new Event("error")); } catch {} }, 150);
        }
      } as any;
    });

    await expect(page.getByLabel(/Event stream (stale|offline)/)).toBeVisible({ timeout: 15_000 });

    const follow = await api(page, `/v1/tasks/${taskId}/messages`, { method: "POST", body: { content: "after reconnect" } });
    expect(follow.status).toBe(200);

    // Restore EventSource and allow hook reconnect timer to create a fresh connection.
    await page.evaluate(() => {
      const Original = (window as any).__helmOriginalEventSource;
      if (Original) window.EventSource = Original;
    });

    await expect(page.getByLabel("Event stream live")).toBeVisible({ timeout: 30_000 });
    await expect.poll(async () => {
      const seqs = await readSeqs();
      return seqs.some((s) => s > maxBefore);
    }, { timeout: 30_000 }).toBe(true);

    const after = await readSeqs();
    const unique = new Set(after);
    expect(unique.size).toBe(after.length);
    for (let i = 1; i < after.length; i++) expect(after[i]!).toBeGreaterThanOrEqual(after[i - 1]!);

    // Ensure reconnect URL carried after cursor (lastSeq) and no duplicate old/new event storm.
    const urls: string[] = await page.evaluate(() => (window as any).__helmEsUrls ?? []);
    expect(urls.some((u) => u.includes("/v1/events/stream") && /after=\d+/.test(u))).toBe(true);
  });
});
