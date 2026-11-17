import { mkdir, writeFile } from "node:fs/promises";
import { Resend } from "resend";
import { customerThankYouEmail } from "../lib/emails/customerThankYou";

async function main() {
  const args = process.argv.slice(2);
  if (args.some(arg => arg !== "--send")) throw new Error("Usage: tsx --env-file-if-exists=.env.local scripts/test-customer-thank-you.ts [--send]");
  process.env.SITE_URL = "https://saunahat.co.za";
  const message = customerThankYouEmail("Tom");
  const directory = ".local/customer-thank-you";
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await writeFile(`${directory}/preview.html`, message.html, { mode: 0o600 });
  await writeFile(`${directory}/preview.txt`, message.text, { mode: 0o600 });
  console.log(`Preview: ${directory}/preview.html`);
  if (!args.includes("--send")) return;
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.ORDER_FROM_EMAIL;
  if (!apiKey || !from || from.includes("@resend.dev")) throw new Error("A Resend API key and verified ORDER_FROM_EMAIL are required.");
  const to = "therealtomdev@gmail.com";
  const result = await new Resend(apiKey).emails.send({
    from, to, replyTo: from.match(/<([^>]+)>/)?.[1] || from, ...message,
  }, { idempotencyKey: "customer-thank-you-test-tom-2026-11-17-v2" });
  if (result.error || !result.data?.id) throw new Error(`Test not accepted: ${result.error?.message || "No email ID returned"}`);
  await writeFile(`${directory}/test-receipt.json`, JSON.stringify({ id: result.data.id, to, acceptedAt: new Date().toISOString() }, null, 2), { mode: 0o600 });
  console.log(`Resend accepted test to ${to}: ${result.data.id}`);
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : "Test email failed");
  process.exitCode = 1;
});
