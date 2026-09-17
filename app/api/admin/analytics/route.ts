import { requireAdmin } from "@/lib/admin/auth";
import { getConversionAnalytics } from "@/lib/admin/analytics";
import { adminFailure, adminJson, AdminError } from "@/lib/admin/store";
import type { AnalyticsDays } from "@/lib/admin/types";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    await requireAdmin();
    const days = Number(new URL(request.url).searchParams.get("days") || 28);
    if (days !== 7 && days !== 28 && days !== 90) throw new AdminError("Choose a 7, 28, or 90 day report.");
    return adminJson(await getConversionAnalytics(days as AnalyticsDays));
  } catch (error) {
    return adminFailure(error);
  }
}
