-- Manual incremental migration for missing P7 tables
-- Generated from 0000 baseline diff; safe to re-run (IF NOT EXISTS).

CREATE TABLE IF NOT EXISTS "identities" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"class" text DEFAULT 'helm-owned' NOT NULL,
	"label" text NOT NULL,
	"email" text,
	"provider" text,
	"scopes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "identity_policies" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"identity_id" text NOT NULL,
	"allowed_domains" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"allowed_recipients" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"allow_external_writes" boolean DEFAULT false NOT NULL,
	"require_approval" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "memory_notes" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"identity_id" text,
	"kind" text DEFAULT 'note' NOT NULL,
	"content" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "proactivity_rules" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"trigger_kind" text DEFAULT 'cron' NOT NULL,
	"trigger_config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"action_kind" text DEFAULT 'draft' NOT NULL,
	"action_config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"require_approval" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "skills" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"enabled" boolean DEFAULT true NOT NULL,
	"source" text DEFAULT 'local' NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'identities_user_id_users_id_fk') THEN
    ALTER TABLE "identities" ADD CONSTRAINT "identities_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'identity_policies_user_id_users_id_fk') THEN
    ALTER TABLE "identity_policies" ADD CONSTRAINT "identity_policies_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'identity_policies_identity_id_identities_id_fk') THEN
    ALTER TABLE "identity_policies" ADD CONSTRAINT "identity_policies_identity_id_identities_id_fk" FOREIGN KEY ("identity_id") REFERENCES "public"."identities"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'memory_notes_user_id_users_id_fk') THEN
    ALTER TABLE "memory_notes" ADD CONSTRAINT "memory_notes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'memory_notes_identity_id_identities_id_fk') THEN
    ALTER TABLE "memory_notes" ADD CONSTRAINT "memory_notes_identity_id_identities_id_fk" FOREIGN KEY ("identity_id") REFERENCES "public"."identities"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'proactivity_rules_user_id_users_id_fk') THEN
    ALTER TABLE "proactivity_rules" ADD CONSTRAINT "proactivity_rules_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'skills_user_id_users_id_fk') THEN
    ALTER TABLE "skills" ADD CONSTRAINT "skills_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "identities_user_class_idx" ON "identities" USING btree ("user_id","class");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "identities_user_status_idx" ON "identities" USING btree ("user_id","status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "identity_policies_user_idx" ON "identity_policies" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "identity_policies_identity_idx" ON "identity_policies" USING btree ("identity_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "memory_notes_user_kind_idx" ON "memory_notes" USING btree ("user_id","kind");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "memory_notes_user_created_idx" ON "memory_notes" USING btree ("user_id","created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "proactivity_rules_user_enabled_idx" ON "proactivity_rules" USING btree ("user_id","enabled");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "skills_user_enabled_idx" ON "skills" USING btree ("user_id","enabled");
