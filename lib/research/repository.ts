import { and, count, desc, eq, isNotNull, lt, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { researchResponses, researchRateLimits } from "../db/research-schema";
import type { ResearchSave } from "./shared";
import { PRODUCTS } from "./shared";

// The small query surface is shared with isolated PostgreSQL integration tests.
export function researchRepository(db: Pick<PgDatabase<PgQueryResultHKT>, "insert" | "select" | "delete">, environment: string) {
  return {
    async save(id: string, input: ResearchSave) {
      const now = new Date().toISOString();
      await db.insert(researchResponses).values({ environment, id, version: input.version, revision: input.revision, answers: input.answers, updatedAt: now, completedAt: input.completed ? now : null })
        .onConflictDoUpdate({ target: [researchResponses.environment, researchResponses.id],
          set: { revision: input.revision, answers: input.answers, updatedAt: now, completedAt: input.completed ? now : null },
          setWhere: sql`${researchResponses.revision} < ${input.revision}` });
      const [row] = await db.select({ revision: researchResponses.revision }).from(researchResponses).where(and(eq(researchResponses.environment, environment), eq(researchResponses.id, id)));
      return row.revision;
    },
    async allow(key: string, limit: number) {
      // Expiring counters, not Redis. One key per IP/global counter; no raw IP stored.
      const now = new Date().toISOString();
      if (key === "global") await db.delete(researchRateLimits).where(lt(researchRateLimits.expiresAt, now));
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
      const [row] = await db.insert(researchRateLimits).values({ key: `${environment}:${key}`, hits: 1, expiresAt }).onConflictDoUpdate({ target: researchRateLimits.key,
        set: { hits: sql`case when ${researchRateLimits.expiresAt} <= ${now}::timestamptz then 1 else ${researchRateLimits.hits} + 1 end`, expiresAt: sql`case when ${researchRateLimits.expiresAt} <= ${now}::timestamptz then ${expiresAt}::timestamptz else ${researchRateLimits.expiresAt} end` },
      }).returning({ hits: researchRateLimits.hits });
      return row.hits <= limit;
    },
    async list(page: number) {
      const scope = eq(researchResponses.environment, environment);
      const [totals] = await db.select({ total: count(), completed: sql<number>`count(*) filter (where ${isNotNull(researchResponses.completedAt)})::integer` }).from(researchResponses).where(scope);
      const pageCount = Math.max(1, Math.ceil(totals.total / 25));
      const current = Math.min(page, pageCount);
      const responses = await db.select({ id: researchResponses.id, version: researchResponses.version, revision: researchResponses.revision, answers: researchResponses.answers, createdAt: researchResponses.createdAt, updatedAt: researchResponses.updatedAt, completedAt: researchResponses.completedAt }).from(researchResponses).where(scope).orderBy(desc(researchResponses.updatedAt), desc(researchResponses.id)).limit(25).offset((current - 1) * 25);
      const interestColumns = Object.fromEntries(PRODUCTS.map(product => [product,
        sql<number>`count(*) filter (where (${researchResponses.answers}->'products') ? ${product})::integer`,
      ]));
      const [counts] = await db.select(interestColumns).from(researchResponses).where(scope);
      const interest = PRODUCTS.map(product => ({ product, count: counts[product] }));
      return { responses, interest, ...totals, page: current, pageCount };
    },
  };
}
