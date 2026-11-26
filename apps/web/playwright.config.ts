import { defineConfig, devices } from "@playwright/test";

import { appBaseUrl, authSecret, databaseUrl } from "./tests/e2e/env";

const baseURL = appBaseUrl();
const port = new URL(baseURL).port || "3000";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  workers: 1,
  reporter: [["list"]],
  outputDir: "test-results/artifacts",
  globalSetup: "./tests/e2e/setup.ts",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL,
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: `npm run dev -- --port ${port} --hostname 127.0.0.1`,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      NODE_ENV: "development",
      NEXT_TELEMETRY_DISABLED: "1",
      DATABASE_URL: databaseUrl(),
      BETTER_AUTH_SECRET: authSecret(),
      APP_URL: baseURL,
    },
  },
});
