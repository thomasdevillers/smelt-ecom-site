import { AdminError, requireSameOrigin } from "@/lib/admin/store";
import { listPublishedReviews, submitReview } from "@/lib/reviewStore";

export const runtime = "nodejs";

function response(data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": status === 200 ? "public, max-age=0, s-maxage=60, stale-while-revalidate=300" : "no-store" },
  });
}

function failure(error: unknown) {
  if (error instanceof AdminError) return response({ error: error.message }, error.status);
  if (error instanceof Error && error.message.startsWith("Your review")) return response({ error: error.message }, 400);
  if (error instanceof Error && (error.message.startsWith("Choose") || error.message.startsWith("Add") || error.message.startsWith("Please confirm")))
    return response({ error: error.message }, 400);
  console.error("Review request failed", error instanceof Error ? error.name : "Unknown error");
  return response({ error: "Reviews are temporarily unavailable. Please try again." }, 503);
}

export async function GET() {
  try { return response(await listPublishedReviews()); }
  catch (error) { return failure(error); }
}

export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    if (!request.headers.get("content-type")?.startsWith("application/json")) throw new AdminError("Expected JSON.", 415);
    const raw = await request.text();
    if (raw.length > 12_000) throw new AdminError("Review is too large.", 413);
    const body = JSON.parse(raw) as Record<string, unknown>;
    if (typeof body.token !== "string") throw new AdminError("A review link is required.");
    return response(await submitReview(body.token, body), 201);
  } catch (error) { return failure(error); }
}
