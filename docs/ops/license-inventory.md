# License Inventory

| | |
|---|---|
| Product | Workshop POS (source-code handover to the buyer) |
| Date compiled | 2026-11-26 |
| Owner | Vendor (implementer) until handover; buyer thereafter |
| Policy baseline | Runtime dependencies must be permissive: MIT, Apache-2.0, ISC, BSD. No GPL/AGPL/SSPL/FSL or commercial runtime dependencies (PRD NFR-011). |

> **How to read the tiers.** `runtime` = ships or executes in production. `dev` = used only to build, test, or package. `external` = installed/operated by the buyer's infrastructure, not bundled. `asset` = font, icon set, or visual asset. `commercial/external` = not bundled; see the section that discusses it.
>
> **How to read transferability.** `YES` = permissive license, no restrictions on transferring/bundling with a sold source package. `NO` = must not be included in the handover. `REVIEW` = usable, but has a specific condition (checked in the Notes column) the buyer must honor. Evidence is the npm registry metadata, the project's own license file, or the official licensing page as of the **verified** date.
>
> All versions here were read from primary sources on the verified date; see §7 for the method.

---

## 1. Runtime & core stack

| Name | Version | License (SPDX) | Purpose | Tier | Buyer-transferable | Evidence | Verified |
|---|---|---|---|---|---|---|---|
| Node.js | 26.13.1 LTS (Lithium; EOL 2029-04-30) | MIT + permissive vendored components | JS runtime (web + tooling) | runtime | YES | https://github.com/nodejs/node/blob/v26.13.0/LICENSE (the v26 LICENSE header states "Node.js is licensed for use as follows:" followed by MIT terms; the repository LICENSE bundles permissive third-party notices) | 2026-11-26 |
| TypeScript | 7.0.x (7.0.2 latest at verification) | Apache-2.0 | Language / type checker | runtime | YES | https://registry.npmjs.org/typescript/latest (`license: "Apache-2.0"`) | 2026-11-26 |
| Next.js | 16.4.6 | MIT | Web framework (back-office + API) | runtime | YES | https://registry.npmjs.org/next/latest (`license: "MIT"`) | 2026-11-26 |
| React | 19.3.1 | MIT | UI library | runtime | YES | https://registry.npmjs.org/react/latest (`license: "MIT"`) | 2026-11-26 |
| React DOM | 19.3.x | MIT | Web renderer | runtime | YES | https://registry.npmjs.org/react-dom/latest | 2026-11-26 |
| Expo | 58.1.0 | MIT | Mobile app framework (Android) | runtime | YES | https://registry.npmjs.org/expo/58.1.0 (`license: "MIT"`) | 2026-11-27 |
| expo-router | 58.0.33 | MIT | Mobile file-based routing | runtime | YES | https://registry.npmjs.org/expo-router/58.0.33 (`license: "MIT"`) | 2026-11-27 |
| React Native | 0.88.1 | MIT | Mobile runtime (Expo workspace) | runtime | YES | https://registry.npmjs.org/react-native/0.88.1 (`license: "MIT"`, pinned) | 2026-11-27 |
| expo-sqlite | 58.0.18 | MIT | On-device SQLite: read cache, local orders, outbox, conflicts | runtime | YES | https://registry.npmjs.org/expo-sqlite/58.0.18 (`license: "MIT"`) | 2026-11-27 |
| expo-secure-store | 58.0.3 | MIT | Bearer token, session snapshot, salted PIN verifier | runtime | YES | https://registry.npmjs.org/expo-secure-store/58.0.3 (`license: "MIT"`) | 2026-11-27 |
| expo-file-system | 58.0.15 | MIT | Writes the shareable receipt text file | runtime | YES | https://registry.npmjs.org/expo-file-system/58.0.15 (`license: "MIT"`) | 2026-11-27 |
| expo-print | 58.0.9 | MIT | Receipt PDF fallback (`printToFileAsync`) | runtime | YES | https://registry.npmjs.org/expo-print/58.0.9 (`license: "MIT"`) | 2026-11-27 |
| expo-sharing | 58.0.24 | MIT | Android share sheet for receipt text/PDF | runtime | YES | https://registry.npmjs.org/expo-sharing/58.0.24 (`license: "MIT"`) | 2026-11-27 |
| expo-crypto | 58.0.9 | MIT | SHA-256 PIN verifier and random salt (no plaintext PIN) | runtime | YES | https://registry.npmjs.org/expo-crypto/58.0.9 (`license: "MIT"`) | 2026-11-27 |
| expo-font, expo-constants, expo-linking, expo-splash-screen, expo-status-bar | 58.0.x pinned in `apps/mobile/package.json` | MIT | Expo runtime modules (fonts, config, routing links, splash, status bar) | runtime | YES | `package-lock.json` entries; npm registry metadata | 2026-11-27 |
| @react-native-community/netinfo | 12.0.1 | MIT | Connectivity detection for the sync chip and auto-sync | runtime | YES | https://registry.npmjs.org/@react-native-community/netinfo/12.0.1 (`license: "MIT"`) | 2026-11-27 |
| react-native-safe-area-context | 5.11.1 | MIT | Safe-area layout on notched devices | runtime | YES | https://registry.npmjs.org/react-native-safe-area-context/5.11.1 (`license: "MIT"`) | 2026-11-27 |
| react-native-screens | 4.30.1 | MIT | expo-router native screen containers | runtime | YES | https://registry.npmjs.org/react-native-screens/4.30.1 (`license: "MIT"`) | 2026-11-27 |
| react-native-svg | 15.16.0 | MIT | SVG renderer required by the icon set | runtime | YES | https://registry.npmjs.org/react-native-svg/15.16.0 (`license: "MIT"`); Expo SDK 58 bundled version | 2026-11-27 |
| lucide-react-native | 1.81.0 | ISC | Mobile tab/action icons (same icon language as web) | runtime | YES | https://registry.npmjs.org/lucide-react-native/1.81.0 (`license: "ISC"`) | 2026-11-27 |
| Tailwind CSS | 4.3.5 | MIT | Web styling | runtime | YES | https://registry.npmjs.org/tailwindcss/latest (`license: "MIT"`) | 2026-11-26 |
| Radix UI (radix-ui umbrella package) | 1.8.1 | MIT | Accessible UI primitives | runtime | YES | https://registry.npmjs.org/radix-ui/latest (`license: "MIT"`) | 2026-11-26 |
| shadcn/ui component source | copied at WP4 (no CLI run; source adapted to project tokens) | MIT | Web UI components copied into the repo and styled with project tokens; not a runtime vendor dependency | runtime | YES | https://raw.githubusercontent.com/shadcn-ui/ui/main/LICENSE.md ("MIT License, Copyright (c) 2023 shadcn"); notice retained at `apps/web/components/ui/LICENSE-shadcn.md` | 2026-11-27 |
| class-variance-authority | 0.7.1 | Apache-2.0 | Component variant API | runtime | YES | https://registry.npmjs.org/class-variance-authority/0.7.1 (`license: "Apache-2.0"`) | 2026-11-26 |
| clsx | 2.1.1 | MIT | Conditional class names | runtime | YES | https://registry.npmjs.org/clsx/2.1.1 (`license: "MIT"`) | 2026-11-26 |
| tailwind-merge | 3.7.1 | MIT | Conflict-free Tailwind class merging | runtime | YES | https://registry.npmjs.org/tailwind-merge/3.7.1 (`license: "MIT"`) | 2026-11-26 |
| cmdk | 1.1.1 | MIT | Command menu | runtime | YES | https://registry.npmjs.org/cmdk/1.1.1 (`license: "MIT"`) | 2026-11-26 |
| sonner | 2.0.8 | MIT | Toasts | runtime | YES | https://registry.npmjs.org/sonner/2.0.8 (`license: "MIT"`) | 2026-11-26 |
| next-themes | 0.4.6 | MIT | Light/dark theme switching | runtime | YES | https://registry.npmjs.org/next-themes/0.4.6 (`license: "MIT"`) | 2026-11-26 |
| vaul | 1.1.2 | MIT | Drawer/sheet primitive | runtime | YES | https://registry.npmjs.org/vaul/1.1.2 (`license: "MIT"`) | 2026-11-26 |
| Drizzle ORM | 0.45.4 | Apache-2.0 | PostgreSQL data access | runtime | YES | https://registry.npmjs.org/drizzle-orm/0.45.4 (`license: "Apache-2.0"`, pinned version) | 2026-11-26 |
| Drizzle Kit | 0.31.11 | MIT | Schema migrations CLI | dev | YES | https://registry.npmjs.org/drizzle-kit/0.31.11 (`license: "MIT"`, pinned version) | 2026-11-26 |
| pg (node-postgres) | 8.23.1 | MIT | PostgreSQL driver used by the health endpoint; no ORM boundary in WP1 | runtime | YES | https://registry.npmjs.org/pg/8.23.1 (`license: "MIT"`, pinned version) | 2026-11-26 |
| sharp | 0.35.5 | Apache-2.0 | Optional dependency of Next.js image optimization; image optimization is disabled and the package is removed from the build output | runtime (optional) | YES — optional path not shipped | https://registry.npmjs.org/sharp/0.35.5 (`license: "Apache-2.0"`) | 2026-11-26 |
| @img/sharp-libvips-* (platform packages) | 1.3.4 | LGPL-3.0-or-later | Native libvips payload pulled in by optional `sharp`; removed before the runtime layer and asserted absent at image build time | runtime (optional) | REVIEW — not shipped; build fails if reintroduced | https://registry.npmjs.org/@img/sharp-libvips-linux-x64/1.3.4 (`license: "LGPL-3.0-or-later"`) | 2026-11-26 |
| Zod | 4.6.7 | MIT | Request/response contracts, validation | runtime | YES | https://registry.npmjs.org/zod/latest (`license: "MIT"`) | 2026-11-26 |
| TanStack Query (@tanstack/react-query) | 5.108.4 | MIT | Server-state management (web + mobile) | runtime | YES | https://registry.npmjs.org/@tanstack/react-query/latest (`license: "MIT"`) | 2026-11-26 |
| TanStack Table (@tanstack/react-table) | 9.3.1 | MIT | Back-office data tables; direct dependency of `apps/web` since WP4 | runtime | YES | https://registry.npmjs.org/@tanstack/react-table/9.3.1 (`license: "MIT"`); lockfile report re-run in the WP4 gate | 2026-11-27 |
| TanStack Table transitive tree (`@tanstack/table-core`, `@tanstack/react-store`, `@tanstack/store`, `use-sync-external-store`) | 9.3.1 / 0.11.4 / 0.11.3 / 1.7.0 | MIT | Required by the table package above | runtime | YES | `package-lock.json` entries; `bash scripts/license-report.sh` reports no disallowed runtime license | 2026-11-27 |
| Better Auth | 1.7.28 | MIT | Authentication, sessions, password hashing | runtime | YES | https://registry.npmjs.org/better-auth/latest (`license: "MIT"`); https://github.com/better-auth/better-auth (License: MIT) | 2026-11-26 |
| Better Auth transitive runtime tree (`@better-auth/*`, `better-call`, `jose`, `kysely`, `nanostores`, `rou3`, `defu`, `set-cookie-parser`, `@noble/*`) | locked versions | MIT | Dependencies of `better-auth` 1.7.28 used for sessions, signing, and adapters | runtime | YES | `package-lock.json` entries and `bash scripts/license-report.sh` (PASS: no disallowed runtime license); no GPL/AGPL/SSPL | 2026-11-26 |
| Lucide (lucide-react) | 1.80.0 | ISC | Icon set (web + mobile) | runtime | YES | https://registry.npmjs.org/lucide-react/latest (`license: "ISC"`) | 2026-11-26 |
| Recharts | 3.11.1 | MIT | Reports charts | runtime | YES | https://registry.npmjs.org/recharts/latest (`license: "MIT"`) | 2026-11-26 |
| react-native-esc-pos-printer | 4.6.0 | MIT | Thermal ESC/POS printing candidate (§3 below) | runtime | REVIEW | https://registry.npmjs.org/react-native-esc-pos-printer/latest (`license: "MIT"`); https://github.com/tr3v3r/react-native-esc-pos-printer (License: MIT) | 2026-11-26 |
| react-native-esc-pos-printer-sdk (bundled dependency of the above) | 2.31.1 | ISC (npm metadata) — **contains Epson ePOS SDK; see §3** | Native printing bridge used by the above | runtime | REVIEW | https://registry.npmjs.org/react-native-esc-pos-printer-sdk/latest (`license: "ISC"`) | 2026-11-26 |
| PostgreSQL | 19 (released 2026-11-19) | PostgreSQL License (BSD-like, permissive) | Primary database | external (runtime) | YES | https://www.postgresql.org/about/licence/ ("PostgreSQL is released under the PostgreSQL License, a liberal Open Source license, similar to the BSD or MIT licenses") | 2026-11-26 |
| pgBackRest (optional step-up backup tool) | 2.5x main | MIT | WAL-level backups (alternative to plain `pg_dump`) | external (runtime) | YES | https://raw.githubusercontent.com/pgbackrest/pgbackrest/main/LICENSE ("The MIT License (MIT)") | 2026-11-26 |
| Docker Engine | engine version current at deploy | Apache-2.0 (engine components; Docker's open-source components "generally licensed under the Apache 2.0 license") | Container runtime | external | REVIEW | https://www.docker.com/legal/components-licenses/ | 2026-11-26 |
| Docker Compose | v2 (Compose Specification) | Apache-2.0 | Local + single-host orchestration | external | YES | https://github.com/docker/compose (License: Apache-2.0) | 2026-11-26 |
| Caddy | 2.x current | Apache-2.0 | Reverse proxy, automatic TLS | external | YES | https://raw.githubusercontent.com/caddyserver/caddy/master/LICENSE (Apache License 2.0 full text) | 2026-11-26 |
| Inter font | current upstream | OFL-1.1 (SIL Open Font License 1.1) | UI typeface | asset | REVIEW | https://raw.githubusercontent.com/rsms/inter/master/LICENSE.txt ("This Font Software is licensed under the SIL Open Font License, Version 1.1") | 2026-11-26 |

## 2. Dev-only tooling

| Name | Version | License (SPDX) | Purpose | Tier | Buyer-transferable | Evidence | Verified |
|---|---|---|---|---|---|---|---|
| Vitest | 5.1.2 | MIT | Unit + integration test runner | dev | YES | https://registry.npmjs.org/vitest/latest (`license: "MIT"`) | 2026-11-26 |
| shadcn CLI | 4.23.1 | MIT | Adds/updates copied shadcn/ui components; not a runtime dependency | dev | YES | https://registry.npmjs.org/shadcn/latest (`license: "MIT"`) | 2026-11-26 |
| Playwright | 1.65.1 | Apache-2.0 | Web E2E tests | dev | YES | https://registry.npmjs.org/playwright/latest (`license: "Apache-2.0"`) | 2026-11-26 |
| ESLint | 10.15.0 | MIT | Lint runner and flat config host | dev | YES | https://registry.npmjs.org/eslint/10.15.0 (`license: "MIT"`) | 2026-11-26 |
| typescript-eslint | 8.74.0 | MIT | TypeScript parser and recommended+strict rules for the flat config | dev | YES | https://registry.npmjs.org/typescript-eslint/8.74.0 (`license: "MIT"`, pinned version) | 2026-11-26 |
| eslint-config-next | 16.4.6 | MIT | Next.js core-web-vitals + TypeScript ESLint rules | dev | YES | https://registry.npmjs.org/eslint-config-next/16.4.6 (`license: "MIT"`) | 2026-11-26 |
| @tailwindcss/postcss | 4.3.5 | MIT | Tailwind 4 PostCSS integration | dev | YES | https://registry.npmjs.org/@tailwindcss/postcss/4.3.5 (`license: "MIT"`) | 2026-11-26 |
| @types/node | 26.6.11 | MIT | Node.js TypeScript declarations (DefinitelyTyped) | dev | YES | https://registry.npmjs.org/@types/node/26.6.11 (`license: "MIT"`) | 2026-11-26 |
| @types/react | 19.3.3 | MIT | React TypeScript declarations (DefinitelyTyped) | dev | YES | https://registry.npmjs.org/@types/react/19.3.3 (`license: "MIT"`) | 2026-11-26 |
| @types/react-dom | 19.3.0 | MIT | React DOM TypeScript declarations (DefinitelyTyped) | dev | YES | https://registry.npmjs.org/@types/react-dom/19.3.0 (`license: "MIT"`) | 2026-11-26 |
| @types/pg | 8.23.1 | MIT | node-postgres TypeScript declarations (DefinitelyTyped) | dev | YES | https://registry.npmjs.org/@types/pg/8.23.1 (`license: "MIT"`) | 2026-11-26 |
| lightningcss | 1.33.0 | MPL-2.0 | CSS transform/native binding reached through `@tailwindcss/node`; build-only, not distributed in the runtime image | dev | REVIEW — file-level copyleft; no MPL source is shipped | https://registry.npmjs.org/lightningcss/1.33.0 (`license: "MPL-2.0"`) | 2026-11-26 |
| axe-core | 4.14.1 | MPL-2.0 | Accessibility rule engine used by `eslint-plugin-jsx-a11y` during linting; build/lint-only, not distributed | dev | REVIEW — file-level copyleft; not shipped | https://registry.npmjs.org/axe-core/4.14.1 (`license: "MPL-2.0"`) | 2026-11-26 |
| caniuse-lite | 1.0.30001828 | CC-BY-4.0 | Browser-support data for browserslist/PostCSS at build time; not executed by the running app (the lockfile marks it production because Next depends on browserslist) | dev (build-only) | YES with attribution — attribution recorded here; pinned as a license-report exception | https://registry.npmjs.org/caniuse-lite/1.0.30001828 (`license: "CC-BY-4.0"`) | 2026-11-26 |
| @testing-library/react-native | 14.1.0 | MIT | Mobile component tests (RNTL) | dev | YES | https://registry.npmjs.org/@testing-library/react-native/14.1.0 (`license: "MIT"`) | 2026-11-27 |
| jest-expo | 58.0.16 | MIT | Jest preset for Expo/React Native | dev | YES | https://registry.npmjs.org/jest-expo/58.0.16 (`license: "MIT"`) | 2026-11-27 |
| jest | 30.5.2 | MIT | Mobile test runner | dev | YES | https://registry.npmjs.org/jest/30.5.2 (`license: "MIT"`) | 2026-11-27 |
| @react-native/jest-preset | 0.88.1 | MIT | React Native Jest preset required by jest-expo | dev | YES | https://registry.npmjs.org/@react-native/jest-preset/0.88.1 (`license: "MIT"`) | 2026-11-27 |
| test-renderer | 1.3.0 | MIT | Renderer used by RNTL 14 | dev | YES | https://registry.npmjs.org/test-renderer/1.3.0 (`license: "MIT"`) | 2026-11-27 |
| @types/jest | 30.0.0 | MIT | Jest TypeScript declarations | dev | YES | https://registry.npmjs.org/@types/jest/30.0.0 (`license: "MIT"`) | 2026-11-27 |
| eslint-config-expo | 58.0.4 | MIT | Flat ESLint config for the mobile workspace | dev | YES | https://registry.npmjs.org/eslint-config-expo/58.0.4 (`license: "MIT"`) | 2026-11-27 |
| ESLint (mobile workspace pin) | 9.39.5 | MIT | Lint runner compatible with `eslint-config-expo` 58; web remains on ESLint 10 | dev | YES | https://registry.npmjs.org/eslint/9.39.5 (`license: "MIT"`) | 2026-11-27 |
| babel-preset-expo / @babel/* (Expo toolchain) | locked versions | MIT | Metro/Babel transform for the mobile bundle | dev | YES | `package-lock.json`; `scripts/license-report.sh` (no disallowed runtime license) | 2026-11-27 |
| Maestro CLI | current (Apache-2.0 repo) | Apache-2.0 (CLI only — Maestro **Studio** and **Cloud** are commercial, not bundled) | Mobile E2E (optional; **candidate**, not committed) | dev | REVIEW | https://github.com/mobile-dev-inc/Maestro ("Maestro is open-source under the Apache 2.0 license"; Studio "is not an open-source project") | 2026-11-26 |
| npm (workspaces) | bundled with Node 26 | Artistic License 2.0 (npm CLI; permissive, non-copyleft) | Package manager, single lockfile | dev | YES | https://github.com/npm/cli/blob/latest/LICENSE | 2026-11-26 |

## 3. Thermal-printing candidate — verification detail and REVIEW flag

`react-native-esc-pos-printer@4.6.0` (npm package `license: MIT`) is the **candidate only**, not a committed dependency, per ADR-0001 §3.7. Verified maintenance signals as of 2026-11-26:

- v4.5.1 released October 2026 and v4.6.0 released November 2026 (npm registry version history).
- 284 stars / 99 forks on GitHub; TypeScript; MIT License stated in the repo.
- Bundles `react-native-esc-pos-printer-sdk@2.31.1` (npm `license: ISC`), which wraps the **Epson ePOS SDK for Android/iOS**.

**REVIEW flag (blocker for a "YES" transferability rating):** the Epson ePOS SDK binaries inside that wrapper are governed by **Epson's own SDK terms, not the wrapper's MIT license**. Epson's ePOS SDK distribution terms commonly restrict redistribution to Epson-branded printer usage; the buyer's legal reviewer must confirm the Epson SDK redistribution terms before this dependency ships in the buyer's production build. Because the buyer may use non-Epson ESC/POS printers, and because the Epson SDK adds ~110 MB of unpacked native payload, ADR-0001 §3.7 explicitly treats the printer library as **an interface with two sinks** (this library, or the PDF/browser fallback) so that a failed pilot or a rejected SDK term costs a bounded swap, not a redesign. If Epson's terms are judged unsuitable, the fallback sink alone satisfies FR-040, and a Bluetooth-SPP ESC/POS sink can be built against the buyer's specific printers in a bounded task.

## 4. Assets

| Name | Source / Origin | License | Purpose | Tier | Buyer-transferable | Evidence | Verified |
|---|---|---|---|---|---|---|---|
| Inter font | https://github.com/rsms/inter; bundled via `@expo-google-fonts/inter@0.4.2` (`MIT AND OFL-1.1`) | OFL-1.1 | UI typeface (web fallback; Android bundles 400/500/600) | asset | REVIEW — OFL notice must ship | https://raw.githubusercontent.com/rsms/inter/master/LICENSE.txt; package `LICENSE_FONT` | 2026-11-27 |
| IBM Plex Mono font | https://github.com/IBM/plex; bundled via `@expo-google-fonts/ibm-plex-mono@0.4.2` (`MIT AND OFL-1.1`) | OFL-1.1 | Receipt/document monospace numerals on Android | asset | REVIEW — OFL notice must ship | https://raw.githubusercontent.com/IBM/plex/master/LICENSE.txt; package `LICENSE_FONT` | 2026-11-27 |
| Lucide icons | https://github.com/lucide-icons/lucide | ISC | Icon set | asset | YES | https://registry.npmjs.org/lucide-react/latest | 2026-11-26 |
| Logo (product mark) | To be designed originally | n/a — buyer-owned on handover | Branding (FR-071) | asset | n/a (original work) | — | — |
| Illustrations / empty-state art | To be designed originally | n/a — original work | UI polish | asset | n/a (original work) | — | — |
| Sample/QA data (seed fixtures) | Authored in-repo, synthetic | n/a — original work | Tests, demo (AC3.1 values etc.) | asset | n/a (original work) | — | — |
| Photography / screenshots in docs | Never taken from any third-party template or stock library without license | n/a — original or omitted | Documentation | asset | n/a (original work) | — | — |

## 5. Ecme Next template — commercial, NOT included (blocker if copied)

**This section is normative for the delivery: no file, asset, or code from the Ecme Next template may appear in the handover.**

| Item | Fact | Source |
|---|---|---|
| What it is | "Ecme — Next.js & Tailwind admin template" (the referenced package is the Next.js build), sold on ThemeForest (Envato Market) by Theme_Nate | https://themeforest.net/item/ecme-nextjs-tailwind-admin-template-app-router/56475600 |
| License | Envato Standard License (regular/extended) — commercial, non-OSI | https://themeforest.net/licenses/standard |
| Permitted use | One End Product per license; **may not be used in anything that is itself a template/stock item** | https://themeforest.net/licenses/standard |
| Transferability | **CONDITIONAL, not absolute.** Envato's FAQ states the license is generally non-transferable **with these exceptions**: (a) a freelancer/agency building a single End Product for one client may transfer that license to that client; (b) selling a single End Product instance transfers the license to the new owner. In both cases the seller must (i) link the client to the license terms and (ii) **delete the item from the seller's own systems**. It remains forbidden for resale, multi-client use, stock/template redistribution, or bundling into a product sold to multiple buyers. | https://themeforest.net/licenses/faq |
| Public "lite" repository | `ThemeNate/Ecme-next-lite` is publicly visible but its GitHub API metadata reports **no license** (`license: null`). Public visibility is not a license grant, so it is **not** a transfer-safe seed either. It was used only as a public reference for heuristic review; no files or assets were copied. | https://api.github.com/repos/ThemeNate/Ecme-next-lite |
| Recorded decision | The product owner selected **single-workshop internal use** and **clean-room implementation**. Therefore this package does not rely on any transfer exception: no Ecme source, demo asset, or brand asset is included. If a future delivery wants to use Ecme source for one client, it needs a fresh written decision, Envato license linkage, buyer acceptance of the restriction, and deletion of the seller's copy. | `docs/STATUS.md` §8 |
| Conclusion for Workshop POS | **NO for including Ecme source code, demo assets, or brand assets in this handover.** The deliverable is a reusable source package prepared for handover; the clean-room path removes the dependency entirely and does not require proving single-client deletion. | ADR-0001 §3.2, PRD PR-8, PRD DEP-5 |

**Clean-room alternative (what the delivery does instead):** the back-office UI is implemented from **shadcn/ui (MIT) components copied into the repository**, styled with ADR-0001's design tokens and Tailwind — visually in the *spirit* of a clean, modern admin layout (sidebar navigation, dense data tables, restrained color) but with no copied Ecme files, no copied component code, no copied CSS values, and no copied brand/demo assets. shadcn/ui is permissive component source, not a commercial template; the copied files retain the MIT notice. The visual reference, if any is used during design, is inspected and then closed; nothing is downloaded, screenshotted into the repo, or mirrored. The unlicensed `Ecme-next-lite` repository is not used as a source either.

## 6. Blockers and REVIEW items (summary)

| Item | Severity | Action required |
|---|---|---|
| Ecme Next template (or any ThemeForest item) included in the handover | **BLOCKER** | Must not be included; build on MIT shadcn/ui + project tokens instead (§5) |
| Epson ePOS SDK redistribution terms (via `react-native-esc-pos-printer-sdk`) | **REVIEW — Tier 3 founder/legal decision** | Buyer counsel confirms Epson SDK terms before the ESC/POS sink ships; otherwise use the PDF/browser fallback (§3) |
| Optional `sharp` / `@img/sharp-libvips-*` payload (Next.js image optimization) | REVIEW — not shipped | Image optimization is disabled; the Dockerfile removes both paths from the standalone output and fails the build if they reappear. `scripts/license-report.sh` lists them as optional and image-excluded. Re-check after any Next.js upgrade (§1, §2) |
| `lightningcss` / `axe-core` MPL-2.0 (build/lint-time) | REVIEW — build/lint-only, founder-approved exception | Present in the dev/build graph through Tailwind, the ESLint accessibility plugin, and Expo's CLI (`expo` → `@expo/cli` → `lightningcss`). No MPL source or binary is bundled into the web image or the Android APK. `scripts/license-report.mjs` records the Expo-CLI path as a MOBILE BUILD-ONLY exception (founder-approved 2026-11-27); do not add either as an application runtime import (§1, §2) |
| `node-forge` (BSD-3-Clause OR GPL-2.0) | REVIEW — permissive alternative chosen | Reached through Expo CLI dev-server certificates; not bundled in the APK. The license gate now evaluates SPDX `OR` correctly and accepts the BSD-3-Clause alternative (founder-approved 2026-11-27) |
| `caniuse-lite` CC-BY-4.0 browser data | REVIEW — attribution only | Build-time data, not runtime behavior. The attribution is this inventory entry; `scripts/license-report.mjs` pins the exception so a license change fails the gate (§2) |
| Docker Desktop licensing | REVIEW (informational) | Docker **Engine/Compose** are Apache-2.0 and fine for self-hosting; if the buyer's ops team wants Docker Desktop on macOS/Windows workstations, Docker Desktop is free only for small companies/personal use — recommend Linux hosts (engine) for production (§1 row "Docker Engine") |
| Maestro Studio / Maestro Cloud | REVIEW (informational) | CLI is Apache-2.0; Studio and Cloud are commercial products and are **not** part of the delivery; do not add them to buyer cost assumptions (§2 row "Maestro CLI") |
| Any non-permissive license appearing in a future lockfile audit | BLOCKER | WP1 acceptance includes generating a `license-checker`-style report from the lockfile; any GPL/AGPL/SSPL/FSL/commercial runtime dependency must be removed before handover. **Latent gap:** the report prints dev-only and optional buckets as review and does not fail on a forbidden license there; Metro can bundle a devDependency imported by app code. WP8/WP1 should add a forbidden-license hard fail in every bucket before handover |
| Fonts other than Inter, if added later | REVIEW | Must be OFL/Apache-licensed; verify before adding |

## 7. Verification method (for reproducibility by the buyer)

Every row's `license` value was read from one of these sources on the stated **verified** date:

1. **npm registry metadata** — `https://registry.npmjs.org/<package>/latest` or a pinned version URL, JSON `license` field.
   - Mobile packages were verified on 2026-11-27 against the versions pinned in `apps/mobile/package.json` and `package-lock.json`.
   - SPDX `OR` expressions are evaluated as a choice (`node-forge`: BSD-3-Clause chosen over GPL-2.0). `AND` requires every part to be permissive.
2. **Project license file** — raw GitHub LICENSE/NOTICE in the default branch (e.g., Caddy, pgBackRest, Inter, Node.js).
3. **Official licensing page** — PostgreSQL licence page, Docker components-and-licenses page, Envato Standard License/FAQ pages.

The buyer should re-run the check on handover (one script: `npx license-checker --production --onlyPermissive` or equivalent from the lockfile) since minor/patch versions may have changed; the SPDX identifiers above should be stable for the pinned major versions.
