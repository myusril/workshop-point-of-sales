import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Next.js loads env files relative to apps/web. The repository keeps a single
// root .env (created from .env.example), so load it here for host-run dev,
// build, and start. Compose-injected variables take precedence.
const rootEnvPath = fileURLToPath(new URL("../../.env", import.meta.url));
if (existsSync(rootEnvPath)) {
  process.loadEnvFile(rootEnvPath);
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  outputFileTracingRoot: fileURLToPath(new URL("../..", import.meta.url)),
  reactStrictMode: true,
  images: {
    unoptimized: true,
  },
  allowedDevOrigins: ["127.0.0.1"],
};

export default nextConfig;
