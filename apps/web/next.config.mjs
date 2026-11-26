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
  experimental: {
    // Enables forbidden()/forbidden.tsx so an unauthorized direct URL answers
    // with a real 403 instead of a 200 page that merely looks denied.
    authInterrupts: true,
  },
  // Workspace packages ship TypeScript sources (no build step), so Next must
  // transpile them in both dev and production builds.
  transpilePackages: [
    "@workshop-pos/auth",
    "@workshop-pos/contracts",
    "@workshop-pos/db",
  ],
  // Next 16 writes apps/web/AGENTS.md on every `next dev` unless disabled.
  // That file is framework tooling, not a WP1 deliverable.
  agentRules: false,
  images: {
    unoptimized: true,
  },
  allowedDevOrigins: ["127.0.0.1"],
};

export default nextConfig;
