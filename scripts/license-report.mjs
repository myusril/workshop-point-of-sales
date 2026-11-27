#!/usr/bin/env node

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LOCKFILE = path.join(ROOT, "package-lock.json");

const ALLOWED_LICENSES = new Set([
  "MIT",
  "ISC",
  "Apache-2.0",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "0BSD",
  "CC0-1.0",
  "Unlicense",
  "Python-2.0",
  "BlueOak-1.0.0",
  "OFL-1.1",
  "PostgreSQL",
]);

// Pinned, reviewed exceptions. Each entry documents why the license is
// acceptable and where the attribution lives.
const PINNED_EXCEPTIONS = new Map([
  [
    "caniuse-lite",
    {
      license: "CC-BY-4.0",
      reason:
        "Browser-support data used at build time; attribution is recorded in docs/ops/license-inventory.md",
    },
  ],
]);

const SHIPPED_IMAGE_EXCLUSIONS = new Set(["sharp", "@img/sharp-"]);

// Expo's CLI is a dependency of the `expo` package, so npm marks its build
// toolchain as production even though none of it is bundled into the Android
// app (the APK contains the Metro JS bundle plus native modules). Founder
// approved these build-time exceptions on 2026-11-27; the inventory records
// them. They are not runtime libraries.
const MOBILE_BUILD_TOOLING_EXCEPTIONS = new Map([
  [
    "lightningcss",
    {
      license: "MPL-2.0",
      reason:
        "Expo CLI/Metro CSS transform at build time; no MPL source or binary is bundled into the Android app",
    },
  ],
]);

// Build-only native payload. Tailwind's compiler depends on `lightningcss`,
// whose per-platform binary packages are optional children. When another
// dev-only tool (Vitest's optional `vite` peer) also reaches lightningcss,
// npm drops the inherited `dev` flag on those children, so they would look
// like an optional runtime payload. They are never copied into the runtime
// image; the inventory records them as build-only REVIEW entries.
const DEV_OPTIONAL_EXCEPTIONS = new Set(["lightningcss"]);

function readInstalledLicense(name) {
  try {
    const manifest = JSON.parse(
      readFileSync(path.join(ROOT, "node_modules", name, "package.json"), "utf8"),
    );
    return typeof manifest.license === "string" ? manifest.license : undefined;
  } catch {
    return undefined;
  }
}

function packageNameFromPath(key) {
  const marker = "node_modules/";
  const index = key.lastIndexOf(marker);
  return index === -1 ? key : key.slice(index + marker.length);
}

/**
 * SPDX `OR` means the consumer chooses one alternative; `AND` requires every
 * part. `node-forge` is `BSD-3-Clause OR GPL-2.0`, so choosing BSD-3-Clause
 * keeps the package permissive without an exception. Founder-approved
 * 2026-11-27.
 */
function isAllowed(expression) {
  if (expression === "UNKNOWN") {
    return false;
  }
  const normalized = expression.replace(/[()]/g, " ").trim();
  return normalized.split(/\s+OR\s+/i).some((alternative) =>
    alternative
      .split(/\s+AND\s+/i)
      .map((token) => token.trim())
      .filter(Boolean)
      .every((token) => ALLOWED_LICENSES.has(token)),
  );
}

function isImageExcluded(name) {
  for (const prefix of SHIPPED_IMAGE_EXCLUSIONS) {
    if (name === prefix || name.startsWith(prefix)) {
      return true;
    }
  }

  return false;
}

let lockfile;
try {
  lockfile = JSON.parse(readFileSync(LOCKFILE, "utf8"));
} catch (error) {
  console.error(`license-report: cannot read package-lock.json (${error.message})`);
  process.exit(1);
}

const packageEntries = Object.entries(lockfile.packages ?? {}).filter(([key, meta]) => {
  if (!meta || typeof meta !== "object" || meta.link === true) {
    return false;
  }
  if (!key.includes("node_modules/")) {
    return false;
  }

  return !packageNameFromPath(key).startsWith("@workshop-pos/");
});

const failures = [];
const pinned = [];
const optionalReview = [];
const devOptionalReview = [];
const devReview = [];
const mobileToolingReview = [];
let runtimeCount = 0;
let devCount = 0;
let optionalCount = 0;

for (const [key, meta] of packageEntries) {
  const name = packageNameFromPath(key);
  const version = meta.version ?? "unknown";
  const license = meta.license ?? readInstalledLicense(name) ?? "UNKNOWN";
  // npm marks a package `devOptional` when every path to it starts with a
  // devDependency and at least one of those edges is an optional peer/dep
  // (for example `vitest` -> optional peer `vite` -> `lightningcss`). Such a
  // package is absent from a production install, so it is dev-only — not an
  // optional runtime payload like sharp, which npm marks `optional: true`.
  const isDev = meta.dev === true || (meta.devOptional === true && meta.optional !== true);
  const isOptional = !isDev && (meta.optional === true || meta.devOptional === true);

  const entry = { name, version, license };

  if (isDev) {
    devCount += 1;
    if (!isAllowed(license)) {
      devReview.push(entry);
    }
    continue;
  }

  if (isOptional) {
    optionalCount += 1;
    if (!isAllowed(license)) {
      // Optional runtime packages are only tolerated when the runtime image
      // explicitly excludes and asserts their absence (sharp/libvips).
      if (isImageExcluded(name)) {
        optionalReview.push(entry);
      } else if (
        [...DEV_OPTIONAL_EXCEPTIONS].some(
          (prefix) => name === prefix || name.startsWith(`${prefix}-`),
        )
      ) {
        devOptionalReview.push(entry);
      } else {
        failures.push(entry);
      }
    }
    continue;
  }

  runtimeCount += 1;

  if (isAllowed(license)) {
    continue;
  }

  const exception = PINNED_EXCEPTIONS.get(name);
  if (exception && exception.license === license) {
    pinned.push({ ...entry, reason: exception.reason });
    continue;
  }

  const mobileTooling = [...MOBILE_BUILD_TOOLING_EXCEPTIONS].find(
    ([prefix]) => name === prefix || name.startsWith(`${prefix}-`),
  );
  if (mobileTooling && mobileTooling[1].license === license) {
    mobileToolingReview.push({ ...entry, reason: mobileTooling[1].reason });
    continue;
  }

  failures.push(entry);
}

const line = (entry) => `${entry.name}@${entry.version} ${entry.license}`;

console.log(
  `License report — ${packageEntries.length} locked packages (runtime ${runtimeCount}, dev ${devCount}, optional ${optionalCount})`,
);
console.log(`Policy allowlist: ${[...ALLOWED_LICENSES].join(", ")}`);

for (const entry of pinned) {
  console.log(`PASS pinned exception: ${line(entry)} — ${entry.reason}`);
}

if (optionalReview.length > 0) {
  console.log(
    `OPTIONAL REVIEW: ${optionalReview.length} optional runtime package(s) with non-permissive licenses, all excluded from the runtime image (sharp/libvips; the Dockerfile asserts their absence):`,
  );
  for (const entry of optionalReview) {
    console.log(`  - ${line(entry)} (excluded from image)`);
  }
} else {
  console.log("OPTIONAL REVIEW: no optional runtime package carries a non-permissive license.");
}

if (devOptionalReview.length > 0) {
  console.log(
    `BUILD-ONLY REVIEW: ${devOptionalReview.length} optional native child package(s) of the dev-only lightningcss build tool (never copied into the runtime image; see docs/ops/license-inventory.md):`,
  );
  for (const entry of devOptionalReview) {
    console.log(`  - ${line(entry)} (build-only)`);
  }
}

if (mobileToolingReview.length > 0) {
  console.log(
    `MOBILE BUILD-ONLY REVIEW: ${mobileToolingReview.length} package(s) reachable through Expo's CLI but not bundled into the Android app:`,
  );
  for (const entry of mobileToolingReview) {
    console.log(`  - ${line(entry)} (${entry.reason})`);
  }
}

if (devReview.length > 0) {
  console.log(
    `DEV REVIEW: ${devReview.length} dev/build-only package(s) with non-permissive licenses (not part of the runtime image):`,
  );
  for (const entry of devReview) {
    console.log(`  - ${line(entry)} (dev/build only)`);
  }
}

if (failures.length > 0) {
  console.error("FAIL: disallowed runtime licenses found:");
  for (const entry of failures) {
    console.error(`  - ${line(entry)}`);
  }
  process.exit(1);
}

console.log("PASS: no disallowed runtime licenses.");
