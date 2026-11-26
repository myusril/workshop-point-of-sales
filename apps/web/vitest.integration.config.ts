import { defineConfig } from "vitest/config";

export default defineConfig({
  // Route handlers import `@/lib/...`; resolve the tsconfig alias in tests.
  resolve: { tsconfigPaths: true },
  test: {
    include: ["tests/**/*.integration.test.ts"],
    environment: "node",
    // One integration file (catalog-inventory) drops and migrates the shared
    // test schema, so files must not interleave against the same database.
    fileParallelism: false,
    testTimeout: 15_000,
    hookTimeout: 15_000,
  },
});
