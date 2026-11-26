import { sharedRedis, digest } from "../db/sharedRedis";
import { AppError } from "../errors";

const LIMIT = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then redis.call('EXPIRE', KEYS[1], 900) end
return count <= 20 and 1 or 0`;

export async function limitCheckout(request: Request) {
  // Only Vercel's platform-owned address header is trusted. Self-hosted installs
  // share a bucket until their trusted proxy integration is explicitly configured.
  const ip = process.env.VERCEL
    ? request.headers.get("x-vercel-forwarded-for") || "unknown"
    : "local";
  try {
    const allowed = await sharedRedis().eval(LIMIT, [`smelt:checkout:rate:v1:${digest(ip)}`], []);
    if (!allowed)
      throw new AppError("Too many payment attempts. Please try again in 15 minutes.", 429);
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError("Checkout is temporarily unavailable. Please try again.", 503);
  }
}
