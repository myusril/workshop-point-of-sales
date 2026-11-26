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

function licenseTokens(expression) {
  return expression
    .replace(/[()]/g, " ")
    .split(/\s+(?:AND|OR|WITH)\s+/i)
    .map((token) => token.trim())
    .filter(Boolean);
}

function isAllowed(expression) {
  if (expression === "UNKNOWN") {
    return false;
  }

  return licenseTokens(expression).every((token) => ALLOWED_LICENSES.has(token));
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
const devReview = [];
let runtimeCount = 0;
let devCount = 0;
let optionalCount = 0;

for (const [key, meta] of packageEntries) {
  const name = packageNameFromPath(key);
  const version = meta.version ?? "unknown";
  const license = meta.license ?? readInstalledLicense(name) ?? "UNKNOWN";
  const isDev = meta.dev === true;
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
