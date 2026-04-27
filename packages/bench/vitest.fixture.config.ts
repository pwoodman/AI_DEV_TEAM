import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    // Allow fixtures to import external deps (e.g. zod) that live in bench's own
    // node_modules without requiring a separate install step in the temp dir.
    alias: {
      zod: resolve(__dirname, "node_modules/zod"),
    },
  },
  test: {
    include: ["tests/**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/dist/**"],
    globals: true,
    pool: "threads",
    testTimeout: 20_000,
  },
});
