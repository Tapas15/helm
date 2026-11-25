-- P7c metadata: draft-only review/eval-gate fields. No activation/apply path.
ALTER TABLE "self_improvement_proposals" ADD COLUMN IF NOT EXISTS "review_status" text DEFAULT 'pending' NOT NULL;
ALTER TABLE "self_improvement_proposals" ADD COLUMN IF NOT EXISTS "eval_gate_status" text DEFAULT 'not_run' NOT NULL;
ALTER TABLE "self_improvement_proposals" ADD COLUMN IF NOT EXISTS "review_note" text;
ALTER TABLE "self_improvement_proposals" ADD COLUMN IF NOT EXISTS "reviewed_at" timestamp with time zone;
ALTER TABLE "self_improvement_proposals" ADD COLUMN IF NOT EXISTS "reviewed_by" text;
