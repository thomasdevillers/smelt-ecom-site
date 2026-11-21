CREATE TABLE "custom_files" (
	"environment" text NOT NULL,
	"file_key" text NOT NULL,
	"request_id" text NOT NULL,
	"expires_at" timestamp with time zone,
	"metadata" jsonb,
	CONSTRAINT "custom_files_environment_file_key_pk" PRIMARY KEY("environment","file_key")
);
--> statement-breakpoint
CREATE TABLE "custom_requests" (
	"environment" text NOT NULL,
	"id" text NOT NULL,
	"token_digest" text NOT NULL,
	"token_ciphertext" text,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"submitted_at" timestamp with time zone,
	"revision" integer NOT NULL,
	"expires_at" timestamp with time zone,
	CONSTRAINT "custom_requests_environment_id_pk" PRIMARY KEY("environment","id"),
	CONSTRAINT "custom_revision" CHECK ("custom_requests"."revision" >= 0),
	CONSTRAINT "custom_digest" CHECK ("custom_requests"."token_digest" ~ '^[a-f0-9]{64}$')
);
--> statement-breakpoint
CREATE TABLE "custom_revisions" (
	"environment" text NOT NULL,
	"request_id" text NOT NULL,
	"revision" integer NOT NULL,
	"submission" jsonb NOT NULL,
	"submitted_at" timestamp with time zone NOT NULL,
	CONSTRAINT "custom_revisions_environment_request_id_revision_pk" PRIMARY KEY("environment","request_id","revision"),
	CONSTRAINT "custom_revision_positive" CHECK ("custom_revisions"."revision" > 0)
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"environment" text NOT NULL,
	"id" text NOT NULL,
	"email" text NOT NULL,
	"details" jsonb NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "customers_environment_id_pk" PRIMARY KEY("environment","id")
);
--> statement-breakpoint
CREATE TABLE "environments" (
	"id" text PRIMARY KEY NOT NULL,
	"payment_mode" text NOT NULL,
	CONSTRAINT "environment_payment_mode" CHECK ("environments"."payment_mode" in ('live', 'test', 'none'))
);
--> statement-breakpoint
CREATE TABLE "order_items" (
	"environment" text NOT NULL,
	"reference" text NOT NULL,
	"position" integer NOT NULL,
	"quantity" integer NOT NULL,
	"unit_price_minor" integer NOT NULL,
	"currency" text NOT NULL,
	"payload" jsonb NOT NULL,
	CONSTRAINT "order_items_environment_reference_position_pk" PRIMARY KEY("environment","reference","position"),
	CONSTRAINT "item_values" CHECK ("order_items"."quantity" > 0 and "order_items"."position" >= 0 and "order_items"."unit_price_minor" >= 0 and "order_items"."currency" ~ '^[A-Z]{3}$')
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"environment" text NOT NULL,
	"reference" text NOT NULL,
	"customer_id" text,
	"amount_minor" integer,
	"currency" text,
	"payment_status" text NOT NULL,
	"snapshot" jsonb NOT NULL,
	"created_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"review_message_sent_at" timestamp with time zone,
	CONSTRAINT "orders_environment_reference_pk" PRIMARY KEY("environment","reference"),
	CONSTRAINT "order_payment_status" CHECK ("orders"."payment_status" in ('unknown','pending','success','failed','reversed')),
	CONSTRAINT "order_money" CHECK (("orders"."amount_minor" is null and "orders"."currency" is null) or ("orders"."amount_minor" is not null and "orders"."currency" is not null and "orders"."amount_minor" >= 0 and "orders"."currency" ~ '^[A-Z]{3}$'))
);
--> statement-breakpoint
CREATE TABLE "review_claims" (
	"environment" text NOT NULL,
	"token_digest" text NOT NULL,
	"order_reference" text NOT NULL,
	"review_id" text,
	"claimed_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"payload" jsonb NOT NULL,
	CONSTRAINT "review_claims_environment_token_digest_pk" PRIMARY KEY("environment","token_digest")
);
--> statement-breakpoint
CREATE TABLE "review_invitations" (
	"environment" text NOT NULL,
	"token_digest" text NOT NULL,
	"order_reference" text NOT NULL,
	"state" text NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "review_invitations_environment_token_digest_pk" PRIMARY KEY("environment","token_digest"),
	CONSTRAINT "invitation_state" CHECK ("review_invitations"."state" in ('active','revoked','used','expired')),
	CONSTRAINT "invitation_digest" CHECK ("review_invitations"."token_digest" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "invitation_dates" CHECK ("review_invitations"."expires_at" >= "review_invitations"."created_at")
);
--> statement-breakpoint
CREATE TABLE "review_rankings" (
	"environment" text NOT NULL,
	"review_id" text NOT NULL,
	"result" jsonb,
	"retry_state" jsonb,
	CONSTRAINT "review_rankings_environment_review_id_pk" PRIMARY KEY("environment","review_id")
);
--> statement-breakpoint
CREATE TABLE "review_uploads" (
	"environment" text NOT NULL,
	"pathname" text NOT NULL,
	"token_digest" text NOT NULL,
	"url" text,
	"review_id" text,
	"expires_at" timestamp with time zone,
	CONSTRAINT "review_uploads_environment_pathname_pk" PRIMARY KEY("environment","pathname")
);
--> statement-breakpoint
CREATE TABLE "reviews" (
	"environment" text NOT NULL,
	"id" text NOT NULL,
	"order_reference" text NOT NULL,
	"status" text NOT NULL,
	"rating" integer NOT NULL,
	"record" jsonb NOT NULL,
	"submitted_at" timestamp with time zone NOT NULL,
	"published_at" timestamp with time zone,
	CONSTRAINT "reviews_environment_id_pk" PRIMARY KEY("environment","id"),
	CONSTRAINT "review_status" CHECK ("reviews"."status" in ('pending','published','rejected')),
	CONSTRAINT "review_rating" CHECK ("reviews"."rating" between 1 and 5),
	CONSTRAINT "review_publication" CHECK ("reviews"."status" <> 'published' or "reviews"."published_at" is not null),
	CONSTRAINT "review_record_identity" CHECK (("reviews"."record"->>'id' = "reviews"."id" and "reviews"."record"->>'orderReference' = "reviews"."order_reference" and "reviews"."record"->>'status' = "reviews"."status" and ("reviews"."record"->>'rating')::integer = "reviews"."rating") is true)
);
--> statement-breakpoint
ALTER TABLE "custom_files" ADD CONSTRAINT "custom_files_environment_environments_id_fk" FOREIGN KEY ("environment") REFERENCES "public"."environments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_files" ADD CONSTRAINT "custom_files_environment_request_id_custom_requests_environment_id_fk" FOREIGN KEY ("environment","request_id") REFERENCES "public"."custom_requests"("environment","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_requests" ADD CONSTRAINT "custom_requests_environment_environments_id_fk" FOREIGN KEY ("environment") REFERENCES "public"."environments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_revisions" ADD CONSTRAINT "custom_revisions_environment_environments_id_fk" FOREIGN KEY ("environment") REFERENCES "public"."environments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_revisions" ADD CONSTRAINT "custom_revisions_environment_request_id_custom_requests_environment_id_fk" FOREIGN KEY ("environment","request_id") REFERENCES "public"."custom_requests"("environment","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_environment_environments_id_fk" FOREIGN KEY ("environment") REFERENCES "public"."environments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_environment_environments_id_fk" FOREIGN KEY ("environment") REFERENCES "public"."environments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_environment_reference_orders_environment_reference_fk" FOREIGN KEY ("environment","reference") REFERENCES "public"."orders"("environment","reference") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_environment_environments_id_fk" FOREIGN KEY ("environment") REFERENCES "public"."environments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_environment_customer_id_customers_environment_id_fk" FOREIGN KEY ("environment","customer_id") REFERENCES "public"."customers"("environment","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_claims" ADD CONSTRAINT "review_claims_environment_environments_id_fk" FOREIGN KEY ("environment") REFERENCES "public"."environments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_claims" ADD CONSTRAINT "review_claims_environment_token_digest_review_invitations_environment_token_digest_fk" FOREIGN KEY ("environment","token_digest") REFERENCES "public"."review_invitations"("environment","token_digest") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_claims" ADD CONSTRAINT "review_claims_environment_order_reference_orders_environment_reference_fk" FOREIGN KEY ("environment","order_reference") REFERENCES "public"."orders"("environment","reference") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_claims" ADD CONSTRAINT "review_claims_environment_review_id_reviews_environment_id_fk" FOREIGN KEY ("environment","review_id") REFERENCES "public"."reviews"("environment","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_invitations" ADD CONSTRAINT "review_invitations_environment_environments_id_fk" FOREIGN KEY ("environment") REFERENCES "public"."environments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_invitations" ADD CONSTRAINT "review_invitations_environment_order_reference_orders_environment_reference_fk" FOREIGN KEY ("environment","order_reference") REFERENCES "public"."orders"("environment","reference") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_rankings" ADD CONSTRAINT "review_rankings_environment_environments_id_fk" FOREIGN KEY ("environment") REFERENCES "public"."environments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_rankings" ADD CONSTRAINT "review_rankings_environment_review_id_reviews_environment_id_fk" FOREIGN KEY ("environment","review_id") REFERENCES "public"."reviews"("environment","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_uploads" ADD CONSTRAINT "review_uploads_environment_environments_id_fk" FOREIGN KEY ("environment") REFERENCES "public"."environments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_uploads" ADD CONSTRAINT "review_uploads_environment_token_digest_review_invitations_environment_token_digest_fk" FOREIGN KEY ("environment","token_digest") REFERENCES "public"."review_invitations"("environment","token_digest") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_uploads" ADD CONSTRAINT "review_uploads_environment_review_id_reviews_environment_id_fk" FOREIGN KEY ("environment","review_id") REFERENCES "public"."reviews"("environment","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_environment_environments_id_fk" FOREIGN KEY ("environment") REFERENCES "public"."environments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_environment_order_reference_orders_environment_reference_fk" FOREIGN KEY ("environment","order_reference") REFERENCES "public"."orders"("environment","reference") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "custom_token" ON "custom_requests" USING btree ("environment","token_digest");--> statement-breakpoint
CREATE INDEX "customers_email" ON "customers" USING btree ("environment","email");--> statement-breakpoint
CREATE INDEX "orders_completed" ON "orders" USING btree ("environment","completed_at","reference");--> statement-breakpoint
CREATE UNIQUE INDEX "claim_one_per_order" ON "review_claims" USING btree ("environment","order_reference");--> statement-breakpoint
CREATE UNIQUE INDEX "invitation_current_order" ON "review_invitations" USING btree ("environment","order_reference") WHERE "review_invitations"."state" = 'active';--> statement-breakpoint
CREATE INDEX "invitation_expiry" ON "review_invitations" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "review_one_per_order" ON "reviews" USING btree ("environment","order_reference");--> statement-breakpoint
CREATE INDEX "review_moderation" ON "reviews" USING btree ("environment","status","submitted_at");