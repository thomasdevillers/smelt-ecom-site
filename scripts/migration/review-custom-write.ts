/** Insert-only, resumable PostgreSQL importer. Never imports provider modules. */
import { and, eq, getTableColumns, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as s from "../../lib/db/schema";
import { canonical, type ImportEntry, type ImportPlan, type ImportTable } from "./review-custom-plan";

export type Database = PgDatabase<PgQueryResultHKT, typeof s>;
export const tables = {
  reviews: s.reviews, review_invitations: s.reviewInvitations, review_claims: s.reviewClaims,
  review_uploads: s.reviewUploads, review_rankings: s.reviewRankings, custom_requests: s.customRequests,
  custom_revisions: s.customRevisions, custom_files: s.customFiles,
} satisfies Record<ImportTable, unknown>;

export class ImportConflict extends Error {
  constructor() { super("Source or destination changed; explicit reconciliation is required."); }
}

export async function writeImportEntry(db: Database, entry: ImportEntry, archiveChecksum: string): Promise<"inserted" | "matched" | "checkpointed"> {
  return db.transaction(async tx => {
    // Serialize competing imports of the same entity, not unrelated customers.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${entry.id}, 0))`);
    const [checkpoint] = await tx.select().from(s.migrationImports).where(eq(s.migrationImports.id, entry.id));
    if (checkpoint) {
      if (checkpoint.sourceHash !== entry.sourceHash || checkpoint.targetTable !== entry.table) throw new ImportConflict();
      // Do not resurrect records deleted or edited after an earlier import.
      return "checkpointed";
    }
    await tx.insert(s.environments).values({ id: entry.environment, paymentMode: entry.environment }).onConflictDoNothing();
    const [namespace] = await tx.select().from(s.environments).where(eq(s.environments.id, entry.environment));
    if (namespace?.paymentMode !== entry.environment) throw new ImportConflict();
    if (entry.orderReference) {
      await tx.insert(s.orders).values({ environment: entry.environment, reference: entry.orderReference, paymentStatus: "unknown", snapshot: {} }).onConflictDoNothing();
    }
    const table = tables[entry.table];
    if (!table) throw new ImportConflict();
    const columns = new Map(Object.values(getTableColumns(table)).map(column => [column.name, column]));
    const values: Record<string, unknown> = { ...entry.values, environment: entry.environment };
    const fields = Object.keys(values).sort();
    if (fields.some(field => !columns.has(field))) throw new ImportConflict();
    const parameters = fields.map(field => {
      const value = values[field];
      return columns.get(field)!.dataType === "json" && value !== null ? sql`${JSON.stringify(value)}::jsonb` : sql`${value}`;
    });
    const inserted = await tx.execute(sql`insert into ${table} (${sql.join(fields.map(field => sql.identifier(field)), sql`, `)})
      values (${sql.join(parameters, sql`, `)}) on conflict do nothing returning *`);
    const wrote = (inserted as { rows: unknown[] }).rows.length > 0;
    if (!wrote) {
      const identity = { ...entry.key, environment: entry.environment };
      const predicates = Object.entries(identity).map(([field, value]) => {
        const column = columns.get(field); if (!column) throw new ImportConflict();
        return eq(column, value);
      });
      const result = await tx.execute(sql`select * from ${table} where ${and(...predicates)} limit 1`);
      const [existing] = (result as { rows: Record<string, unknown>[] }).rows;
      if (!existing) throw new ImportConflict();
      for (const field of fields) {
        const column = columns.get(field)!;
        const normalise = (value: unknown) => value !== null && column.getSQLType().startsWith("timestamp")
          ? (value instanceof Date ? value : new Date(String(value))).toISOString() : canonical(value);
        if (normalise(existing[field]) !== normalise(values[field])) throw new ImportConflict();
      }
    }
    await tx.insert(s.migrationImports).values({ id: entry.id, sourceHash: entry.sourceHash, archiveChecksum,
      targetTable: entry.table, importedAt: new Date().toISOString() });
    return wrote ? "inserted" : "matched";
  });
}

export async function applyReviewCustomPlan(db: Database, plan: ImportPlan,
  report: (outcome: { id: string; table: ImportTable; outcome: "inserted" | "matched" | "checkpointed" | "failed" }) => Promise<void> = async () => {}) {
  if (plan.rejected.length || plan.sources.some(source => source.decision === "quarantined")) throw new Error("Resolve quarantined records before applying this plan.");
  const counts = { inserted: 0, matched: 0, checkpointed: 0 };
  for (const entry of plan.entries) {
    try {
      const outcome = await writeImportEntry(db, entry, plan.archiveChecksum);
      counts[outcome]++;
      await report({ id: entry.id, table: entry.table, outcome });
    } catch {
      await report({ id: entry.id, table: entry.table, outcome: "failed" });
      throw new Error("Import stopped. Earlier entities are checkpointed; inspect the private outcome report before resuming.");
    }
  }
  return counts;
}
