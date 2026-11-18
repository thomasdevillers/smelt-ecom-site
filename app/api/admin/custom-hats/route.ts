import { requireAdmin } from "@/lib/admin/auth";
import { adminFailure, adminJson, readAdminBody, requireSameOrigin } from "@/lib/admin/store";
import { createCustomHatRequest, customHatUrl, deleteCustomHatRequest, listCustomHatRequests } from "@/lib/customHats/store";
import { isR2Configured } from "@/lib/customHats/storage";

export const runtime = "nodejs";

const origin = (request: Request) => {
  const url = new URL(request.url);
  return `${url.protocol}//${request.headers.get("host") || url.host}`;
};

export async function GET(request: Request) {
  try {
    await requireAdmin();
    return adminJson({ requests: await listCustomHatRequests(origin(request)), uploadsEnabled: isR2Configured() });
  } catch (error) { return adminFailure(error); }
}

export async function POST(request: Request) {
  try {
    requireSameOrigin(request); await requireAdmin();
    const body = await readAdminBody(request);
    const created = await createCustomHatRequest({ name: body.name, email: body.email, phone: body.phone });
    return adminJson({ id: created.id, url: customHatUrl(origin(request), created.token) }, 201);
  } catch (error) { return adminFailure(error); }
}

export async function DELETE(request: Request) {
  try {
    requireSameOrigin(request); await requireAdmin();
    const body = await readAdminBody(request);
    await deleteCustomHatRequest(body.id);
    return adminJson({ deleted: true });
  } catch (error) { return adminFailure(error); }
}
