import { defineConfig } from "vitest/config";

export default defineConfig({
  // Route handlers import `@/lib/...`; resolve the tsconfig alias in tests.
  resolve: { tsconfigPaths: true },
  test: {
    include: ["tests/**/*.integration.test.ts"],
    environment: "node",
    testTimeout: 15_000,
    hookTimeout: 15_000,
  },
});
