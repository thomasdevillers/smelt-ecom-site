CREATE TABLE "paystack_effects" (
	"environment" text NOT NULL,
	"reference" text NOT NULL,
	"event_id" text NOT NULL,
	"state" text NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone,
	CONSTRAINT "paystack_effects_environment_reference_pk" PRIMARY KEY("environment","reference"),
	CONSTRAINT "paystack_effect_state" CHECK ("paystack_effects"."state" in ('started','done','manual_review'))
);
--> statement-breakpoint
CREATE TABLE "paystack_events" (
	"environment" text NOT NULL,
	"id" text NOT NULL,
	"event_type" text NOT NULL,
	"reference" text,
	"raw" text NOT NULL,
	"state" text DEFAULT 'pending' NOT NULL,
	"received_at" timestamp with time zone NOT NULL,
	"available_at" timestamp with time zone NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"lease_token" text,
	"lease_until" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"reason" text,
	CONSTRAINT "paystack_events_environment_id_pk" PRIMARY KEY("environment","id"),
	CONSTRAINT "paystack_event_state" CHECK ("paystack_events"."state" in ('pending','processing','done','ignored','manual_review')),
	CONSTRAINT "paystack_event_attempts" CHECK ("paystack_events"."attempts" >= 0)
);
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "reconcile_after" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "paystack_effects" ADD CONSTRAINT "paystack_effects_environment_environments_id_fk" FOREIGN KEY ("environment") REFERENCES "public"."environments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paystack_effects" ADD CONSTRAINT "paystack_effects_environment_event_id_paystack_events_environment_id_fk" FOREIGN KEY ("environment","event_id") REFERENCES "public"."paystack_events"("environment","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paystack_events" ADD CONSTRAINT "paystack_events_environment_environments_id_fk" FOREIGN KEY ("environment") REFERENCES "public"."environments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "paystack_event_due" ON "paystack_events" USING btree ("environment","state","available_at");--> statement-breakpoint
CREATE INDEX "paystack_event_reference" ON "paystack_events" USING btree ("environment","reference");--> statement-breakpoint
CREATE INDEX "orders_reconcile_due" ON "orders" USING btree ("environment","reconcile_after","reference");