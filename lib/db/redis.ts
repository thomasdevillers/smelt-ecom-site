import "server-only";
import { Redis } from "@upstash/redis";

// New operational-only entry point. The mixed legacy adminStore stays intact
// until each domain is explicitly cut over; do not redirect it to PostgreSQL.
export function operationalRedis() {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) throw new Error("Operational Redis is not configured.");
  return new Redis({ url, token, retry: { retries: 0 }, signal: () => AbortSignal.timeout(10_000) });
}
