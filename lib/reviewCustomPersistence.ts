import { AdminError } from "./admin/store";

// One switch owns both reads and writes. Never fall back after a PostgreSQL error.
export function reviewCustomStore(
  env: Record<string, string | undefined> = process.env,
): "redis" | "postgres" {
  const value = env.REVIEW_CUSTOM_STORE || "redis";
  if (value !== "redis" && value !== "postgres")
    throw new AdminError("Review/design storage configuration is invalid.", 503);
  if (value === "postgres" && env.VERCEL_ENV && env.VERCEL_ENV !== "production") {
    throw new AdminError("Review/design PostgreSQL access is disabled in previews.", 503);
  }
  return value;
}

export function assertReviewCustomWritable() {
  reviewCustomStore(); // Validate even when a mutation starts with a provider call.
  const pause = process.env.REVIEW_CUSTOM_PAUSED;
  if (pause && pause !== "true" && pause !== "false")
    throw new AdminError("Review/design pause configuration is invalid.", 503);
  if (pause === "true") {
    throw new AdminError(
      "Reviews and custom designs are temporarily paused. Please try again shortly.",
      503,
    );
  }
}

let databaseModule: Promise<typeof import("./db/client")> | undefined;
export async function reviewCustomDatabase() {
  // Do not load a driver or require Neon for the default Redis path.
  const { postgresStore } = await (databaseModule ??= import("./db/client"));
  return postgresStore().db;
}
