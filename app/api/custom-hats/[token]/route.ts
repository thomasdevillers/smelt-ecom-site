import { AdminError, adminJson, requireSameOrigin } from "@/lib/admin/store";
import { customHatFailure } from "@/lib/customHats/http";
import { notifyCustomHatSubmission } from "@/lib/customHats/notify";
import { customHatInvite, submitCustomHatRequest } from "@/lib/customHats/store";

export const runtime = "nodejs";

type Context = { params: Promise<{ token: string }> };

export async function GET(_request: Request, context: Context) {
  try {
    const { token } = await context.params;
    const invite = await customHatInvite(token);
    return adminJson(invite, invite.valid ? 200 : 404);
  } catch (error) { return customHatFailure(error); }
}

// Thirty designs with notes fit comfortably; anything larger is not a real submission.
const MAX_BODY = 96 * 1024;

export async function POST(request: Request, context: Context) {
  try {
    requireSameOrigin(request);
    if (!request.headers.get("content-type")?.startsWith("application/json")) throw new AdminError("Expected JSON.", 415);
    const text = await request.text();
    if (text.length > MAX_BODY) throw new AdminError("Request is too large.", 413);
    let body: unknown;
    try { body = JSON.parse(text); } catch { throw new AdminError("Invalid request."); }
    const { token } = await context.params;
    const saved = await submitCustomHatRequest(token, body);
    if (saved.submission) await notifyCustomHatSubmission(saved.submission, saved.revision);
    return adminJson({ submittedAt: saved.submittedAt });
  } catch (error) { return customHatFailure(error); }
}
