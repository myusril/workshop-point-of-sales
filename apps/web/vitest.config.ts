import { defineConfig } from "vitest/config";

export default defineConfig({
  // Components import `@/lib/...`; resolve the tsconfig alias in tests.
  resolve: { tsconfigPaths: true },
  test: {
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    exclude: ["tests/**/*.integration.test.ts", "tests/e2e/**"],
    environment: "node",
  },
});
