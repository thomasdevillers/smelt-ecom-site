import { randomBytes } from "node:crypto";
import { readFile, mkdir, writeFile } from "node:fs/promises";
async function main() {
  const env = await readFile(".env.local", "utf8").catch(() => "");
  if (/^ADMIN_PASSWORD[ \t]*=[ \t]*[^\s\r\n]+/m.test(env)) throw new Error("ADMIN_PASSWORD already exists. It was not changed.");
  const password = randomBytes(24).toString("base64url");
  const cleaned = env.replace(/^ADMIN_PASSWORD[^\r\n]*(?:\r?\n|$)/gm, "");
  await writeFile(".env.local", `${cleaned}\n# Smelt admin dashboard\nADMIN_PASSWORD=${password}\n`, { mode: 0o600 });
  await mkdir(".local/admin", { recursive: true, mode: 0o700 });
  await writeFile(".local/admin/login.txt", `Dashboard: https://saunahat.co.za/admin\nPassword: ${password}\n\nAdd ADMIN_PASSWORD to Vercel Production before deployment.\n`, { mode: 0o600 });
  console.log("Generated ADMIN_PASSWORD in .env.local. Login details saved privately to .local/admin/login.txt.");
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
