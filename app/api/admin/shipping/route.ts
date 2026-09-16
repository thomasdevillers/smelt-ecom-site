import { requireAdmin } from "@/lib/admin/auth";
import { sendShipping, shippingStatus } from "@/lib/admin/shipping";
import { AdminError, adminFailure, adminJson, readAdminBody, requireSameOrigin } from "@/lib/admin/store";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    await requireAdmin();
    const body = await readAdminBody(request);
    if (typeof body.reference !== "string") throw new AdminError("An order reference is required.");
    return adminJson({ receipt: await sendShipping(body.reference, body.trackingNumber) });
  } catch (error) { return adminFailure(error); }
}
export async function GET(request: Request) {
  try {
    await requireAdmin();
    return adminJson({ receipt: await shippingStatus(new URL(request.url).searchParams.get("reference") || "") });
  } catch (error) { return adminFailure(error); }
}
