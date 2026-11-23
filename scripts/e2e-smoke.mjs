const base = "http://127.0.0.1:8787";
const h = { "content-type": "application/json", "x-user-id": "usr_local_dev" };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const create = await fetch(base + "/v1/tasks", {
    method: "POST",
    headers: { ...h, "idempotency-key": "e2e-" + Date.now() },
    body: JSON.stringify({ prompt: "E2E smoke task", kind: "assistant" }),
  }).then((r) => r.json());
  const id = create.task?.id;
  if (!id) throw new Error("no task id: " + JSON.stringify(create));
  let status = "unknown";
  for (let i = 0; i < 30; i++) {
    const t = await fetch(base + "/v1/tasks/" + id, { headers: h }).then((r) => r.json());
    status = t.task?.status;
    if (status === "succeeded" || status === "failed" || status === "cancelled") break;
    await sleep(500);
  }
  const events = await fetch(base + "/v1/tasks/" + id + "/events", { headers: h }).then((r) => r.json());
  const types = (events.events || []).map((e) => e.type);
  const ok = status === "succeeded" && types.includes("task.created") && types.includes("task.completed");
  console.log(JSON.stringify({ ok, id, status, types }));
  process.exit(ok ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
