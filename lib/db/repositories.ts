import { and, eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { publicReview, type ReviewRecord } from "../reviews";
import * as schema from "./schema";

type Database = PgDatabase<PgQueryResultHKT, typeof schema>;

// Internal adapter, not an authorization boundary. Routes must retain their
// existing admin/token checks when they adopt it in a later phase.
export function reviewRepository(db: Database, environment: string) {
  return {
    async find(id: string) {
      const [row] = await db.select().from(schema.reviews).where(and(
        eq(schema.reviews.environment, environment), eq(schema.reviews.id, id),
      )).limit(1);
      return row?.record ?? null;
    },
    async published(id: string) {
      const record = await this.find(id);
      return record ? publicReview(record) : null;
    },
    async insert(record: ReviewRecord) {
      // Caller owns the transaction containing invitation/claim changes.
      await db.insert(schema.reviews).values({ environment, id: record.id,
        orderReference: record.orderReference, status: record.status,
        rating: record.rating, record, submittedAt: record.submittedAt, publishedAt: record.publishedAt });
    },
  };
}

export function customHatRepository(db: Database, environment: string) {
  return {
    async find(id: string) {
      const [row] = await db.select().from(schema.customRequests).where(and(
        eq(schema.customRequests.environment, environment), eq(schema.customRequests.id, id),
      )).limit(1);
      return row ?? null;
    },
    async ownsFile(requestId: string, fileKey: string) {
      const [row] = await db.select({ fileKey: schema.customFiles.fileKey }).from(schema.customFiles).where(and(
        eq(schema.customFiles.environment, environment), eq(schema.customFiles.requestId, requestId),
        eq(schema.customFiles.fileKey, fileKey),
      )).limit(1);
      return Boolean(row);
    },
  };
}
