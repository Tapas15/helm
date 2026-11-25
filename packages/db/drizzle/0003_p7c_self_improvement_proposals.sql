-- P7c: self-improvement proposals (draft-only, no activation)
CREATE TABLE IF NOT EXISTS "self_improvement_proposals" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL,
  "source_feedback_id" text,
  "source_eval_case_id" text,
  "kind" text DEFAULT 'prompt_tuning' NOT NULL,
  "title" text NOT NULL,
  "summary" text,
  "status" text DEFAULT 'draft' NOT NULL,
  "risk_level" text DEFAULT 'low' NOT NULL,
  "requires_approval" boolean DEFAULT true NOT NULL,
  "activation" text DEFAULT 'blocked' NOT NULL,
  "payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "evidence_refs" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'self_improvement_proposals_user_id_users_id_fk') THEN
    ALTER TABLE "self_improvement_proposals" ADD CONSTRAINT "self_improvement_proposals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'self_improvement_proposals_source_feedback_id_feedback_events_id_fk') THEN
    ALTER TABLE "self_improvement_proposals" ADD CONSTRAINT "self_improvement_proposals_source_feedback_id_feedback_events_id_fk" FOREIGN KEY ("source_feedback_id") REFERENCES "public"."feedback_events"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'self_improvement_proposals_source_eval_case_id_eval_cases_id_fk') THEN
    ALTER TABLE "self_improvement_proposals" ADD CONSTRAINT "self_improvement_proposals_source_eval_case_id_eval_cases_id_fk" FOREIGN KEY ("source_eval_case_id") REFERENCES "public"."eval_cases"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "self_improvement_proposals_user_status_idx" ON "self_improvement_proposals" USING btree ("user_id","status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "self_improvement_proposals_source_feedback_idx" ON "self_improvement_proposals" USING btree ("source_feedback_id");
