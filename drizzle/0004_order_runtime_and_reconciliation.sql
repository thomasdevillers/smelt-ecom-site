CREATE EXTENSION IF NOT EXISTS pg_trgm;
--> statement-breakpoint
CREATE TABLE "payment_adjustments" (
	"environment" text NOT NULL,
	"kind" text NOT NULL,
	"id" text NOT NULL,
	"reference" text,
	"status" text NOT NULL,
	"amount_minor" integer,
	"currency" text,
	"observed_at" timestamp with time zone NOT NULL,
	"payload" jsonb NOT NULL,
	CONSTRAINT "payment_adjustments_environment_kind_id_pk" PRIMARY KEY("environment","kind","id"),
	CONSTRAINT "adjustment_kind" CHECK ("payment_adjustments"."kind" in ('refund','dispute'))
);
--> statement-breakpoint
CREATE TABLE "provider_sync" (
	"environment" text NOT NULL,
	"stream" text NOT NULL,
	"page" integer DEFAULT 1 NOT NULL,
	"window_end" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	"lease_token" text,
	"lease_until" timestamp with time zone,
	CONSTRAINT "provider_sync_environment_stream_pk" PRIMARY KEY("environment","stream"),
	CONSTRAINT "provider_sync_page" CHECK ("provider_sync"."page" > 0)
);
--> statement-breakpoint
ALTER TABLE "customers" ALTER COLUMN "created_at" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "observed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "customer_email" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "customer_name" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "search_text" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "preorder" jsonb;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "payment_review" text DEFAULT 'clear' NOT NULL;--> statement-breakpoint
ALTER TABLE "paystack_events" ADD COLUMN "origin" text DEFAULT 'webhook' NOT NULL;--> statement-breakpoint
ALTER TABLE "paystack_events" ADD COLUMN "resolution" jsonb;--> statement-breakpoint
ALTER TABLE "payment_adjustments" ADD CONSTRAINT "payment_adjustments_environment_environments_id_fk" FOREIGN KEY ("environment") REFERENCES "public"."environments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_sync" ADD CONSTRAINT "provider_sync_environment_environments_id_fk" FOREIGN KEY ("environment") REFERENCES "public"."environments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "adjustment_reference" ON "payment_adjustments" USING btree ("environment","reference");--> statement-breakpoint
CREATE INDEX "orders_email_paid" ON "orders" USING btree ("environment","customer_email","payment_status","paid_at");--> statement-breakpoint
CREATE INDEX "orders_search" ON "orders" USING gin ("search_text" gin_trgm_ops);--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_payment_review" CHECK ("orders"."payment_review" in ('clear','refund','dispute'));
