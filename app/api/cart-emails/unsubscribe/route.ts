import { adminFailure, adminJson, readAdminBody, requireSameOrigin } from "@/lib/admin/store";
import { unsubscribeCartEmails } from "@/lib/cartEmailSequence";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const body = await readAdminBody(request);
    await unsubscribeCartEmails(typeof body.token === "string" ? body.token : "");
    // A generic success response prevents this endpoint becoming a token oracle.
    return adminJson({ ok: true });
  } catch (error) { return adminFailure(error); }
}
