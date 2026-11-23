import { check, index, integer, jsonb, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import type { Answers } from "../research/shared";

// Independent of payment/review migration namespaces. No customer identifiers.
export const researchResponses = pgTable("research_responses", {
  environment: text("environment").notNull(),
  id: text("id").notNull(),
  version: integer("version").notNull(),
  revision: integer("revision").notNull(),
  answers: jsonb("answers").$type<Answers>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true, mode: "string" }),
}, t => [primaryKey({ columns: [t.environment, t.id] }), index("research_updated").on(t.environment, t.updatedAt, t.id),
  check("research_revision", sql`${t.revision} > 0 and ${t.version} > 0`),
  check("research_identity", sql`${t.id} ~ '^[a-f0-9]{64}$'`)]);

export const researchRateLimits = pgTable("research_rate_limits", {
  key: text("key").primaryKey(),
  hits: integer("hits").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true, mode: "string" }).notNull(),
}, t => [index("research_rate_expiry").on(t.expiresAt)]);
