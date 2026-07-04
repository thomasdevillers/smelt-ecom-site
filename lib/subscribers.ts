// lib/subscribers.ts
import { ensureSchema, getPool, isDbConfigured } from "./db";

/** Returns true only if this email was newly added (so we welcome once). */
export async function addSubscriber(email: string): Promise<boolean> {
  if (!isDbConfigured()) return false;
  await ensureSchema();
  const { rows } = await getPool().query(
    `INSERT INTO subscribers (email) VALUES ($1)
     ON CONFLICT (email) DO NOTHING RETURNING id`,
    [email],
  );
  return rows.length > 0;
}
