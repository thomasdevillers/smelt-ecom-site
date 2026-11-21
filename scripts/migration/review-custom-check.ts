/** Read-only reconciliation. Reports contain hashed identities, never payloads. */
import { getTableColumns, sql } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/pg-core";
import { sha256 } from "./baseline";
import { canonical, type ImportPlan, type ImportTable } from "./review-custom-plan";
import { tables, type Database } from "./review-custom-write";

function assertReviewed(plan: ImportPlan) {
  if (plan.rejected.length || plan.sources.some(row => row.decision === "quarantined")) {
    throw new Error("Resolve quarantined records before reconciliation.");
  }
}

export function compareReviewCustomPlans(before: ImportPlan, after: ImportPlan) {
  assertReviewed(before); assertReviewed(after);
  if (Date.parse(after.capturedAt) < Date.parse(before.capturedAt)) throw new Error("Comparison capture predates the baseline.");
  const previous = new Map(before.entries.map(entry => [entry.id, entry]));
  const current = new Map(after.entries.map(entry => [entry.id, entry]));
  const outcomes: { id: string; table: ImportTable; outcome: "added" | "changed" | "removed" | "unchanged" }[] = [];
  for (const entry of after.entries) {
    const old = previous.get(entry.id);
    outcomes.push({ id: entry.id, table: entry.table, outcome: !old ? "added" : old.sourceHash === entry.sourceHash ? "unchanged" : "changed" });
  }
  for (const entry of before.entries) if (!current.has(entry.id)) outcomes.push({ id: entry.id, table: entry.table, outcome: "removed" });
  outcomes.sort((a, b) => a.id.localeCompare(b.id));
  const counts = { added: 0, changed: 0, removed: 0, unchanged: 0 };
  for (const row of outcomes) counts[row.outcome]++;
  return { before: before.digest, after: after.digest, counts, outcomes, digest: sha256(canonical(outcomes)) };
}

export async function verifyReviewCustomPlan(db: Database, plan: ImportPlan) {
  assertReviewed(plan);
  return db.transaction(async tx => {
    // One consistent snapshot, enforced read-only by PostgreSQL itself.
    await tx.execute(sql`set transaction isolation level repeatable read, read only`);
    const counts = { matched: 0, missing: 0, changed: 0, unexpected: 0 };
    const outcomes: { id: string; table: ImportTable; outcome: keyof typeof counts }[] = [];
    const checksums: { table: ImportTable; expected: number; actual: number; expectedChecksum: string; actualChecksum: string }[] = [];
    for (const name of Object.keys(tables) as ImportTable[]) {
      const table = tables[name], columns = getTableColumns(table);
      const byName = new Map(Object.values(columns).map(column => [column.name, column]));
      const entries = plan.entries.filter(entry => entry.table === name);
      // Check both explicit source environments, including tables with zero planned rows.
      const result = await tx.execute(sql`select * from ${table} where environment in ('live', 'test')`);
      const rows = (result as { rows: Record<string, unknown>[] }).rows;
      const keyFields = [...new Set([
        ...Object.values(columns).filter(column => column.primary),
        ...getTableConfig(table).primaryKeys.flatMap(key => key.columns),
      ].map(column => column.name))];
      if (!keyFields.length) throw new Error("Reconciliation requires a primary key.");
      const identity = (row: Record<string, unknown>) => canonical(Object.fromEntries(keyFields.map(key => [key, row[key]])));
      const actual = new Map(rows.map(row => [identity(row), row]));
      const expectedHashes: string[] = [], actualHashes: string[] = [];
      for (const entry of entries) {
        const key = identity({ ...entry.key, environment: entry.environment });
        const row = actual.get(key);
        const expected: Record<string, unknown> = { ...entry.values, environment: entry.environment };
        const normalise = (field: string, value: unknown) => value !== null && byName.get(field)?.getSQLType().startsWith("timestamp")
          ? (value instanceof Date ? value : new Date(String(value))).toISOString() : value;
        const project = (value: Record<string, unknown>) => Object.fromEntries(Object.keys(expected).sort().map(field => [field, normalise(field, value[field])]));
        const expectedHash = sha256(canonical({ key, values: project(expected) }));
        expectedHashes.push(expectedHash);
        let outcome: keyof typeof counts = "missing";
        if (row) {
          const actualHash = sha256(canonical({ key, values: project(row) }));
          actualHashes.push(actualHash);
          outcome = actualHash === expectedHash ? "matched" : "changed";
          actual.delete(key);
        }
        counts[outcome]++; outcomes.push({ id: entry.id, table: name, outcome });
      }
      for (const [key, row] of actual) {
        counts.unexpected++;
        outcomes.push({ id: sha256(canonical({ table: name, key })), table: name, outcome: "unexpected" });
        actualHashes.push(sha256(canonical(row)));
      }
      checksums.push({ table: name, expected: entries.length, actual: rows.length,
        expectedChecksum: sha256(canonical(expectedHashes.sort())), actualChecksum: sha256(canonical(actualHashes.sort())) });
    }
    return { plan: plan.digest, valid: !counts.missing && !counts.changed && !counts.unexpected, counts, checksums, outcomes };
  });
}
