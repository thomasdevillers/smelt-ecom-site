import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve, join, basename } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { Resend } from "resend";
import { shippingEmail } from "../lib/emails/shipping";
import { escapeHtml } from "../lib/emails/theme";
import { parseShipments, sendShipmentOnce } from "../lib/shippingBatch";

async function main() {
  const args = process.argv.slice(2);
  const send = args.includes("--send");
  const files = args.filter((arg) => !arg.startsWith("--"));
  if (files.length !== 1 || args.some((arg) => arg.startsWith("--") && arg !== "--send")) {
    throw new Error("Usage: npm run email:shipping -- path/to/batch.json [--send] (default: preview only)");
  }
  const shipments = parseShipments(JSON.parse(await readFile(resolve(files[0]), "utf8")));
  process.env.SITE_URL ||= "https://saunahat.co.za";
  const site = new URL(process.env.SITE_URL);
  if (site.protocol !== "https:" || site.username || site.password) throw new Error("SITE_URL must be an HTTPS website URL without credentials.");
  const prepared = shipments.map((shipment) => ({ shipment, message: shippingEmail(shipment) }));
  const previewDir = resolve(".local/shipping/previews", basename(files[0], ".json"));
  await mkdir(previewDir, { recursive: true, mode: 0o700 });
  for (const [index, { message }] of prepared.entries()) {
    await writeFile(join(previewDir, `${index + 1}.html`), message.html, { mode: 0o600 });
    await writeFile(join(previewDir, `${index + 1}.txt`), message.text, { mode: 0o600 });
  }
  const rows = prepared.map(({ shipment }, index) => `<tr><td style="padding:12px">${escapeHtml(shipment.email)}</td><td style="padding:12px">${escapeHtml(shipment.trackingNumber)}</td><td style="padding:12px"><a href="${index + 1}.html">Preview email</a></td></tr>`).join("");
  await writeFile(join(previewDir, "index.html"), `<!doctype html><html lang="en"><meta charset="utf-8"><title>Smelt shipping previews</title><body style="font-family:Arial,sans-serif;background:#F6F1E3;color:#0E3B2A;padding:32px"><h1>Shipping email previews</h1><p>${prepared.length} shipments · Preview files do not indicate send status.</p><table><tr><th>Email</th><th>Aramex tracking</th><th>Preview</th></tr>${rows}</table></body></html>`, { mode: 0o600 });
  console.log(`Prepared ${prepared.length} emails. Preview: ${join(previewDir, "index.html")}`);
  if (!send) {
    console.log("Preview only. No emails sent.");
    return;
  }
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.ORDER_FROM_EMAIL;
  if (!apiKey || !from) throw new Error("Set RESEND_API_KEY and ORDER_FROM_EMAIL in .env.local before sending.");
  if (from.includes("@resend.dev")) throw new Error("Use your verified Smelt sender address, not the Resend sandbox sender.");
  const resend = new Resend(apiKey);
  for (const { shipment, message } of prepared) {
    const result = await sendShipmentOnce(shipment, resolve(".local/shipping/receipts"), async (idempotencyKey) => {
      const response = await resend.emails.send({ from, to: shipment.email, ...message }, { idempotencyKey });
      if (response.error || !response.data?.id) throw new Error(`Resend did not confirm acceptance for ${shipment.email}. Check its dashboard and the pending receipt before retrying.`);
      return response.data.id;
    });
    console.log(`${result.status}: ${shipment.email} (${result.id})`);
    if (result.status === "accepted") await delay(600);
  }
  console.log("Finished. Accepted means Resend accepted the request; check its dashboard for delivery status.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Shipping email run failed.");
  process.exitCode = 1;
});
