import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { AdminError, requireSameOrigin } from "@/lib/admin/store";
import { reservePhotoUpload } from "@/lib/reviewStore";
import { REVIEW_MAX_PHOTO_BYTES } from "@/lib/reviews";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json() as HandleUploadBody;
    if (body.type === "blob.generate-client-token") requireSameOrigin(request);
    const result = await handleUpload({
      request,
      body,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        let token = "";
        try { token = JSON.parse(clientPayload || "{}").token || ""; } catch { /* validated below */ }
        await reservePhotoUpload(token, pathname);
        return {
          allowedContentTypes: ["image/webp"],
          maximumSizeInBytes: REVIEW_MAX_PHOTO_BYTES,
          addRandomSuffix: true,
          tokenPayload: JSON.stringify({ reviewUpload: true }),
        };
      },
    });
    return Response.json(result);
  } catch (error) {
    if (error instanceof AdminError) return Response.json({ error: error.message }, { status: error.status, headers: { "Cache-Control": "no-store" } });
    console.error("Review photo upload failed", error instanceof Error ? error.name : "Unknown error");
    return Response.json({ error: "Photo upload is temporarily unavailable." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
