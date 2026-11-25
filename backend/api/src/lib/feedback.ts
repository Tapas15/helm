import { feedbackEvents, type Database } from "@helm/db";

const uid = (p: string) => `${p}_${crypto.randomUUID().replace(/-/g, "")}`;
const SENSITIVE_RE = /(api[_-]?key|secret|password|token|bearer|private key|vault|sk-[a-z0-9]|ghp_[a-z0-9]|AIza[0-9A-Za-z_-])/i;

function redact(v: unknown): unknown {
  if (typeof v === "string") return SENSITIVE_RE.test(v) ? "[REDACTED]" : v;
  if (Array.isArray(v)) return v.map(redact);
  if (v && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      out[k] = SENSITIVE_RE.test(k) || SENSITIVE_RE.test(String(val ?? "")) ? "[REDACTED]" : redact(val);
    }
    return out;
  }
  return v;
}

export type FeedbackSignal = "positive" | "negative" | "neutral";
export type FeedbackKind = "task_outcome" | "approval_decision" | "tool_failure" | "user_correction" | "model_quality" | "eval_result";

export async function emitFeedbackEvent(db: Database, input: {
  userId: string;
  taskId?: string | null;
  runId?: string | null;
  kind: FeedbackKind;
  signal: FeedbackSignal;
  severity?: "info" | "warn" | "error";
  summary?: string;
  payload?: Record<string, unknown>;
  evidenceRefs?: unknown[];
}): Promise<{ emitted: boolean; id?: string }> {
  if (process.env.HELM_FEEDBACK_ENABLED !== "1") return { emitted: false };
  try {
    const id = uid("fbk");
    await db.insert(feedbackEvents).values({
      id,
      userId: input.userId,
      taskId: input.taskId ?? null,
      runId: input.runId ?? null,
      kind: input.kind,
      signal: input.signal,
      severity: input.severity ?? "info",
      payload: (redact({ summary: input.summary ?? null, ...(input.payload ?? {}) }) as Record<string, unknown>),
      evidenceRefs: (redact(input.evidenceRefs ?? []) as unknown[]),
      redacted: true,
      createdAt: new Date(),
    });
    return { emitted: true, id };
  } catch {
    // Feedback emission must never change runtime behavior.
    return { emitted: false };
  }
}
