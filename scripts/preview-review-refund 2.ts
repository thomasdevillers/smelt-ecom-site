import { mkdir, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { reviewRefundRequestEmail } from "../lib/emails/reviewRefundRequest";

async function main() {
  if (process.argv.length > 2) throw new Error("This script creates a sample preview only and accepts no arguments.");
  const message = reviewRefundRequestEmail({
    name: "Preview Customer",
    reviewUrl: "https://example.invalid/review/preview-only",
  });
  const directory = resolve(".local/review-refund/previews");
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await writeFile(join(directory, "email.html"), message.html, { mode: 0o600 });
  await writeFile(join(directory, "email.txt"), message.text, { mode: 0o600 });
  await writeFile(join(directory, "subject.txt"), `${message.subject}\n`, { mode: 0o600 });
  console.log(`Subject: ${message.subject}`);
  console.log(`Preview: ${join(directory, "email.html")}`);
  console.log("Sample name and inactive review link. No emails sent or customer records changed.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Could not create the review refund preview.");
  process.exitCode = 1;
});
