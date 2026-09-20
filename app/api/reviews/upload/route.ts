import { issueSignedToken } from "@vercel/blob";
import { handleUpload, handleUploadPresigned, type HandleUploadBody, type HandleUploadPresignedBody } from "@vercel/blob/client";
import { AdminError, requireSameOrigin } from "@/lib/admin/store";
import { reservePhotoUpload } from "@/lib/reviewStore";
import { REVIEW_MAX_PHOTO_BYTES } from "@/lib/reviews";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json() as HandleUploadBody | HandleUploadPresignedBody;
    if (body.type !== "blob.generate-client-token" && body.type !== "blob.generate-presigned-url")
      throw new AdminError("Invalid upload request.");
    requireSameOrigin(request);

    const readReviewToken = (clientPayload: string | null) => {
      try { return JSON.parse(clientPayload || "{}").token || ""; }
      catch { return ""; }
    };

    const result = body.type === "blob.generate-presigned-url"
      ? await handleUploadPresigned({
          request,
          body,
          getSignedToken: async (pathname, clientPayload) => {
            await reservePhotoUpload(readReviewToken(clientPayload), pathname);
            const validUntil = Date.now() + 10 * 60 * 1000;
            return {
              token: await issueSignedToken({
                pathname,
                operations: ["put"],
                allowedContentTypes: ["image/webp"],
                maximumSizeInBytes: REVIEW_MAX_PHOTO_BYTES,
                validUntil,
              }),
              urlOptions: {
                allowedContentTypes: ["image/webp"],
                maximumSizeInBytes: REVIEW_MAX_PHOTO_BYTES,
                // ReviewForm already uses a crypto.randomUUID() filename. Keep
                // the stored pathname stable so submission validation does not
                // have to reconstruct provider-added filename variants.
                addRandomSuffix: false,
                validUntil,
              },
            };
          },
        })
      : await handleUpload({
          request,
          body,
          onBeforeGenerateToken: async (pathname, clientPayload) => {
            await reservePhotoUpload(readReviewToken(clientPayload), pathname);
            return {
              allowedContentTypes: ["image/webp"],
              maximumSizeInBytes: REVIEW_MAX_PHOTO_BYTES,
              addRandomSuffix: false,
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
