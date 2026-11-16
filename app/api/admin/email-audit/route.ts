import { requireAdmin } from "@/lib/admin/auth";
import { adminFailure, adminJson, AdminError, readAdminBody, requireSameOrigin } from "@/lib/admin/store";
import { getEmailAudit, markEmailIssueHandled, runEmailAudit } from "@/lib/admin/emailAudit";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function GET() {
  try { await requireAdmin(); return adminJson({ report: await getEmailAudit() }); }
  catch (error) { return adminFailure(error); }
}
// Re-run the audit now instead of waiting for the daily cron.
export async function POST(request: Request) {
  try {
    requireSameOrigin(request); await requireAdmin();
    const body = await readAdminBody(request);
    if (body.action !== "run") throw new AdminError("Unknown action.");
    await runEmailAudit();
    return adminJson({ report: await getEmailAudit() });
  } catch (error) { return adminFailure(error); }
}
export async function PATCH(request: Request) {
  try {
    requireSameOrigin(request); await requireAdmin();
    const body = await readAdminBody(request);
    await markEmailIssueHandled(body.reference);
    return adminJson({ report: await getEmailAudit() });
  } catch (error) { return adminFailure(error); }
}
