import { appendFile, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { databaseConfig } from "../../lib/db/config";
import * as schema from "../../lib/db/schema";
import { privateDirectory } from "./baseline";
import { readReviewCustomSource } from "./review-custom-source";
import { planReviewCustomImport, singlePublishedOnlyResolution } from "./review-custom-plan";
import { applyReviewCustomPlan } from "./review-custom-write";
import { compareReviewCustomPlans, verifyReviewCustomPlan } from "./review-custom-check";

async function main() {
  const directory = resolve(process.argv[2] || "");
  if (!directory.startsWith(resolve(".local/migration") + "/"))
    throw new Error("Private capture directory required.");
  const args = process.argv.slice(3);
  if (
    args.some(
      (arg) =>
        arg !== "--apply" &&
        arg !== "--verify" &&
        arg !== "--keep-published-only" &&
        !arg.startsWith("--compare=") &&
        !/^--plan=[a-f0-9]{64}$/.test(arg),
    )
  )
    throw new Error("Unsupported import option.");
  const comparisons = args.filter((arg) => arg.startsWith("--compare="));
  if (
    comparisons.length > 1 ||
    [args.includes("--apply"), args.includes("--verify"), comparisons.length > 0].filter(Boolean)
      .length > 1
  )
    throw new Error("Choose only one of apply, verify or compare.");
  const source = await readReviewCustomSource(
    directory,
    await readFile(resolve(".local/migration/backup.key")),
  );
  const plan = planReviewCustomImport(
    source,
    args.includes("--keep-published-only") ? singlePublishedOnlyResolution(source) : null,
  );
  const counts: Record<string, number> = {};
  for (const entry of plan.entries) counts[entry.table] = (counts[entry.table] ?? 0) + 1;
  const reportDirectory = resolve(directory, `review-custom-${Date.now()}`);
  await privateDirectory(reportDirectory);
  const summary = {
    plan: plan.digest,
    archiveChecksum: plan.archiveChecksum,
    capturedAt: plan.capturedAt,
    sourceKeys: plan.sources.length,
    entities: counts,
    quarantined: plan.rejected.length,
    excludedRejectedReviews: plan.excluded.filter(
      (row) => row.reason === "owner-approved-rejected-duplicate",
    ).length,
    excludedDependentRecords: plan.excluded.filter(
      (row) => row.reason !== "owner-approved-rejected-duplicate",
    ).length,
    applied: false,
  };
  // Reports contain source identifiers/rejection codes, never source payloads.
  // Identifiers can be sensitive: keep reports private. Terminal is aggregates only.
  await writeFile(
    resolve(reportDirectory, "plan.private.json"),
    JSON.stringify(
      {
        ...summary,
        sources: plan.sources,
        rejected: plan.rejected,
        excluded: plan.excluded,
        approvedResolution: plan.resolution,
      },
      null,
      2,
    ),
    { mode: 0o600, flag: "wx" },
  );
  console.log(JSON.stringify(summary, null, 2));
  if (comparisons.length) {
    const nextDirectory = resolve(comparisons[0].slice("--compare=".length));
    if (!nextDirectory.startsWith(resolve(".local/migration") + "/"))
      throw new Error("Private comparison capture directory required.");
    const nextSource = await readReviewCustomSource(
      nextDirectory,
      await readFile(resolve(".local/migration/backup.key")),
    );
    const nextPlan = planReviewCustomImport(
      nextSource,
      args.includes("--keep-published-only") ? singlePublishedOnlyResolution(nextSource) : null,
    );
    const comparison = compareReviewCustomPlans(plan, nextPlan);
    await writeFile(
      resolve(reportDirectory, "comparison.private.json"),
      JSON.stringify(comparison, null, 2),
      { mode: 0o600, flag: "wx" },
    );
    console.log(
      JSON.stringify({
        before: comparison.before,
        after: comparison.after,
        counts: comparison.counts,
        digest: comparison.digest,
      }),
    );
    console.log(
      "Offline comparison only. Removed entities may reflect deletion or expiry; no reconciliation writes performed.",
    );
    return;
  }
  if (args.includes("--verify")) {
    if (!args.includes(`--plan=${plan.digest}`))
      throw new Error("Verification requires the exact reviewed --plan digest.");
    if (plan.rejected.length) throw new Error("Resolve quarantined records before verification.");
    const config = databaseConfig(process.env, "migration");
    const pool = new Pool({
      connectionString: config.connectionString,
      max: 1,
      connectionTimeoutMillis: 10_000,
      statement_timeout: 15_000,
    });
    try {
      const result = await verifyReviewCustomPlan(drizzle(pool, { schema }), plan);
      await writeFile(
        resolve(reportDirectory, "verification.private.json"),
        JSON.stringify(result, null, 2),
        { mode: 0o600, flag: "wx" },
      );
      console.log(
        JSON.stringify({
          plan: result.plan,
          valid: result.valid,
          counts: result.counts,
          checksums: result.checksums,
        }),
      );
      if (!result.valid) process.exitCode = 1;
    } finally {
      await pool.end();
    }
    return;
  }
  if (!args.includes("--apply")) {
    console.log("Dry run only; no database/provider connections or source mutations.");
    return;
  }
  if (!args.includes(`--plan=${plan.digest}`))
    throw new Error("Apply requires the exact reviewed --plan digest from a dry run.");
  if (plan.rejected.length)
    throw new Error("Quarantined records need review before any database import.");
  const config = databaseConfig(process.env, "migration");
  const pool = new Pool({
    connectionString: config.connectionString,
    max: 1,
    connectionTimeoutMillis: 10_000,
    statement_timeout: 15_000,
  });
  try {
    const db = drizzle(pool, { schema });
    // The checkpoint table must be applied through the normal schema migration
    // first. This command never creates/changes the schema automatically.
    await db.select({ id: schema.migrationImports.id }).from(schema.migrationImports).limit(0);
    const outcomes = resolve(reportDirectory, "outcomes.private.jsonl");
    await writeFile(outcomes, "", { mode: 0o600, flag: "wx" });
    const result = await applyReviewCustomPlan(db, plan, async (row) => {
      await appendFile(outcomes, JSON.stringify(row) + "\n");
    });
    await writeFile(
      resolve(reportDirectory, "result.json"),
      JSON.stringify({ ...result, plan: plan.digest, completedAt: new Date().toISOString() }),
      { mode: 0o600, flag: "wx" },
    );
    console.log(JSON.stringify(result));
  } finally {
    await pool.end();
  }
}
main().catch(() => {
  console.error(
    "Review/custom-hat import stopped. Check the private report, archive and schema; no source payloads or credentials logged.",
  );
  process.exitCode = 1;
});
