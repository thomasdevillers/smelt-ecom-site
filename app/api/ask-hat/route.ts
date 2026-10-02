import { generateHatAnswer, reserveHatRequest } from "@/lib/askHat.server";
import { hatKnowledge } from "@/lib/askHatKnowledge";
import { parseHatMessages } from "@/lib/askHatShared";
import { getAvailability } from "@/lib/preorderStore";

export const runtime = "nodejs";
export const maxDuration = 60;

function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex, nofollow" } });
}

export async function POST(request: Request) {
  const url = new URL(request.url);
  const expectedOrigin = `${url.protocol}//${request.headers.get("host") || url.host}`;
  if (request.headers.get("origin") !== expectedOrigin) {
    return json({ error: "Request origin is not allowed." }, 403);
  }
  if (process.env.NEXT_PUBLIC_ASK_HAT_ENABLED === "false" || !process.env.OPENAI_API_KEY) {
    return json({ error: "Our hat assistant is unavailable right now. Please contact us for help." }, 503);
  }
  if (!request.headers.get("content-type")?.startsWith("application/json")) {
    return json({ error: "Expected a JSON question." }, 415);
  }
  if (Number(request.headers.get("content-length")) > 16000) {
    return json({ error: "Please send a shorter question." }, 413);
  }
  let messages;
  try {
    const body = await request.text();
    if (body.length > 16000) return json({ error: "Please send a shorter question." }, 413);
    const input = JSON.parse(body);
    messages = parseHatMessages(input?.messages);
  } catch {
    return json({ error: "Please send a valid question." }, 400);
  }
  if (!messages) return json({ error: "Please keep questions under 600 characters and start a new chat for a longer conversation." }, 400);

  try {
    const limit = await reserveHatRequest(request);
    if (limit !== "allowed") return json({ error: limit === "visitor"
      ? "You've asked quite a few questions. Please try again in an hour, or contact us for help."
      : "Our hat assistant has reached its daily limit. Please contact us for help." }, 429);

    // Missing live stock must not turn into a guessed availability claim.
    const availability = await getAvailability().catch(() => null);
    const answer = await generateHatAnswer(messages, hatKnowledge(availability));
    return json(answer);
  } catch (error) {
    console.error("Ask hat request failed", { kind: error instanceof Error ? error.name : "Unknown" });
    return json({ error: "We couldn't get an answer just now. Please try again or contact us for help." }, 503);
  }
}
