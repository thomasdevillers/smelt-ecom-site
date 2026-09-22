import { getAvailability } from "@/lib/preorderStore";

export const runtime = "nodejs";

export async function GET() {
  try {
    return Response.json(await getAvailability(), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("Inventory read failed:", error);
    return Response.json(
      { error: "Stock availability is temporarily unavailable." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
