import { AppError as AdminError } from "../errors";
export { AppError as AdminError } from "../errors";
// Compatibility names for existing domain adapters during storage consolidation.
export { sharedRedis as adminStore, digest } from "../db/sharedRedis";
export function adminJson(data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex, nofollow" },
  });
}
export function adminFailure(error: unknown) {
  if (error instanceof AdminError) return adminJson({ error: error.message }, error.status);
  console.error("Admin operation failed", error instanceof Error ? error.name : "Unknown error");
  return adminJson(
    {
      error:
        "Could not complete this request. Please try again. If an email was submitted, refresh its status before retrying.",
    },
    503,
  );
}
export function requireSameOrigin(request: Request) {
  const url = new URL(request.url);
  const expected = `${url.protocol}//${request.headers.get("host") || url.host}`;
  if (request.headers.get("origin") !== expected)
    throw new AdminError("Request origin is not allowed.", 403);
}
export async function readAdminBody(request: Request): Promise<Record<string, unknown>> {
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    throw new AdminError("Expected JSON.", 415);
  const text = await request.text();
  if (text.length > 4096) throw new AdminError("Request is too large.", 413);
  try {
    const value = JSON.parse(text);
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error();
    return value;
  } catch {
    throw new AdminError("Invalid request.");
  }
}
