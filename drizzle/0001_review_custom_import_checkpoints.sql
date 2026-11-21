CREATE TABLE "migration_imports" (
	"id" text PRIMARY KEY NOT NULL,
	"source_hash" text NOT NULL,
	"archive_checksum" text NOT NULL,
	"target_table" text NOT NULL,
	"imported_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "custom_requests" ADD COLUMN "token" text;