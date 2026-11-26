import { createHash } from "node:crypto";
import { Redis } from "@upstash/redis";

export const digest = (value: string) => createHash("sha256").update(value).digest("hex");

/** Shared Redis transport; keys and domain ownership remain with the caller. */
export function sharedRedis() {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) throw new Error("Shared storage is not configured.");
  return new Redis({
    url,
    token,
    retry: { retries: 0 },
    signal: () => AbortSignal.timeout(10_000),
  });
}
