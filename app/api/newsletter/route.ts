import { addSubscriber } from "@/lib/subscribers";
import { sendWelcomeEmail } from "@/lib/email";

// pg (via lib/subscribers) requires the Node.js runtime.
export const runtime = "nodejs";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: Request) {
  let body: { email?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false }, { status: 400 });
  }
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!EMAIL_RE.test(email)) {
    return Response.json({ ok: false, error: "Enter a valid email." }, { status: 400 });
  }
  try {
    const isNew = await addSubscriber(email);
    if (isNew) await sendWelcomeEmail(email);
  } catch (err) {
    console.error("newsletter signup failed:", err);
  }
  return Response.json({ ok: true }); // don't leak whether the email already existed
}
