import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    maxWorkers: 4,
    include: ["{app,components,lib,scripts}/**/*.test.{ts,tsx}"],
  },
  resolve: { alias: { "@": fileURLToPath(new URL(".", import.meta.url)) } },
});
