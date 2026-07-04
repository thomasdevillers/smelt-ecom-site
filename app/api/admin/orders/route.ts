import { isAdminRequest } from "@/lib/adminAuth";
import { listOrders } from "@/lib/orders";

export const runtime = "nodejs";

export async function GET(request: Request) {
  if (!isAdminRequest(request)) return new Response("unauthorized", { status: 401 });
  return Response.json({ orders: await listOrders() });
}
