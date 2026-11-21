import "server-only";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { databaseConfig } from "./config";
import * as schema from "./schema";

// Lazy: deploying this foundation does not require or contact Neon.
let client: ReturnType<typeof createDatabase> | undefined;
function createDatabase() {
  const config = databaseConfig(process.env);
  const pool = new Pool({ connectionString: config.connectionString, max: 3,
    idleTimeoutMillis: 10_000, connectionTimeoutMillis: 10_000,
    statement_timeout: 15_000, idle_in_transaction_session_timeout: 15_000 });
  pool.on("error", () => console.error("PostgreSQL idle connection failed."));
  return { db: drizzle(pool, { schema }) };
}
export function postgresStore() { return client ??= createDatabase(); }
