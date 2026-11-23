import { requireAdmin } from "@/lib/admin/auth";
import { AdminError, adminFailure, adminJson, readAdminBody, requireSameOrigin } from "@/lib/admin/store";
import { orderDatabase, ordersPaused } from "@/lib/orderPersistence";
import { paystackEnvironment, paystackEventConfig } from "@/lib/paystackEventConfig";
import { paymentOperations } from "@/lib/db/payment-operations";
export const runtime = "nodejs";
async function operations() {
  if (paystackEventConfig().store !== "postgres") throw new AdminError("Durable payment ingestion is not enabled.", 503);
  return paymentOperations(await orderDatabase(), paystackEnvironment());
}
export async function GET(request: Request) {
  try {
    await requireAdmin(); const params = new URL(request.url).searchParams;
    return adminJson(await (await operations()).list(Number(params.get("page") || 1), params.get("state") || "manual_review"));
  } catch (error) { return adminFailure(error); }
}
export async function PATCH(request: Request) {
  try {
    requireSameOrigin(request); await requireAdmin();
    if (ordersPaused()) throw new AdminError("Order work is paused.", 503);
    const body = await readAdminBody(request);
    if (typeof body.id !== "string" || typeof body.evidence !== "string" || (body.action !== "acknowledge" && body.action !== "retry-verification")) throw new AdminError("Invalid payment resolution.");
    return adminJson(await (await operations()).resolve(body.id, body.action, body.evidence));
  } catch (error) { return adminFailure(error); }
}
