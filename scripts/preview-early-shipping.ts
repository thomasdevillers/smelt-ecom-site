import { mkdir, writeFile } from "node:fs/promises";
import { earlyShippingEmail } from "../lib/emails/earlyShipping";

async function main() {
  if (process.argv.length > 2)
    throw new Error("This script only creates a local preview; no send arguments are supported.");
  process.env.SITE_URL = "https://saunahat.co.za";
  const message = earlyShippingEmail();
  const directory = ".local/early-shipping";
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await writeFile(`${directory}/preview.html`, message.html, { mode: 0o600 });
  await writeFile(`${directory}/preview.txt`, `Subject: ${message.subject}\n\n${message.text}`, {
    mode: 0o600,
  });
  console.log(
    `Preview: ${directory}/preview.html\nNo emails sent. Before sending: approve the copy, deploy /help-shape-smelt, confirm the dispatch date, and verify paid, unshipped recipients (excluding refunds/disputes and deduplicating email addresses).`,
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Preview failed");
  process.exitCode = 1;
});
