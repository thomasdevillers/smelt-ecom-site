import { requireAdmin } from "@/lib/admin/auth";
import { adminFailure, adminJson } from "@/lib/admin/store";
import { researchStore } from "@/lib/research/store";
export const runtime = "nodejs";
export async function GET(request: Request) {
  try {
    await requireAdmin();
    const value = Number(new URL(request.url).searchParams.get("page") || 1);
    const page = Number.isSafeInteger(value) && value > 0 ? Math.min(value, 100_000) : 1;
    return adminJson(await researchStore().list(page));
  } catch (error) { return adminFailure(error); }
}
