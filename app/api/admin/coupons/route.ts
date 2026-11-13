import { requireAdmin } from "@/lib/admin/auth";
import { adminFailure, adminJson, readAdminBody, requireSameOrigin } from "@/lib/admin/store";
import { createCoupon, listCoupons, setCouponActive } from "@/lib/coupons";

export const runtime = "nodejs";
export async function GET() {
  try { await requireAdmin(); return adminJson({ coupons: await listCoupons() }); }
  catch (error) { return adminFailure(error); }
}
export async function POST(request: Request) {
  try {
    requireSameOrigin(request); await requireAdmin();
    const body = await readAdminBody(request);
    return adminJson({ coupon: await createCoupon(body.code, body.amount, body.maxUses) }, 201);
  } catch (error) { return adminFailure(error); }
}
export async function PATCH(request: Request) {
  try {
    requireSameOrigin(request); await requireAdmin();
    const body = await readAdminBody(request);
    await setCouponActive(body.code, body.active);
    return adminJson({ saved: true });
  } catch (error) { return adminFailure(error); }
}
