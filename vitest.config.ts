import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["**/tests/**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/dist/**"],
    pool: "threads",
    testTimeout: 20_000,
  },
});
