import { AdminError, readAdminBody, requireSameOrigin } from "@/lib/admin/store";
import { createReviewInvitationForEmail } from "@/lib/reviewStore";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const body = await readAdminBody(request);
    const ip = process.env.VERCEL === "1" ? request.headers.get("x-vercel-forwarded-for") || "unknown" : "local";
    const invitation = await createReviewInvitationForEmail(body.email, ip);
    return Response.json({ reviewUrl: `/review/${invitation.token}` }, { status: 201, headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof AdminError)
      return Response.json({ error: error.message }, { status: error.status, headers: { "Cache-Control": "private, no-store" } });
    console.error("Public review access failed", error instanceof Error ? error.name : "Unknown error");
    return Response.json({ error: "We couldn’t verify your order right now. Please try again." }, { status: 503, headers: { "Cache-Control": "private, no-store" } });
  }
}
