import { timingSafeEqual } from "node:crypto";
import { runEmailAudit } from "@/lib/admin/emailAudit";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const supplied = Buffer.from(request.headers.get("authorization") || "");
  const expected = Buffer.from(`Bearer ${secret}`);
  if (!secret || supplied.length !== expected.length || !timingSafeEqual(supplied, expected))
    return new Response(null, { status: 401 });
  try {
    const report = await runEmailAudit();
    return Response.json(
      { ranAt: report.ranAt, checked: report.checked, issues: report.issues.length },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("Email audit failed", error instanceof Error ? error.message : "Unknown error");
    return Response.json({ error: "Email audit could not run." }, { status: 503 });
  }
}
