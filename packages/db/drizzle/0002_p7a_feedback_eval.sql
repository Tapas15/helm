-- P7a: feedback events + eval corpus (no runtime behavior change)
CREATE TABLE IF NOT EXISTS "feedback_events" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL,
  "task_id" text,
  "run_id" text,
  "kind" text NOT NULL,
  "signal" text NOT NULL,
  "severity" text DEFAULT 'info' NOT NULL,
  "payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "evidence_refs" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "redacted" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "eval_cases" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL,
  "source_feedback_id" text,
  "name" text NOT NULL,
  "kind" text DEFAULT 'regression' NOT NULL,
  "input" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "expected" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "status" text DEFAULT 'draft' NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'feedback_events_user_id_users_id_fk') THEN
    ALTER TABLE "feedback_events" ADD CONSTRAINT "feedback_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'feedback_events_task_id_tasks_id_fk') THEN
    ALTER TABLE "feedback_events" ADD CONSTRAINT "feedback_events_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'eval_cases_user_id_users_id_fk') THEN
    ALTER TABLE "eval_cases" ADD CONSTRAINT "eval_cases_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'eval_cases_source_feedback_id_feedback_events_id_fk') THEN
    ALTER TABLE "eval_cases" ADD CONSTRAINT "eval_cases_source_feedback_id_feedback_events_id_fk" FOREIGN KEY ("source_feedback_id") REFERENCES "public"."feedback_events"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "feedback_events_user_kind_idx" ON "feedback_events" USING btree ("user_id","kind");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "feedback_events_task_idx" ON "feedback_events" USING btree ("task_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "feedback_events_user_created_idx" ON "feedback_events" USING btree ("user_id","created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "eval_cases_user_status_idx" ON "eval_cases" USING btree ("user_id","status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "eval_cases_source_feedback_idx" ON "eval_cases" USING btree ("source_feedback_id");
