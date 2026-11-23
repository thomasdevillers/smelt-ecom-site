import { createHash } from "node:crypto";
import { researchStore } from "@/lib/research/store";
import { validateSave } from "@/lib/research/shared";

export const runtime = "nodejs";
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin) return json({ error: "Please save from the Smelt website." }, 403);
  if (!request.headers.get("content-type")?.startsWith("application/json")) return json({ error: "Expected questionnaire data." }, 415);
  if (Number(request.headers.get("content-length")) > 24_000) return json({ error: "Answers are too large." }, 413);
  let input;
  try {
    // Bound streamed bodies as well as Content-Length.
    const reader = request.body?.getReader();
    if (!reader) return json({ error: "Missing answers." }, 400);
    let size = 0;
    const chunks: Uint8Array[] = [];
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 24_000) { await reader.cancel(); return json({ error: "Answers are too large." }, 413); }
      chunks.push(value);
    }
    input = validateSave(JSON.parse(Buffer.concat(chunks).toString("utf8")));
  } catch (error) { return json({ error: error instanceof SyntaxError ? "Invalid questionnaire data." : error instanceof Error ? error.message : "Invalid answers." }, 400); }
  try {
    const store = researchStore();
    const ip = process.env.VERCEL ? request.headers.get("x-vercel-forwarded-for") || "unknown" : "local";
    const hash = (value: string) => createHash("sha256").update(value).digest("hex");
    const day = new Date().toISOString().slice(0, 10);
    // Daily-salted IP hashes are used only for abuse counters, never in responses.
    if (!await store.allow(`global`, 30_000) || !await store.allow(`ip:${hash(`${day}:${ip}`)}`, 900)) return json({ error: "Too many saves. Please try again later." }, 429);
    const revision = await store.save(hash(input.token), input);
    return json({ saved: true, revision });
  } catch {
    console.error("Product research save failed.");
    return json({ error: "We couldn’t save your answers yet. They’re kept in this browser; please retry." }, 503);
  }
}
