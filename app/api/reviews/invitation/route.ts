import { AdminError } from "@/lib/admin/store";
import { getPublicInvitation } from "@/lib/reviewStore";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const token = new URL(request.url).searchParams.get("token") || "";
    const invitation = await getPublicInvitation(token);
    return Response.json(invitation, { status: invitation.valid ? 200 : 404, headers: { "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex, nofollow" } });
  } catch (error) {
    console.error("Review invitation lookup failed", error instanceof Error ? error.name : "Unknown error");
    const status = error instanceof AdminError ? error.status : 503;
    return Response.json({ valid: false, used: false, error: status === 503 ? "Review form is temporarily unavailable." : error instanceof Error ? error.message : "Invalid review link." }, { status, headers: { "Cache-Control": "private, no-store" } });
  }
}
