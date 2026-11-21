import { defineConfig } from "drizzle-kit";

// Generation needs no credentials and never loads .env.local.
export default defineConfig({ dialect: "postgresql", schema: "./lib/db/schema.ts", out: "./drizzle" });
