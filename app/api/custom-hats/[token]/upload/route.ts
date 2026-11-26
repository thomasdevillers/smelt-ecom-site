import { adminJson, readAdminBody, requireSameOrigin } from "@/lib/admin/store";
import { customHatFailure } from "@/lib/customHats/http";
import { reserveCustomHatUpload } from "@/lib/customHats/store";

export const runtime = "nodejs";

/** Returns a signed R2 URL; the browser PUTs the logo file straight to R2. */
export async function POST(request: Request, context: { params: Promise<{ token: string }> }) {
  try {
    requireSameOrigin(request);
    const body = await readAdminBody(request);
    const { token } = await context.params;
    return adminJson(
      await reserveCustomHatUpload(token, { contentType: body.contentType, size: body.size }),
    );
  } catch (error) {
    return customHatFailure(error);
  }
}
