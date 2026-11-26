import { defineConfig } from "drizzle-kit";
import { requireDatabaseUrl } from "./src/env.ts";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema/index.ts",
  out: "./drizzle",
  dbCredentials: {
    url: requireDatabaseUrl(),
  },
  strict: true,
  verbose: true,
});
