CREATE TABLE "action_receipts" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"task_id" text NOT NULL,
	"run_id" text,
	"approval_id" text,
	"action_kind" text NOT NULL,
	"action_hash" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"status" text DEFAULT 'recorded' NOT NULL,
	"external_ref" text,
	"evidence" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "approvals" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"task_id" text NOT NULL,
	"run_id" text,
	"action_kind" text NOT NULL,
	"action_hash" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"summary" text NOT NULL,
	"evidence" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"decision_reason" text,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"ts" timestamp with time zone DEFAULT now() NOT NULL,
	"actor_type" text NOT NULL,
	"actor_id" text NOT NULL,
	"task_id" text,
	"action" text NOT NULL,
	"resource_type" text NOT NULL,
	"resource_id" text,
	"decision" text,
	"reason" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "browser_artifacts" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"task_id" text NOT NULL,
	"run_id" text,
	"session_id" text NOT NULL,
	"kind" text NOT NULL,
	"path" text NOT NULL,
	"mime" text NOT NULL,
	"sha256" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "connector_accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"connector_id" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"secret_ref_id" text,
	"scopes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "identities" (
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
CREATE TABLE "identity_policies" (
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
CREATE TABLE "memory_notes" (
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
CREATE TABLE "oauth_states" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"connector_id" text NOT NULL,
	"state_hash" text NOT NULL,
	"pkce_verifier_encrypted" text NOT NULL,
	"redirect_uri" text NOT NULL,
	"scopes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "proactivity_rules" (
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
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"token_hash" text NOT NULL,
	"device_id" text,
	"user_agent" text,
	"ip_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "sessions_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "skills" (
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
CREATE TABLE "task_events" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"task_id" text NOT NULL,
	"run_id" text,
	"session_id" text,
	"sequence" bigint NOT NULL,
	"schema_version" integer DEFAULT 1 NOT NULL,
	"ts" timestamp with time zone DEFAULT now() NOT NULL,
	"source" text NOT NULL,
	"type" text NOT NULL,
	"correlation_id" text,
	"causation_id" text,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "task_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"task_id" text NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"thread_id" text,
	"goal_id" text,
	"title" text NOT NULL,
	"prompt" text NOT NULL,
	"kind" text DEFAULT 'assistant' NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"plan" jsonb,
	"checkpoint" jsonb,
	"state" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"current_step_id" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 3 NOT NULL,
	"lease_owner" text,
	"lease_until" timestamp with time zone,
	"next_run_at" timestamp with time zone,
	"error_code" text,
	"error_message" text,
	"result" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "vault_secrets" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"provider" text NOT NULL,
	"name" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"encrypted_value" text NOT NULL,
	"key_id" text DEFAULT 'local-master-v1' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"rotated_at" timestamp with time zone,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "action_receipts" ADD CONSTRAINT "action_receipts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "action_receipts" ADD CONSTRAINT "action_receipts_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "browser_artifacts" ADD CONSTRAINT "browser_artifacts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "browser_artifacts" ADD CONSTRAINT "browser_artifacts_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connector_accounts" ADD CONSTRAINT "connector_accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identities" ADD CONSTRAINT "identities_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identity_policies" ADD CONSTRAINT "identity_policies_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identity_policies" ADD CONSTRAINT "identity_policies_identity_id_identities_id_fk" FOREIGN KEY ("identity_id") REFERENCES "public"."identities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_notes" ADD CONSTRAINT "memory_notes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_notes" ADD CONSTRAINT "memory_notes_identity_id_identities_id_fk" FOREIGN KEY ("identity_id") REFERENCES "public"."identities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_states" ADD CONSTRAINT "oauth_states_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proactivity_rules" ADD CONSTRAINT "proactivity_rules_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skills" ADD CONSTRAINT "skills_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_events" ADD CONSTRAINT "task_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_events" ADD CONSTRAINT "task_events_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_messages" ADD CONSTRAINT "task_messages_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_messages" ADD CONSTRAINT "task_messages_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vault_secrets" ADD CONSTRAINT "vault_secrets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "action_receipts_idempotency_uidx" ON "action_receipts" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "action_receipts_task_idx" ON "action_receipts" USING btree ("task_id","created_at");--> statement-breakpoint
CREATE INDEX "action_receipts_action_hash_idx" ON "action_receipts" USING btree ("action_hash");--> statement-breakpoint
CREATE INDEX "approvals_task_status_idx" ON "approvals" USING btree ("task_id","status");--> statement-breakpoint
CREATE INDEX "approvals_user_status_idx" ON "approvals" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "audit_user_ts_idx" ON "audit_log" USING btree ("user_id","ts");--> statement-breakpoint
CREATE INDEX "browser_artifacts_task_idx" ON "browser_artifacts" USING btree ("task_id","created_at");--> statement-breakpoint
CREATE INDEX "browser_artifacts_session_idx" ON "browser_artifacts" USING btree ("session_id","created_at");--> statement-breakpoint
CREATE INDEX "connector_accounts_user_connector_idx" ON "connector_accounts" USING btree ("user_id","connector_id");--> statement-breakpoint
CREATE INDEX "connector_accounts_user_status_idx" ON "connector_accounts" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "identities_user_class_idx" ON "identities" USING btree ("user_id","class");--> statement-breakpoint
CREATE INDEX "identities_user_status_idx" ON "identities" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "identity_policies_user_idx" ON "identity_policies" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "identity_policies_identity_idx" ON "identity_policies" USING btree ("identity_id");--> statement-breakpoint
CREATE INDEX "memory_notes_user_kind_idx" ON "memory_notes" USING btree ("user_id","kind");--> statement-breakpoint
CREATE INDEX "memory_notes_user_created_idx" ON "memory_notes" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "oauth_states_user_connector_idx" ON "oauth_states" USING btree ("user_id","connector_id");--> statement-breakpoint
CREATE INDEX "oauth_states_expires_idx" ON "oauth_states" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "proactivity_rules_user_enabled_idx" ON "proactivity_rules" USING btree ("user_id","enabled");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_expires_idx" ON "sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "skills_user_enabled_idx" ON "skills" USING btree ("user_id","enabled");--> statement-breakpoint
CREATE UNIQUE INDEX "task_events_task_seq_uidx" ON "task_events" USING btree ("task_id","sequence");--> statement-breakpoint
CREATE INDEX "task_events_task_ts_idx" ON "task_events" USING btree ("task_id","ts");--> statement-breakpoint
CREATE INDEX "task_messages_task_created_idx" ON "task_messages" USING btree ("task_id","created_at");--> statement-breakpoint
CREATE INDEX "task_messages_user_created_idx" ON "task_messages" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "tasks_user_status_updated_idx" ON "tasks" USING btree ("user_id","status","updated_at");--> statement-breakpoint
CREATE INDEX "tasks_lease_idx" ON "tasks" USING btree ("status","lease_until");--> statement-breakpoint
CREATE INDEX "vault_secrets_user_provider_idx" ON "vault_secrets" USING btree ("user_id","provider");--> statement-breakpoint
CREATE INDEX "vault_secrets_user_name_idx" ON "vault_secrets" USING btree ("user_id","name");