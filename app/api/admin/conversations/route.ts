import { requireAdmin } from "@/lib/admin/auth";
import { AdminError, adminJson, adminFailure } from "@/lib/admin/store";
import { isHatConversationId } from "@/lib/hatConversations";
import { getHatConversation, listHatConversations } from "@/lib/hatConversations.server";

export const runtime = "nodejs";
export async function GET(request: Request) {
  try {
    await requireAdmin();
    const params = new URL(request.url).searchParams;
    if (params.has("id")) {
      const id = params.get("id");
      if (!isHatConversationId(id)) throw new AdminError("Invalid conversation.");
      const conversation = await getHatConversation(id);
      if (!conversation) throw new AdminError("Conversation not found.", 404);
      return adminJson({ conversation });
    }
    const page = Number(params.get("page") ?? "1");
    if (!Number.isSafeInteger(page) || page < 1) throw new AdminError("Invalid page.");
    return adminJson(await listHatConversations(page));
  } catch (error) { return adminFailure(error); }
}
