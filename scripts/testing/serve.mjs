import { readFileSync } from "node:fs";
import { spawn } from "node:child_process";

// Never use local provider credentials during browser tests or test builds.
// Explicit empty strings stop Next's dotenv loader from filling these keys.
const env = { ...process.env };
for (const file of [
  ".env.local.example",
  ".env",
  ".env.local",
  ".env.production",
  ".env.production.local",
  ".env.development",
  ".env.development.local",
]) {
  let text;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    continue;
  }
  for (const match of text.matchAll(/^\s*(?:export\s+)?([A-Z][A-Z0-9_]*)\s*=/gm))
    env[match[1]] = "";
}
Object.assign(env, {
  PAYSTACK_SECRET_KEY: "",
  NEON_CONNECTION_STRING: "",
  UPSTASH_REDIS_REST_URL: "",
  UPSTASH_REDIS_REST_TOKEN: "",
  RESEND_API_KEY: "",
  OPENAI_API_KEY: "",
  ADMIN_PASSWORD: "",
  NEXT_PUBLIC_GOOGLE_MAPS_API_KEY: "",
  NEXT_PUBLIC_ASK_HAT_ENABLED: "false",
  REVIEW_CUSTOM_STORE: "redis",
  REVIEW_CUSTOM_PAUSED: "false",
  ORDER_STORE: "redis",
  ORDER_PAUSED: "false",
  PAYSTACK_EVENT_STORE: "legacy",
  PAYSTACK_EVENT_PAUSED: "false",
  SITE_URL: "http://127.0.0.1:3100",
  NEXT_TELEMETRY_DISABLED: "1",
});
const build = process.argv[2] === "build";
const child = spawn(
  process.execPath,
  [
    "node_modules/next/dist/bin/next",
    ...(build ? ["build"] : ["start", "--hostname", "127.0.0.1", "--port", "3100"]),
  ],
  { env, stdio: "inherit" },
);
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
