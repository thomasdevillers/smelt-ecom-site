import { requireAdmin } from "@/lib/admin/auth";
import { listOrders, setOrderCompleted } from "@/lib/admin/orders";
import { AdminError, adminFailure, adminJson, readAdminBody, requireSameOrigin } from "@/lib/admin/store";
export const runtime = "nodejs";
export async function GET(request: Request) {
  try {
    await requireAdmin();
    const params = new URL(request.url).searchParams;
    const page = Number(params.get("page") || 1), search = (params.get("search") || "").trim();
    if (!Number.isSafeInteger(page) || page < 1 || page > 100000 || search.length > 200) throw new AdminError("Invalid search or page.");
    const view = params.get("view") || "active";
    if (view !== "active" && view !== "completed" && view !== "preorders") throw new AdminError("Invalid order section.");
    const sort = params.get("sort") || "newest";
    if (sort !== "newest" && sort !== "oldest") throw new AdminError("Invalid completed-order sort.");
    return adminJson(await listOrders(page, search, view, sort));
  } catch (error) { return adminFailure(error); }
}

export async function PATCH(request: Request) {
  try {
    requireSameOrigin(request);
    await requireAdmin();
    const body = await readAdminBody(request);
    if (typeof body.reference !== "string" || typeof body.completed !== "boolean" || (body.confirmPriorShipment !== undefined && typeof body.confirmPriorShipment !== "boolean")) throw new AdminError("An order reference and completion status are required.");
    return adminJson({ completedAt: await setOrderCompleted(body.reference, body.completed, body.confirmPriorShipment === true) });
  } catch (error) { return adminFailure(error); }
}
