CREATE TABLE "payment_snapshots" (
	"environment" text NOT NULL,
	"id" text NOT NULL,
	"order_reference" text NOT NULL,
	"observed_at" timestamp with time zone NOT NULL,
	"source" text NOT NULL,
	"payload" jsonb NOT NULL,
	CONSTRAINT "payment_snapshots_environment_id_pk" PRIMARY KEY("environment","id"),
	CONSTRAINT "payment_snapshot_source" CHECK ("payment_snapshots"."source" in ('backfill','verification','webhook'))
);
--> statement-breakpoint
CREATE TABLE "shipment_sources" (
	"environment" text NOT NULL,
	"source_key" text NOT NULL,
	"source_field" text NOT NULL,
	"shipment_id" text NOT NULL,
	CONSTRAINT "shipment_sources_environment_source_key_source_field_pk" PRIMARY KEY("environment","source_key","source_field")
);
--> statement-breakpoint
CREATE TABLE "shipments" (
	"environment" text NOT NULL,
	"id" text NOT NULL,
	"order_reference" text,
	"email" text NOT NULL,
	"tracking_number" text NOT NULL,
	"status" text NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"payload" jsonb NOT NULL,
	CONSTRAINT "shipments_environment_id_pk" PRIMARY KEY("environment","id"),
	CONSTRAINT "shipment_status" CHECK ("shipments"."status" in ('pending','accepted'))
);
--> statement-breakpoint
ALTER TABLE "order_items" ALTER COLUMN "unit_price_minor" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "provider_id" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "paid_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "observed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "payment_snapshots" ADD CONSTRAINT "payment_snapshots_environment_environments_id_fk" FOREIGN KEY ("environment") REFERENCES "public"."environments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_snapshots" ADD CONSTRAINT "payment_snapshots_environment_order_reference_orders_environment_reference_fk" FOREIGN KEY ("environment","order_reference") REFERENCES "public"."orders"("environment","reference") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipment_sources" ADD CONSTRAINT "shipment_sources_environment_environments_id_fk" FOREIGN KEY ("environment") REFERENCES "public"."environments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipment_sources" ADD CONSTRAINT "shipment_sources_environment_shipment_id_shipments_environment_id_fk" FOREIGN KEY ("environment","shipment_id") REFERENCES "public"."shipments"("environment","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_environment_environments_id_fk" FOREIGN KEY ("environment") REFERENCES "public"."environments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_environment_order_reference_orders_environment_reference_fk" FOREIGN KEY ("environment","order_reference") REFERENCES "public"."orders"("environment","reference") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "payment_snapshot_order" ON "payment_snapshots" USING btree ("environment","order_reference","observed_at");--> statement-breakpoint
CREATE UNIQUE INDEX "shipment_pair" ON "shipments" USING btree ("environment","email","tracking_number");--> statement-breakpoint
CREATE UNIQUE INDEX "shipment_order" ON "shipments" USING btree ("environment","order_reference");--> statement-breakpoint
CREATE INDEX "shipment_history" ON "shipments" USING btree ("environment","email","started_at");--> statement-breakpoint
CREATE UNIQUE INDEX "orders_provider_id" ON "orders" USING btree ("environment","provider_id");--> statement-breakpoint
CREATE INDEX "orders_payment_paid" ON "orders" USING btree ("environment","payment_status","paid_at","reference");