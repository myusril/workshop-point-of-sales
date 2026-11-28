import { existsSync } from "node:fs";
import path from "node:path";

/**
 * Expo Router's root resolution checks `src/app` before `app`, and it wins
 * whenever that directory exists (`@expo/cli` `getRouterDirectory`). Routes in
 * this project live in `app/**`; a provider/runtime module placed under
 * `src/app` turns into a "route without a default export" and the device opens
 * "Unmatched Route". Shared providers live in `src/providers/**`.
 *
 * This guard fails if a non-route module reappears in the route root root or if
 * `src/app` is recreated, so the regression cannot ship again unnoticed.
 */

const projectRoot = path.join(__dirname, "..");
const routeRoot = path.join(projectRoot, "app");
const srcRouteRoot = path.join(projectRoot, "src", "app");
const providerRoot = path.join(projectRoot, "src", "providers");

const PROVIDER_MODULES = [
  "AuthProvider.tsx",
  "AutoLock.tsx",
  "RuntimeProvider.tsx",
  "SaleProvider.tsx",
  "SessionGate.tsx",
  "SyncProvider.tsx",
  "runtime.ts",
];

describe("Expo Router root", () => {
  it("has no src/app directory that would shadow the app/ route root", () => {
    expect(existsSync(srcRouteRoot)).toBe(false);
  });

  it("keeps provider and runtime modules in src/providers, not the route root", () => {
    for (const moduleName of PROVIDER_MODULES) {
      expect([moduleName, existsSync(path.join(providerRoot, moduleName))]).toEqual([
        moduleName,
        true,
      ]);
      expect([moduleName, existsSync(path.join(routeRoot, moduleName))]).toEqual([
        moduleName,
        false,
      ]);
    }
  });
});
