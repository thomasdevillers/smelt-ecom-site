import { createHash } from "node:crypto";
import { Redis } from "@upstash/redis";

export const digest = (value: string) => createHash("sha256").update(value).digest("hex");
export function adminStore() {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) throw new Error("Shared storage is not configured.");
  return new Redis({ url, token, retry: { retries: 0 }, signal: () => AbortSignal.timeout(10_000) });
}
export class AdminError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
export function adminJson(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex, nofollow" } });
}
export function adminFailure(error: unknown) {
  if (error instanceof AdminError) return adminJson({ error: error.message }, error.status);
  console.error("Admin operation failed", error instanceof Error ? error.name : "Unknown error");
  return adminJson({ error: "Could not complete this request. Please try again. If an email was submitted, refresh its status before retrying." }, 503);
}
export function requireSameOrigin(request: Request) {
  const url = new URL(request.url);
  const expected = `${url.protocol}//${request.headers.get("host") || url.host}`;
  if (request.headers.get("origin") !== expected) throw new AdminError("Request origin is not allowed.", 403);
}
export async function readAdminBody(request: Request): Promise<Record<string, unknown>> {
  if (!request.headers.get("content-type")?.startsWith("application/json")) throw new AdminError("Expected JSON.", 415);
  const text = await request.text();
  if (text.length > 4096) throw new AdminError("Request is too large.", 413);
  try {
    const value = JSON.parse(text);
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error();
    return value;
  } catch { throw new AdminError("Invalid request."); }
}
