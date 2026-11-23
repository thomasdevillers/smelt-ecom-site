CREATE TABLE "research_rate_limits" (
	"key" text PRIMARY KEY NOT NULL,
	"hits" integer NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "research_responses" (
	"environment" text NOT NULL,
	"id" text NOT NULL,
	"version" integer NOT NULL,
	"revision" integer NOT NULL,
	"answers" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "research_responses_environment_id_pk" PRIMARY KEY("environment","id"),
	CONSTRAINT "research_revision" CHECK ("research_responses"."revision" > 0 and "research_responses"."version" > 0),
	CONSTRAINT "research_identity" CHECK ("research_responses"."id" ~ '^[a-f0-9]{64}$')
);
--> statement-breakpoint
CREATE INDEX "research_updated" ON "research_responses" USING btree ("environment","updated_at","id");
--> statement-breakpoint
CREATE INDEX "research_rate_expiry" ON "research_rate_limits" USING btree ("expires_at");
