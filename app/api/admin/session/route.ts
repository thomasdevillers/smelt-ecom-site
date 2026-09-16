import { hasAdminSession, login, logout } from "@/lib/admin/auth";
import { adminFailure, adminJson, readAdminBody, requireSameOrigin } from "@/lib/admin/store";
export const runtime = "nodejs";
export async function GET() {
  try { return adminJson({ authenticated: await hasAdminSession() }); } catch (error) { return adminFailure(error); }
}
export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const body = await readAdminBody(request);
    await login(request, body.password);
    return adminJson({ authenticated: true });
  } catch (error) { return adminFailure(error); }
}
export async function DELETE(request: Request) {
  try { requireSameOrigin(request); await logout(); return adminJson({ authenticated: false }); }
  catch (error) { return adminFailure(error); }
}
