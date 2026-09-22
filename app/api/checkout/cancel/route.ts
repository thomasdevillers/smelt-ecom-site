import { releaseInventory } from "@/lib/inventory";

export const runtime = "nodejs";

const RESERVATION_RE = /^smelt-[0-9a-f-]{36}$/;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const reservation = url.searchParams.get("reservation") ?? "";
  if (RESERVATION_RE.test(reservation)) {
    try {
      await releaseInventory(reservation);
    } catch (error) {
      console.error("Inventory cancellation release failed:", error);
    }
  }
  return Response.redirect(new URL("/checkout?payment=cancelled", url.origin), 303);
}
