import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { Pool } from "pg";
import { databaseConfig } from "../../lib/db/config";

async function main() {
  const config = databaseConfig(process.env, "migration");
  const migrations = readMigrationFiles({ migrationsFolder: "./drizzle" });
  const pool = new Pool({ connectionString: config.connectionString, max: 1,
    connectionTimeoutMillis: 10_000, statement_timeout: 60_000 });
  try {
    // Serialize migration runs, using the single session held by this pool.
    const client = await pool.connect();
    let locked = false;
    try {
      const historyExists = await client.query<{ present: boolean }>("select to_regclass('drizzle.__drizzle_migrations') is not null as present");
      const history = historyExists.rows[0].present
        ? (await client.query<{ hash: string }>("select hash from drizzle.__drizzle_migrations order by id")).rows : [];
      if (history.length > migrations.length || history.some((row, i) => row.hash !== migrations[i].hash))
        throw new Error("Applied migration history differs from the local files.");
      const pending = migrations.length - history.length;
      console.log(`${pending} pending schema migration(s).`);
      if (!process.argv.includes("--apply")) {
        console.log("Read-only check complete. Add --apply to apply schema changes; customer data is not imported.");
        return;
      }
      if (!history.length) {
        const existing = await client.query("select 1 from information_schema.tables where table_schema not in ('pg_catalog','information_schema','drizzle') limit 1");
        if (existing.rowCount) throw new Error("Initial setup expects an empty database; existing tables need review.");
      }
      const result = await client.query<{ locked: boolean }>("select pg_try_advisory_lock(71986201) as locked");
      locked = result.rows[0].locked;
      if (!locked) throw new Error("Another schema migration is running.");
      await migrate(drizzle(client), { migrationsFolder: "./drizzle" });
      console.log("PostgreSQL schema migrations applied.");
    } finally {
      try { if (locked) await client.query("select pg_advisory_unlock(71986201)"); }
      finally { client.release(); }
    }
  } finally { await pool.end(); }
}
main().catch(() => { console.error("PostgreSQL migration failed. Check destination configuration and migration history privately."); process.exitCode = 1; });
