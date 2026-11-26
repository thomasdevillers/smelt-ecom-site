import { and, desc, eq, gt, isNull, or, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { AdminError } from "../admin/store";
import type { ReviewNamespace } from "../reviewNamespace";
import type { ReviewInvitation } from "../reviewStore";
import { REVIEW_MAX_PHOTOS, type ReviewRecord, type ReviewStatus } from "../reviews";
import type { ReviewRanking } from "../reviewRanking";
import * as s from "./schema";

export type DomainDatabase = PgDatabase<PgQueryResultHKT, typeof s>;
export type RankingRetry = {
  fingerprint: string;
  attempts: number;
  nextAttemptAt: number;
  sourceExpiresAt?: string | null;
};

export function reviewDomain(db: DomainDatabase, environment: ReviewNamespace) {
  const reviewWhere = (id: string) =>
    and(eq(s.reviews.environment, environment), eq(s.reviews.id, id));
  const inviteWhere = (tokenDigest: string) =>
    and(
      eq(s.reviewInvitations.environment, environment),
      eq(s.reviewInvitations.tokenDigest, tokenDigest),
    );
  const orderWhere = (reference: string) =>
    and(eq(s.orders.environment, environment), eq(s.orders.reference, reference));
  const rankingWhere = (id: string) =>
    and(eq(s.reviewRankings.environment, environment), eq(s.reviewRankings.reviewId, id));
  const validExpiry = (now: string) =>
    or(isNull(s.reviewUploads.expiresAt), gt(s.reviewUploads.expiresAt, now));
  async function lockOrder(tx: DomainDatabase, reference: string) {
    await tx
      .insert(s.environments)
      .values({ id: environment, paymentMode: environment })
      .onConflictDoNothing();
    const [namespace] = await tx
      .select()
      .from(s.environments)
      .where(eq(s.environments.id, environment));
    if (namespace?.paymentMode !== environment)
      throw new AdminError("Review environment ownership needs reconciliation.", 503);
    await tx
      .insert(s.orders)
      .values({ environment, reference, paymentStatus: "unknown", snapshot: {} })
      .onConflictDoNothing();
    // Invitation replacement, upload reservations and submission share one lock.
    await tx.select().from(s.orders).where(orderWhere(reference)).for("update");
  }
  async function findInvitation(database: DomainDatabase, tokenDigest: string) {
    const [row] = await database.select().from(s.reviewInvitations).where(inviteWhere(tokenDigest));
    return row ?? null;
  }
  async function usableInvitation(tx: DomainDatabase, tokenDigest: string) {
    const initial = await findInvitation(tx, tokenDigest);
    if (!initial) throw new AdminError("This review link is invalid or has expired.", 404);
    await lockOrder(tx, initial.orderReference);
    const row = await findInvitation(tx, tokenDigest);
    if (
      !row ||
      row.state === "revoked" ||
      row.state === "expired" ||
      Date.parse(row.expiresAt) <= Date.now()
    ) {
      throw new AdminError("This review link is invalid or has expired.", 404);
    }
    const [claim] = await tx
      .select()
      .from(s.reviewClaims)
      .where(
        and(
          eq(s.reviewClaims.environment, environment),
          eq(s.reviewClaims.orderReference, row.orderReference),
        ),
      )
      .limit(1);
    const [review] = await tx
      .select()
      .from(s.reviews)
      .where(
        and(
          eq(s.reviews.environment, environment),
          eq(s.reviews.orderReference, row.orderReference),
        ),
      )
      .limit(1);
    if (row.state === "used" || claim || review)
      throw new AdminError("This review link has already been used.", 409);
    return row;
  }
  return {
    async list(status?: ReviewStatus) {
      const rows = await db
        .select()
        .from(s.reviews)
        .where(
          and(
            eq(s.reviews.environment, environment),
            status ? eq(s.reviews.status, status) : undefined,
          ),
        )
        .orderBy(desc(s.reviews.submittedAt));
      return rows.map((row) => row.record);
    },
    async find(id: string) {
      const [row] = await db.select().from(s.reviews).where(reviewWhere(id));
      return row?.record ?? null;
    },
    async hasReview(reference: string) {
      const [row] = await db
        .select({ id: s.reviews.id })
        .from(s.reviews)
        .where(and(eq(s.reviews.environment, environment), eq(s.reviews.orderReference, reference)))
        .limit(1);
      return Boolean(row);
    },
    async hasInvitation(reference: string) {
      const [row] = await db
        .select({ digest: s.reviewInvitations.tokenDigest })
        .from(s.reviewInvitations)
        .where(
          and(
            eq(s.reviewInvitations.environment, environment),
            eq(s.reviewInvitations.orderReference, reference),
            or(eq(s.reviewInvitations.state, "active"), eq(s.reviewInvitations.state, "used")),
            gt(s.reviewInvitations.expiresAt, new Date().toISOString()),
          ),
        )
        .limit(1);
      return Boolean(row);
    },
    async createInvitation(tokenDigest: string, invitation: ReviewInvitation) {
      await db.transaction(async (tx) => {
        await lockOrder(tx, invitation.reference);
        const [existing] = await tx
          .select()
          .from(s.reviews)
          .where(
            and(
              eq(s.reviews.environment, environment),
              eq(s.reviews.orderReference, invitation.reference),
            ),
          )
          .limit(1);
        const [claim] = await tx
          .select()
          .from(s.reviewClaims)
          .where(
            and(
              eq(s.reviewClaims.environment, environment),
              eq(s.reviewClaims.orderReference, invitation.reference),
            ),
          )
          .limit(1);
        if (existing || claim)
          throw new AdminError("A review has already been submitted for this order.", 409);
        await tx
          .update(s.reviewInvitations)
          .set({ state: "revoked" })
          .where(
            and(
              eq(s.reviewInvitations.environment, environment),
              eq(s.reviewInvitations.orderReference, invitation.reference),
              eq(s.reviewInvitations.state, "active"),
            ),
          );
        await tx.insert(s.reviewInvitations).values({
          environment,
          tokenDigest,
          orderReference: invitation.reference,
          state: "active",
          details: { ...invitation },
          createdAt: invitation.createdAt,
          expiresAt: invitation.expiresAt,
        });
      });
    },
    async invitation(tokenDigest: string) {
      const row = await findInvitation(db, tokenDigest);
      if (
        !row ||
        row.state === "revoked" ||
        row.state === "expired" ||
        Date.parse(row.expiresAt) <= Date.now()
      )
        return null;
      const [claim] = await db
        .select()
        .from(s.reviewClaims)
        .where(
          and(
            eq(s.reviewClaims.environment, environment),
            eq(s.reviewClaims.orderReference, row.orderReference),
          ),
        )
        .limit(1);
      const [review] = await db
        .select()
        .from(s.reviews)
        .where(
          and(
            eq(s.reviews.environment, environment),
            eq(s.reviews.orderReference, row.orderReference),
          ),
        )
        .limit(1);
      // Absolute SQL expiry may be earlier than the original business payload.
      return {
        invitation: {
          ...row.details,
          expiresAt: new Date(row.expiresAt).toISOString(),
        } as unknown as ReviewInvitation,
        tokenDigest,
        used: row.state === "used" || Boolean(claim || review),
      };
    },
    async reserveUpload(tokenDigest: string, pathname: string) {
      return db.transaction(async (tx) => {
        const row = await usableInvitation(tx, tokenDigest);
        const uploadKey = String(row.details.uploadKey);
        const prefix = `reviews/pending/${uploadKey}/`;
        if (
          !pathname.startsWith(prefix) ||
          !/^[^/]+\.(?:webp|jpg)$/.test(pathname.slice(prefix.length))
        )
          throw new AdminError("Invalid photo path.");
        const now = new Date().toISOString();
        const reservations = await tx
          .select()
          .from(s.reviewUploads)
          .where(
            and(
              eq(s.reviewUploads.environment, environment),
              eq(s.reviewUploads.tokenDigest, tokenDigest),
              validExpiry(now),
            ),
          );
        if (reservations.some((upload) => upload.pathname === pathname)) return uploadKey;
        if (reservations.length >= REVIEW_MAX_PHOTOS * 4)
          throw new AdminError("Too many photo upload attempts. Please try again in an hour.", 429);
        // Match the original set's first-reservation expiry, never extend it on retries.
        const expiresAt =
          reservations[0]?.expiresAt ?? new Date(Date.now() + 3_600_000).toISOString();
        const [existing] = await tx
          .select()
          .from(s.reviewUploads)
          .where(
            and(
              eq(s.reviewUploads.environment, environment),
              eq(s.reviewUploads.pathname, pathname),
            ),
          );
        if (existing && existing.tokenDigest !== tokenDigest)
          throw new AdminError("Invalid photo path.");
        await tx
          .insert(s.reviewUploads)
          .values({ environment, pathname, tokenDigest, expiresAt })
          .onConflictDoUpdate({
            target: [s.reviewUploads.environment, s.reviewUploads.pathname],
            set: { expiresAt },
          });
        return uploadKey;
      });
    },
    async submit(tokenDigest: string, record: ReviewRecord) {
      await db.transaction(async (tx) => {
        const invitation = await usableInvitation(tx, tokenDigest);
        if (
          invitation.orderReference !== record.orderReference ||
          invitation.details.email !== record.customerEmail
        )
          throw new AdminError("This review link no longer matches the paid order.", 409);
        await tx.insert(s.reviews).values({
          environment,
          id: record.id,
          orderReference: record.orderReference,
          status: record.status,
          rating: record.rating,
          record,
          submittedAt: record.submittedAt,
          publishedAt: record.publishedAt,
        });
        await tx.insert(s.reviewClaims).values({
          environment,
          tokenDigest,
          orderReference: record.orderReference,
          reviewId: record.id,
          claimedAt: record.submittedAt,
          evidence: {},
        });
        await tx.update(s.reviewInvitations).set({ state: "used" }).where(inviteWhere(tokenDigest));
        for (const photo of record.photos) {
          const stored = await tx
            .insert(s.reviewUploads)
            .values({
              environment,
              tokenDigest,
              pathname: photo.pathname,
              url: photo.url,
              reviewId: record.id,
              expiresAt: null,
            })
            .onConflictDoUpdate({
              target: [s.reviewUploads.environment, s.reviewUploads.pathname],
              set: { url: photo.url, reviewId: record.id, expiresAt: null },
              setWhere: eq(s.reviewUploads.tokenDigest, tokenDigest),
            })
            .returning({ pathname: s.reviewUploads.pathname });
          if (!stored.length) throw new AdminError("One of the uploaded photos is not valid.");
        }
      });
    },
    async update(
      id: string,
      change: (record: ReviewRecord) => ReviewRecord | Promise<ReviewRecord>,
    ) {
      return db.transaction(async (tx) => {
        const [row] = await tx.select().from(s.reviews).where(reviewWhere(id)).for("update");
        if (!row) throw new AdminError("Review not found.", 404);
        const record = await change(row.record);
        await tx
          .update(s.reviews)
          .set({
            record,
            status: record.status,
            rating: record.rating,
            publishedAt: record.publishedAt,
          })
          .where(reviewWhere(id));
        const retained = new Set(record.photos.map((photo) => photo.pathname));
        for (const photo of row.record.photos)
          if (!retained.has(photo.pathname)) {
            await tx
              .delete(s.reviewUploads)
              .where(
                and(
                  eq(s.reviewUploads.environment, environment),
                  eq(s.reviewUploads.reviewId, id),
                  eq(s.reviewUploads.pathname, photo.pathname),
                ),
              );
          }
        return record;
      });
    },
    async rankings() {
      const rows = await db
        .select()
        .from(s.reviewRankings)
        .where(eq(s.reviewRankings.environment, environment));
      return Object.fromEntries(
        rows.filter((row) => row.result).map((row) => [row.reviewId, row.result!]),
      ) as Record<string, ReviewRanking>;
    },
    async retry(id: string): Promise<RankingRetry | null> {
      const [row] = await db.select().from(s.reviewRankings).where(rankingWhere(id));
      const retry = row?.retryState as RankingRetry | null;
      return retry && (!retry.sourceExpiresAt || Date.parse(retry.sourceExpiresAt) > Date.now())
        ? retry
        : null;
    },
    async saveRanking(id: string, result: ReviewRanking) {
      await db
        .insert(s.reviewRankings)
        .values({ environment, reviewId: id, result, retryState: null })
        .onConflictDoUpdate({
          target: [s.reviewRankings.environment, s.reviewRankings.reviewId],
          set: { result, retryState: null },
        });
    },
    async saveRetry(id: string, retry: RankingRetry) {
      await db
        .insert(s.reviewRankings)
        .values({ environment, reviewId: id, retryState: { ...retry } })
        .onConflictDoUpdate({
          target: [s.reviewRankings.environment, s.reviewRankings.reviewId],
          set: { retryState: { ...retry } },
        });
    },
    async expireTemporaryState(now = new Date().toISOString()) {
      // Explicit cleanup never deletes claims, business records or provider files.
      return db.transaction(async (tx) => {
        const invitations = await tx
          .update(s.reviewInvitations)
          .set({ state: "expired" })
          .where(
            and(
              eq(s.reviewInvitations.environment, environment),
              eq(s.reviewInvitations.state, "active"),
              sql`${s.reviewInvitations.expiresAt} <= ${now}`,
            ),
          )
          .returning({ id: s.reviewInvitations.tokenDigest });
        const uploads = await tx
          .delete(s.reviewUploads)
          .where(
            and(
              eq(s.reviewUploads.environment, environment),
              isNull(s.reviewUploads.reviewId),
              sql`${s.reviewUploads.expiresAt} <= ${now}`,
            ),
          )
          .returning({ id: s.reviewUploads.pathname });
        const retries = await tx
          .update(s.reviewRankings)
          .set({ retryState: null })
          .where(
            and(
              eq(s.reviewRankings.environment, environment),
              sql`(${s.reviewRankings.retryState}->>'sourceExpiresAt')::timestamptz <= ${now}`,
            ),
          )
          .returning({ id: s.reviewRankings.reviewId });
        return {
          invitations: invitations.length,
          uploads: uploads.length,
          retries: retries.length,
        };
      });
    },
  };
}
