import { sql } from "drizzle-orm";
import { check, foreignKey, index, integer, jsonb, pgTable, primaryKey, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import type { ReviewRecord } from "../reviews";
import type { ReviewRanking } from "../reviewRanking";
import type { CustomHatSubmission } from "../customHats/shared";

// These are source-data namespaces, not separate deployments or databases.
const env = () => text("environment").notNull().references(() => environments.id);
const date = (name: string) => timestamp(name, { withTimezone: true, mode: "string" });
const payload = () => jsonb("payload").$type<Record<string, unknown>>().notNull();
export const environments = pgTable("environments", {
  id: text("id").primaryKey(),
  paymentMode: text("payment_mode", { enum: ["live", "test", "none"] }).notNull(),
}, t => [check("environment_payment_mode", sql`${t.paymentMode} in ('live', 'test', 'none')`)]);

export const customers = pgTable("customers", {
  environment: env(), id: text("id").notNull(), email: text("email").notNull(),
  details: jsonb("details").$type<Record<string, unknown>>().notNull(), createdAt: date("created_at").notNull(),
}, t => [primaryKey({ columns: [t.environment, t.id] }), index("customers_email").on(t.environment, t.email)]);

// An order-reference stub is enough to preserve review ownership. Historical
// amounts/details are imported only when known, never inferred from current prices.
export const orders = pgTable("orders", {
  environment: env(), reference: text("reference").notNull(), customerId: text("customer_id"),
  amountMinor: integer("amount_minor"), currency: text("currency"),
  paymentStatus: text("payment_status", { enum: ["unknown", "pending", "success", "failed", "reversed"] }).notNull(),
  snapshot: jsonb("snapshot").$type<Record<string, unknown>>().notNull(),
  createdAt: date("created_at"), completedAt: date("completed_at"), reviewMessageSentAt: date("review_message_sent_at"),
}, t => [primaryKey({ columns: [t.environment, t.reference] }),
  foreignKey({ columns: [t.environment, t.customerId], foreignColumns: [customers.environment, customers.id] }),
  check("order_payment_status", sql`${t.paymentStatus} in ('unknown','pending','success','failed','reversed')`),
  check("order_money", sql`(${t.amountMinor} is null and ${t.currency} is null) or (${t.amountMinor} is not null and ${t.currency} is not null and ${t.amountMinor} >= 0 and ${t.currency} ~ '^[A-Z]{3}$')`),
  index("orders_completed").on(t.environment, t.completedAt, t.reference)]);

export const orderItems = pgTable("order_items", {
  environment: env(), reference: text("reference").notNull(), position: integer("position").notNull(),
  quantity: integer("quantity").notNull(), unitPriceMinor: integer("unit_price_minor").notNull(), currency: text("currency").notNull(), snapshot: payload(),
}, t => [primaryKey({ columns: [t.environment, t.reference, t.position] }),
  foreignKey({ columns: [t.environment, t.reference], foreignColumns: [orders.environment, orders.reference] }),
  check("item_values", sql`${t.quantity} > 0 and ${t.position} >= 0 and ${t.unitPriceMinor} >= 0 and ${t.currency} ~ '^[A-Z]{3}$'`)]);

export const reviews = pgTable("reviews", {
  environment: env(), id: text("id").notNull(), orderReference: text("order_reference").notNull(),
  status: text("status", { enum: ["pending", "published", "rejected"] }).notNull(),
  rating: integer("rating").notNull(), record: jsonb("record").$type<ReviewRecord>().notNull(),
  submittedAt: date("submitted_at").notNull(), publishedAt: date("published_at"),
}, t => [primaryKey({ columns: [t.environment, t.id] }), uniqueIndex("review_one_per_order").on(t.environment, t.orderReference),
  foreignKey({ columns: [t.environment, t.orderReference], foreignColumns: [orders.environment, orders.reference] }),
  check("review_status", sql`${t.status} in ('pending','published','rejected')`), check("review_rating", sql`${t.rating} between 1 and 5`),
  check("review_publication", sql`${t.status} <> 'published' or ${t.publishedAt} is not null`),
  check("review_record_identity", sql`(${t.record}->>'id' = ${t.id} and ${t.record}->>'orderReference' = ${t.orderReference} and ${t.record}->>'status' = ${t.status} and (${t.record}->>'rating')::integer = ${t.rating}) is true`),
  index("review_moderation").on(t.environment, t.status, t.submittedAt)]);

export const reviewInvitations = pgTable("review_invitations", {
  environment: env(), tokenDigest: text("token_digest").notNull(), orderReference: text("order_reference").notNull(),
  state: text("state", { enum: ["active", "revoked", "used", "expired"] }).notNull(), details: payload(),
  createdAt: date("created_at").notNull(), expiresAt: date("expires_at").notNull(),
}, t => [primaryKey({ columns: [t.environment, t.tokenDigest] }),
  foreignKey({ columns: [t.environment, t.orderReference], foreignColumns: [orders.environment, orders.reference] }),
  uniqueIndex("invitation_current_order").on(t.environment, t.orderReference).where(sql`${t.state} = 'active'`),
  check("invitation_state", sql`${t.state} in ('active','revoked','used','expired')`), check("invitation_digest", sql`${t.tokenDigest} ~ '^[a-f0-9]{64}$'`),
  check("invitation_dates", sql`${t.expiresAt} >= ${t.createdAt}`), index("invitation_expiry").on(t.expiresAt)]);

export const reviewClaims = pgTable("review_claims", {
  environment: env(), tokenDigest: text("token_digest").notNull(), orderReference: text("order_reference").notNull(),
  reviewId: text("review_id"), claimedAt: date("claimed_at"), expiresAt: date("expires_at"), evidence: payload(),
}, t => [primaryKey({ columns: [t.environment, t.tokenDigest] }), uniqueIndex("claim_one_per_order").on(t.environment, t.orderReference),
  foreignKey({ columns: [t.environment, t.tokenDigest], foreignColumns: [reviewInvitations.environment, reviewInvitations.tokenDigest] }),
  foreignKey({ columns: [t.environment, t.orderReference], foreignColumns: [orders.environment, orders.reference] }),
  foreignKey({ columns: [t.environment, t.reviewId], foreignColumns: [reviews.environment, reviews.id] })]);

export const reviewUploads = pgTable("review_uploads", {
  environment: env(), pathname: text("pathname").notNull(), tokenDigest: text("token_digest").notNull(),
  url: text("url"), reviewId: text("review_id"), expiresAt: date("expires_at"),
}, t => [primaryKey({ columns: [t.environment, t.pathname] }),
  foreignKey({ columns: [t.environment, t.tokenDigest], foreignColumns: [reviewInvitations.environment, reviewInvitations.tokenDigest] }),
  foreignKey({ columns: [t.environment, t.reviewId], foreignColumns: [reviews.environment, reviews.id] })]);

export const reviewRankings = pgTable("review_rankings", {
  environment: env(), reviewId: text("review_id").notNull(), result: jsonb("result").$type<ReviewRanking>(), retryState: jsonb("retry_state").$type<Record<string, unknown>>(),
}, t => [primaryKey({ columns: [t.environment, t.reviewId] }),
  foreignKey({ columns: [t.environment, t.reviewId], foreignColumns: [reviews.environment, reviews.id] })]);

export const customRequests = pgTable("custom_requests", {
  environment: env(), id: text("id").notNull(), tokenDigest: text("token_digest").notNull(), tokenCiphertext: text("token_ciphertext"),
  // Existing admin links need the original token. Private server-side data,
  // just as in the Redis source; never include it in public DTOs or reports.
  token: text("token"),
  customer: payload(), createdAt: date("created_at").notNull(), submittedAt: date("submitted_at"), revision: integer("revision").notNull(), expiresAt: date("expires_at"),
}, t => [primaryKey({ columns: [t.environment, t.id] }), uniqueIndex("custom_token").on(t.environment, t.tokenDigest),
  check("custom_revision", sql`${t.revision} >= 0`), check("custom_digest", sql`${t.tokenDigest} ~ '^[a-f0-9]{64}$'`)]);

export const customRevisions = pgTable("custom_revisions", {
  environment: env(), requestId: text("request_id").notNull(), revision: integer("revision").notNull(),
  submission: jsonb("submission").$type<CustomHatSubmission>().notNull(), submittedAt: date("submitted_at").notNull(),
}, t => [primaryKey({ columns: [t.environment, t.requestId, t.revision] }),
  foreignKey({ columns: [t.environment, t.requestId], foreignColumns: [customRequests.environment, customRequests.id] }), check("custom_revision_positive", sql`${t.revision} > 0`)]);

// Includes reservations for uploads not yet submitted. File locations stay in R2.
export const customFiles = pgTable("custom_files", {
  environment: env(), fileKey: text("file_key").notNull(), requestId: text("request_id").notNull(), expiresAt: date("expires_at"), metadata: jsonb("metadata").$type<Record<string, unknown>>(),
}, t => [primaryKey({ columns: [t.environment, t.fileKey] }),
  foreignKey({ columns: [t.environment, t.requestId], foreignColumns: [customRequests.environment, customRequests.id] })]);

// One checkpoint commits with each imported entity. Source changes are explicit
// conflicts, not permission to replace newer business records or deleted rows.
export const migrationImports = pgTable("migration_imports", {
  id: text("id").primaryKey(), sourceHash: text("source_hash").notNull(),
  archiveChecksum: text("archive_checksum").notNull(), targetTable: text("target_table").notNull(),
  importedAt: date("imported_at").notNull(),
});
