import { requireAdmin } from "@/lib/admin/auth";
import { AdminError, adminFailure, adminJson, readAdminBody, requireSameOrigin } from "@/lib/admin/store";
import { createReviewInvitation, listReviewRecords, moderateReview, removeReviewPhoto } from "@/lib/reviewStore";
import type { ReviewStatus } from "@/lib/reviews";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    await requireAdmin();
    const params = new URL(request.url).searchParams;
    const status = params.get("status") || "pending";
    if (status !== "pending" && status !== "published" && status !== "rejected" && status !== "all") throw new AdminError("Invalid review section.");
    const reviews = await listReviewRecords(status === "all" ? undefined : status as ReviewStatus);
    if (params.get("export") === "1") {
      return new Response(JSON.stringify({ exportedAt: new Date().toISOString(), reviews }, null, 2), {
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Content-Disposition": `attachment; filename="smelt-reviews-${new Date().toISOString().slice(0, 10)}.json"`,
          "Cache-Control": "private, no-store",
          "X-Robots-Tag": "noindex, nofollow",
        },
      });
    }
    return adminJson({ reviews });
  } catch (error) { return adminFailure(error); }
}

export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    await requireAdmin();
    const body = await readAdminBody(request);
    if (typeof body.reference !== "string") throw new AdminError("An order reference is required.");
    const invitation = await createReviewInvitation(body.reference);
    return adminJson({ reviewUrl: new URL(`/review/${invitation.token}`, request.url).toString(), expiresAt: invitation.expiresAt }, 201);
  } catch (error) { return adminFailure(error); }
}

export async function PATCH(request: Request) {
  try {
    requireSameOrigin(request);
    await requireAdmin();
    const body = await readAdminBody(request);
    if (typeof body.id !== "string") throw new AdminError("A review is required.");
    if (body.action === "removePhoto" && typeof body.url === "string") return adminJson({ review: await removeReviewPhoto(body.id, body.url) });
    if (body.status !== "published" && body.status !== "rejected") throw new AdminError("Choose approve or reject.");
    return adminJson({ review: await moderateReview(body.id, body.status) });
  } catch (error) { return adminFailure(error); }
}
