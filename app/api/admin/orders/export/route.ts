import { requireAdmin } from "@/lib/admin/auth";
import { exportOrdersCsv } from "@/lib/admin/orderExport";
import { adminFailure } from "@/lib/admin/store";

export const runtime = "nodejs";

export async function GET() {
  try {
    await requireAdmin();
    const csv = await exportOrdersCsv();
    const mode = process.env.PAYSTACK_SECRET_KEY?.startsWith("sk_live_") ? "live" : "test";
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="smelt-orders-${mode}-${new Date().toISOString().slice(0, 10)}.csv"`,
        "Cache-Control": "private, no-store",
        "X-Robots-Tag": "noindex, nofollow",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) { return adminFailure(error); }
}
