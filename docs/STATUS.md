# Delivery Status — Workshop POS

| Field | Value |
|---|---|
| Product | Workshop POS (working name; buyer may rebrand) |
| Phase | WP9 merged and FR-071 branding wired (PR #11, `a7dab6e`); M3 handover verification open (real-device/hardware, buyer credentials, signed manifest) |
| Date | 2026-11-28 |
| Code status | WP1–WP9 are merged to `main` (WP9 `98b17e0`, PR #10). WP9 adds encrypted backup/restore, handover evidence, WCAG 2.2 AA web sweep, third-party notices, and project-owned Bluetooth SPP ESC/POS transport. FR-071 branding is now wired end to end: the saved name and logo render in the shell (expanded wordmark, 72 px collapsed rail, mobile top bar), the home heading and browser title, and the login card; every role can read branding while settings stay Owner-only. Real-device printing/TalkBack, APK measurements, production-sized restore, buyer credentials/signed manifest, and the remote CI run remain `NOT VERIFIED` |
| Next gate | Complete buyer/hardware checks (printer, real device, production-sized restore, credentials, signed manifest); remote CI remains `NOT VERIFIED` until a runner is attached |
| Source of truth | `docs/product/PRD.md`, `docs/adr/0001-stack-and-architecture.md`, `docs/plan/work-packages.md` |

> **Honesty rule.** This page reports what exists and what has been verified. Documents are not proof that the product works. WP1 commands were executed on 2026-11-26 on branch `feat/wp1-walking-skeleton`, including the aggregate `scripts/check.sh` gate on a fresh development volume, and WP1 was merged to `main` as PR #1 (`a96ffcb`). WP2 (schema, migrations, seed, outlet-scoped query helpers) was merged to `main` as PR #2 (`88252dc`). WP3 (auth, RBAC, users, outlets) passed its focused gates and the aggregate gate, and was merged to `main` as PR #3 (`344de62`). WP4 (web shell, domain core, catalog, inventory) passed its focused checks and the aggregate gate and was merged to `main` as PR #4 (`cdf3036`); earlier tests are re-run by later aggregate gates. Anything not listed in §7 as verified is **NOT VERIFIED** — including WP6 until its full-suite gate result is recorded in §7.10. WP5 was merged to `main` as PR #5 (`8a2a550`).

---

## 1. Milestones

| Milestone | Scope | Exit criteria | Status |
|---|---|---|---|
| **M1 — Walking skeleton** | WP1: npm-workspaces monorepo, pinned Node, `.env.example`, Compose dev/prod, Postgres, Dockerfiles, `scripts/check.sh`, license report, health endpoint, minimal page/API | A fresh clone reaches a healthy web + database stack with standard Docker/Node tooling; `scripts/check.sh` exits 0; license report has no blocker | **Verified 2026-11-26 and merged to `main` as PR #1 (`a96ffcb`)** |
| **M2 — MVP** | WP2–WP8: schema/seed, auth/RBAC/outlets, catalog + stock ledger, customers/vehicles/history, mixed orders + payments + receipts, offline mobile POS + sync, reports/audit/export/settings, hardening gate | Every PRD story US-01–US-20 passes its acceptance criteria; offline/conflict, money, stock, and RBAC tests are green; no license blocker; WCAG 2.2 AA checks pass on agreed screens | **Complete for the implemented scope** — WP2 `88252dc`; WP3 `344de62`; WP4 `cdf3036`; WP5 `8a2a550`; WP6 `9f2fc8f`; WP6.1 `c8a38ec` (PR #7); WP7 `589418d` (PR #8); WP8 `c93acc3` (PR #9). WP8 focused checks in §7.15 and gate in §7.16 |
| **M3 — Handover-ready** | WP9: accessibility sign-off, backup/restore drill, fresh-clone deployment rehearsal, license re-audit, documentation and credential handover | `docs/ops/handover-checklist.md` is fully checked with captured evidence; restore drill meets RPO/RTO targets; buyer accepts the signed manifest | **In progress (WP9 merged as PR #10, `98b17e0`)** — encrypted backup/restore drill passed (RTO 6 s on the drill dataset); web axe sweep passed; fresh-clone + gate evidence in `docs/ops/handover-evidence.md` (local 256 s, CI mode 171 s); **FR-071 branding is wired** (shell, home heading and title, login card; verified by the FR-071 E2E suite); real-device printing/TalkBack, production-sized RTO, buyer credential transfer, and the signed manifest remain `NOT VERIFIED` |

---

## 2. Artifact status

| Artifact | Purpose | Status |
|---|---|---|
| `docs/product/PRD.md` | Buyer-facing requirements, 20 testable stories, business rules, NFRs, personal-data inventory | Draft for buyer review |
| `docs/ui/research/kickoff-2026-11-26.md` | Desk research, task flows, heuristics, accessibility risks | Draft; evidence and assumptions separated |
| `docs/marketing/competitors.md` | Cited Indonesian workshop POS landscape and positioning | Draft; vendor claims labeled, gaps marked `NOT VERIFIED` |
| `docs/adr/0001-stack-and-architecture.md` | Stack, data, auth, offline sync, deployment, cost range, rejected alternatives | Proposed |
| `docs/ops/license-inventory.md` | Dependency/license/transferability evidence | Re-audited in WP9 (2026-11-28): report exit 0, no disallowed runtime license, no new dependency; Expo-CLI `lightningcss` build-only exception and `node-forge` BSD-3-Clause alternative stand; Epson SDK remains `REVIEW` and is not installed |
| `docs/ops/backup-runbook.md` | Buyer-facing encrypted backup, off-host copy, restore, rollback, key custody, RPO/RTO and drill record | Delivered in WP9; drill passed 2026-11-28 (110,928-byte encrypted dump, no plaintext at rest, HMAC + checksum verified, restore + health in 6 s on the drill dataset) |
| `docs/ops/handover-evidence.md` | Executed checklist evidence: command, result, evidence path, `NOT VERIFIED` items | Delivered in WP9; every executed item has a result; buyer/account/hardware items remain explicitly open |
| `docs/ui/a11y-audit.md` | Final WCAG 2.2 AA + keyboard/contrast + Bahasa + mobile touch/TalkBack record | Delivered in WP9; web axe sweep passed; real-device mobile verification `NOT VERIFIED` (no device attached) |
| `THIRD_PARTY_NOTICES.md` | Shipped third-party attribution | Delivered in WP9: shadcn/ui MIT, Lucide ISC + Feather MIT, Inter and IBM Plex Mono OFL, caniuse-lite CC-BY-4.0 attribution |
| `docs/product/personal-data.md` | Buyer-as-Controller obligations and engineering controls | Draft; counsel review required |
| `docs/ui/DESIGN.md`, `state-matrix.md`, `tokens.json` | Original clean-room design system shared by web and mobile | Draft for review; WP4 generates `packages/design-tokens` and renders the back-office shell/catalog/inventory; WP5 composes the same shell/components for customers, vehicles, and history; WP6 adds the order list, counter sale, order detail, payment sheet, and paper-white receipt preview/print pages |
| `docs/plan/work-packages.md` | WP1–WP9, owned paths, dependencies, acceptance gates, PRD traceability | Proposed |
| `docs/ops/handover-checklist.md` | Seller pre-delivery verification and evidence checklist | Executed in WP9; results and `NOT VERIFIED` items in `docs/ops/handover-evidence.md`; buyer/account/hardware items remain open |
| `docs/ops/decision-policy.md` | Tier 1/2/3 decision authority for the buyer's team | Draft |
| `README.md`, `AGENTS.md` | Buyer setup guide and engineering rules | README carries the verified setup/gate/CI commands, hook install, real-device-only mobile path, backup enablement, licence/privacy pointers, and no internal paths; AGENTS.md records WP1–WP9 merged, CI/hooks, backup/RPO convention, generic ESC/POS transport (Epson SDK still `REVIEW`), and the optional-tooling keep decision |
| `apps/mobile/` | Expo Android app + local SQLite cache/outbox + Jest/RNTL suite | WP7 (`589418d`) plus WP9 direct printing: project-owned Bluetooth SPP module, printer picker, 86 mobile unit tests green, Android debug build compiled. `fix/mobile-router-root` (§7.20) moves the provider/runtime modules to `src/providers`, adds the route-root guard (88 tests / 13 suites), and verifies launch, Owner login, and the four tabs on a real Infinix X6882; real-device printing/TalkBack `NOT VERIFIED` |
| `.omp/`, `orca.yaml`, `.worktreeinclude`, `AGENTS.md` | Optional development aids | Founder decision 2026-11-28: keep as optional tooling; README states they may be deleted without affecting the product; `.brief/` stays untracked |

---

## 3. License and transferability status

| Item | Status | Action |
|---|---|---|
| Original product code | MIT (repository `LICENSE`) | Keep copyright notice; confirm seller identity at handover |
| Runtime dependencies | MIT / Apache-2.0 / ISC / BSD / PostgreSQL License only | Lockfile report added in WP1; re-run in WP9 |
| Optional `sharp` / `@img/sharp-libvips-*` (Next.js image optimization) | **REVIEW — not shipped** | Image optimization is disabled; the Dockerfile removes both paths and fails the build if they reappear. `scripts/license-report.sh` reports them as optional and image-excluded. Re-check after any Next.js upgrade |
| `lightningcss` and `axe-core` (MPL-2.0, build/lint-only) | **REVIEW — build/lint-only** | `lightningcss` is reached through Tailwind during build; `axe-core` is used by the ESLint accessibility plugin. No MPL source or binary is copied into the runtime image |
| `caniuse-lite` (CC-BY-4.0 browser data) | REVIEW — attribution only | Build-time data; attribution is recorded in `docs/ops/license-inventory.md` and pinned in `scripts/license-report.mjs` |
| Ecme Next template (ThemeForest) | **Not transferable for this package** | Excluded; clean-room visual language only. Do not copy source, demo assets, or brand assets |
| Epson ePOS SDK (via thermal printer wrapper) | **REVIEW — not installed** | The app implements an ESC/POS encoder and a `PrinterTransport` seam; no `react-native-esc-pos-printer` dependency ships. Buyer counsel must confirm redistribution terms before any Epson SDK is added; PDF/share and the project-owned SPP transport ship regardless |
| Direct ESC/POS Bluetooth transport (WP9) | **Project-owned MIT code, no new dependency** | `apps/mobile/modules/escpos-bluetooth` uses Android `BluetoothSocket`/SPP and writes the existing ESC/POS bytes; no vendor SDK, no Epson terms, no lockfile change. Scanning/pairing stays in Android Settings |
| Docker Desktop | Informational | Production hosts should use Docker Engine on Linux; Desktop licensing is separate |
| Maestro Studio / Cloud | Not included | CLI only, if adopted; do not add commercial tiers to cost assumptions |
| shadcn/ui (web components) | MIT, copied source | MIT notice shipped in `THIRD_PARTY_NOTICES.md`; listed in the license inventory |
| Lucide icons | ISC + Feather-derived MIT | ISC and Feather MIT notices shipped in `THIRD_PARTY_NOTICES.md` |
| Inter font | OFL-1.1 | Bundled in the Android app via `@expo-google-fonts/inter`; OFL notice shipped in `THIRD_PARTY_NOTICES.md` |
| IBM Plex Mono font | OFL-1.1 | Bundled via `@expo-google-fonts/ibm-plex-mono`; used for receipt numerals; OFL notice shipped in `THIRD_PARTY_NOTICES.md` |
| Expo CLI build toolchain (`lightningcss` MPL-2.0, `node-forge` BSD-3-Clause OR GPL-2.0) | **Build-only, founder-approved 2026-11-27** | Pulled by `expo` → `@expo/cli`; not bundled into the APK. The license report selects the BSD-3-Clause alternative for `node-forge` and records `lightningcss` as an Expo-CLI build-time exception |
| Illustrations, logo, sample data | Must be original or licensed | No template or stock assets without an inventory entry |

**Rule:** a new dependency or asset is not accepted until it has a verified SPDX license and a transferability status in `docs/ops/license-inventory.md`.

---

## 4. Privacy status

- The **buyer is the Data Controller** after handover; the implementer is a processor during the build.
- Personal data includes staff accounts, customer contact data, plate/VIN linked to a person, payment references, service history, and audit records.
- Engineering controls are specified: server-side RBAC, outlet isolation, hashed credentials, no PII in logs, encrypted transport, encrypted backups, append-only audit, export/anonymization tooling.
- **Counsel required:** lawful basis, privacy notice, retention duration, deletion-vs-bookkeeping conflict, breach notification timelines, cross-border transfer, and any registration duty.
- If the buyer chooses managed hosting or any third-party processor, a processor agreement and transfer assessment are required before go-live.

---

## 5. Open decisions

### Buyer/product decisions (from PRD §8.3)

| ID | Decision | Recommendation |
|---|---|---|
| D-1 | Tax rounding convention | Half-up to the nearest rupiah; confirm with tax counsel |
| D-2 | Cashier discount cap default | 0%; Admin/Owner approval is audited |
| D-3 | Hosting model and region | Buyer-hosted in Indonesia if ops capacity exists; otherwise managed with a DPA |
| D-4 | Receipt numbering | Per-outlet sequential with buyer-set prefix |
| D-5 | Plate uniqueness scope | Whole business, across outlets |
| D-6 | Deletion semantics | Anonymize personal fields, preserve financial/audit records per counsel |
| D-7 | Product name and branding | Buyer-owned; keep the working name until rebrand |
| D-8 | Retention duration | 10 years until counsel confirms |
| D-9 | Certified printer models | Protocol-generic ESC/POS over Bluetooth SPP now; publish a tested-model list after the buyer's pilot. No model is certified in this delivery |
| D-10 | Support/warranty terms | Commercial contract, not a product requirement |
| D-11 | Payment correction before `PAID` | Allow audited Admin/Owner correction; post-`PAID` remains whole-order void only |
| D-12 | Cycle count in MVP | Include if monthly counts are expected; otherwise defer and use stock adjustments |

### Commercial and handover decisions

| Topic | Why it is open |
|---|---|
| Commercial structure | Outright source sale, source license, or license plus support retainer changes the license and support obligations |
| Target buyer | Single-outlet owner-operator versus multi-outlet group changes onboarding and deployment assumptions |
| Template treatment | Confirm clean-room exclusion, or obtain written permission from the template author for the intended transfer; the default is exclusion |
| Managed hosting | Adds a processor relationship, recurring cost, and a DPA; self-hosting avoids it but requires buyer ops capacity |
| Publishable claims | Competitor comparison claims must be re-checked against the delivered build before publication |
| Keep or strip `.omp/`, `orca.yaml`, `.worktreeinclude` | Buyer preference at final handover; the product must run without them |

### Decisions recorded during WP9 (2026-11-28)

| Topic | Decision | Consequence |
|---|---|---|
| AI-ready tooling at handover (`AGENTS.md`, `.omp/`, `orca.yaml`, `.worktreeinclude`) | **Keep as optional developer tooling** | README states they are not runtime dependencies and may be deleted without affecting the product; `.brief/` stays untracked; buyer may still strip them at delivery |
| Thermal printing | **Ship direct generic ESC/POS now** (`native_now`) | Project-owned Bluetooth SPP module for 58/80 mm, multi-brand; no Epson SDK; share/PDF fallback remains. Real-device printing is `NOT VERIFIED` until a hardware pilot |
| Buyer logo/branding | **Use the existing env/static path** | No schema or upload change in WP9; `logo_path`/URL remains the buyer-configured path |

---

## 6. Risks

| Risk | Impact | Mitigation | Owner |
|---|---|---|---|
| Template licensing mistaken for transferable | Legal claim, forced rework, delivery delay | Clean-room design; license inventory blocker; written buyer acknowledgement | Seller + buyer counsel |
| Offline sync loses or double-books a sale | Wrong stock and money; trust loss | Durable outbox, client-key replay, server-authoritative stock, explicit conflict UI, queued-sale preservation across 401, fault-injection tests | Engineering |
| Outlet policy is stale on a fresh device | Wrong tax or discount cap until the first online refresh | Policy is learned from the newest server order on cache refresh and from every applied sale; the sale screen states when defaults are in use; server audits tax-rate deviations | Engineering |
| Printer SDK terms or hardware incompatibility | Receipts fail at the counter | Sink interface with PDF/browser fallback; pilot a tested printer list | Engineering + buyer |
| Scope grows beyond MVP | Delay and quality dilution | PRD out-of-scope list; change control via decision policy | Buyer product owner |
| Personal-data obligations are underestimated | Regulatory exposure | Data inventory, counsel review, DPA, retention/anonymization tooling | Buyer as Controller |
| Buyer lacks ops capacity for self-hosting | Outages, poor backups | Compose runbook, backup drill, optional managed hosting with DPA | Buyer |
| Dependency license drift | Handover blocker | Lockfile license report in WP1 and WP9; inventory update per dependency | Engineering |
| Backup passphrase lost or escrow incomplete | Every encrypted dump is unrecoverable | Two named custodians, secret-manager storage, rotation/escrow procedure in `docs/ops/backup-runbook.md`; fail-closed sidecar | Buyer ops + Engineering |
| Backup lives only on the database host | Host loss loses database and backups together | Documented off-host copy with 3-2-1 guidance; buyer-owned monitoring and quarterly restore rehearsal | Buyer ops |
| Direct Bluetooth printing untested on hardware | Receipts fail or misalign at the counter | Project-owned ESC/POS over standard SPP, printer picker with explicit errors, share/PDF fallback; buyer pilot with its 58/80 mm printers before go-live | Engineering + Buyer |
| Printer permissions/pairing vary by Android vendor | Empty device list or denied connect | Permission state surfaced in Bahasa; pairing stays in Android Settings; screenshot/instructions in the printer picker | Buyer pilot |
| Aggregate gate/CI do not build the optional backup image | A Dockerfile/compose regression can pass the gate | The WP9 drill builds it; add a CI image-build step when the buyer owns the pipeline (WP1/WP8 path) | Buyer/CI owner |

---

## 7. Verification performed

### 7.1 Kickoff document checks (2026-11-26)

| Check | Result |
|---|---|
| Repository state | Clean before kickoff; only `LICENSE` tracked; branch `main` |
| Git hooks path | Unset; no hooks installed by this kickoff |
| License verification | Each planned dependency checked against npm registry or upstream license on 2026-11-26 |
| Document neutrality | **PASS on the kickoff tree** — no local paths, internal names, private registries, or credentials |
| Structural checks | 0 broken Markdown links; `orca.yaml` and `.omp/config.yml` parse as YAML; `tokens.json` parses as JSON; 71/71 FR defined |
| Design contrast | 39 token pairs verified from hex values with 0 mismatches |

### 7.2 WP1 execution checks (2026-11-26, branch `feat/wp1-walking-skeleton`)

| Check | Result |
|---|---|
| Toolchain | Node 26.13.1 via fnm; npm 11.20.0; Docker 29.4.0; Compose v5.1.2; gitleaks 8.30.1 |
| `npm ci` | **PASS** — one root lockfile, clean install |
| `npm run typecheck` | **PASS** — TypeScript 7.0.2 strict, exit 0 |
| `npm run lint` | **PASS** — ESLint 10.15.0, no findings |
| `npm run test:unit` | **PASS** — 1 file, 5 tests (health payload mapping, migration labels) |
| `npm run test:integration` | **PASS** — 1 test against PostgreSQL 19.0 (`workshop_pos_test` on 55432) |
| `npm run test:e2e:web` | **PASS** — 1 Chromium test (heading, `lang="id"`, health link, keyboard focus, viewport fit) |
| `npm run build` | **PASS** — `/` static, `/api/v1/health` dynamic, no DB access at build time |
| `bash scripts/license-report.sh` | **PASS** — 637 locked packages (runtime 109, dev 482, optional 46); `caniuse-lite` pinned exception; 14 optional non-permissive entries (sharp/libvips only, image-excluded); no disallowed runtime license |
| Compose config | **PASS** — `compose.dev.yaml` and `compose.yaml` parse (`docker compose config`) |
| Dev Compose stack | **PASS** — `docker compose -f compose.dev.yaml up -d --build web` built the dev image, PostgreSQL became healthy, the web container's healthcheck reached `healthy`, `/` rendered the `h1`, and `/api/v1/health` returned 200 |
| Production image | **PASS** — build succeeded with a build-time assertion that `sharp`/libvips are absent; runtime runs as non-root `nextjs`, read-only rootfs, `cap_drop: ALL`, `no-new-privileges`; `/api/v1/health` returned 200 with `database:"up"`, `migration:"none"`; paused PostgreSQL returned 503 `database:"down"` in 3 s (query timeout) and recovered to 200 after unpause; no error text leaked |
| Host dev path | **PASS** — root `.env` loaded by `next.config.mjs`; `npm run dev` served `/` and `/api/v1/health` returned 200 against the Compose database |
| Host database access | **PASS** — `psql "postgresql://…@127.0.0.1:55432/workshop_pos_test" -c 'select 1'` without environment overrides |
| Secret scan | **PASS** on the source tree after removing local build artifacts: `gitleaks dir .` found no leaks. Local `.next` build caches contain generated signing keys and must stay out of scans/commits (they are gitignored) |
| Aggregate gate | **PASS** — `bash scripts/check.sh` exited 0 on a fresh development volume (`down -v` first): Docker preflight and test-DB readiness, then typecheck → lint → unit (5) → integration (1) → E2E (1) → build |
| Design evidence | Chromium at 320, 390, 768, and 1440 px: one `h1`, health link `href`, 2 px focus ring with 2 px offset and 4 px radius, no horizontal overflow; contrast 16.2 / 17.73 / 7.68 / 7.96. Real Android/iOS hardware, Firefox, WebKit, and OS dark mode: **NOT VERIFIED** |
| Docker base images | **PASS** — `postgres:19-alpine`, `node:26.13.1-alpine`, and `caddy:2-alpine` pulled; `caddy validate` on `docker/Caddyfile` returned "Valid configuration" |
| Script syntax and DB entrypoints | **PASS** — `bash -n` clean on all `scripts/*.sh`; `npm run db:migrate` and `npm run db:seed` print the WP2 hand-off message and exit 0 |

### 7.3 WP3 execution checks (2026-11-26, branch `feat/wp3-auth-rbac-outlets`)

Focused checks were run before review. The aggregate `scripts/check.sh` gate is run once on the frozen candidate; its result is recorded in §7.4 after that run.

| Check | Result |
|---|---|
| `npm run test:unit --workspace @workshop-pos/contracts` | **PASS** — 26 tests (contracts round-trip, Bahasa messages, phone/username normalization, OWNER exclusion, password policy reuse, unlock schemas) |
| `npm run test:unit --workspace @workshop-pos/auth` | **PASS** — 208 tests in 4 files (Appendix A matrix literal transcription, lockout arithmetic/keying, per-IP throttle, request guard) |
| `npm run test:integration --workspace @workshop-pos/auth` (Compose test DB) | **PASS** — 41 tests (per-IP throttle, login by email/username/phone, 5th-failure 429, alias lockout + reset, concurrent burst, deactivation, idle web + mobile bearer, outlet scope/switch, cross-outlet audit, device-token hash/revoke, staff CRUD/unlock, last-active-outlet guard, retention prune) |
| `npm run test:unit --workspace @workshop-pos/web` | **PASS** — 33 tests (health, safe next path, HTTP origin/body/IP/redirect helpers, page loading skeleton) |
| `npm run test:integration --workspace @workshop-pos/web` | **PASS** — 13 tests (health + every discovered `/api/v1/**` route rejects a request without a credential) |
| `npm run test:e2e:web` (Chromium) | **PASS** — 22 tests (login/invalid/lockout/deactivated/expired, Owner creates+edits+deactivates+unlocks staff, Cashier 403 pages and API, outlet create/edit/switch including a multi-outlet Cashier, 320 px overflow) |
| `npm run typecheck` / `npm run lint` (auth, contracts, web) | **PASS** — 0 errors, 0 warnings |
| `bash scripts/license-report.sh` | **PASS** — 749 locked packages; `better-auth` 1.7.28 and its MIT transitive tree; no disallowed runtime license. The classifier now treats npm `devOptional` packages as dev-only and reports the build-only `lightningcss` native children explicitly |
| `docker compose -f compose.dev.yaml config` / `docker compose -f compose.yaml config` | **PASS** — both parse; production requires `BETTER_AUTH_SECRET` with no default |
| Dev-login provisioning | **PASS** — seed accounts provisioned from a runtime password; counts only, no plaintext output |
| 403 denial | **PASS (next dev)** — Cashier direct `/users` and `/outlets` return HTTP 403 with the Bahasa forbidden boundary; verified by Playwright response status |
| Design evidence | **PASS (Chromium)** — 1440/1024/768/390/320 px: no horizontal overflow; 400 px login card; 44 px targets; keyboard focus ring; token-aligned light palette. Real Android/iOS, Firefox, WebKit, OS dark mode, and a hardware printer: **NOT VERIFIED** |

**Known gaps recorded, not silently accepted**

- Phone uniqueness is enforced in the WP3 service, but `packages/db` has no unique constraint on `(businessId, phone)`; concurrent creation can still race until WP2 adds one. WP3 does not edit `packages/db`.
- `login_attempts` rows are pruned for touched keys and globally after 30 days. The login route also has a bounded in-process per-IP throttle (30 failures/15 minutes, DEC-0011); a multi-replica deployment still needs the WP8 edge/IP throttle for cross-process coverage.
- ADR-0001 §3.4's per-user device list/revocation endpoint is not part of WP3; only token issuance, idle revocation, logout, and deactivation revocation exist. Assign the endpoint to WP7/WP8.
- The production `next build`/`next start` 403 status and the Docker image build are **NOT VERIFIED** until the aggregate gate/build and an image build are run.
- The `(back-office)/loading.tsx` route-group skeleton was removed because it forced a 200 before `forbidden()`; page-level Suspense now provides `Memuat…` states below the permission check.
- The auth pool uses the WP2 helper's default timeouts; WP1's health pool has tighter statement/query timeouts. Not changed here.
- Production first-Owner onboarding is not implemented in WP3. `provision:seed` targets only the four synthetic seed rows and refuses production unless explicitly overridden; a real installation needs a deliberate Owner-bootstrap runbook (WP8/WP9). Do not describe the seed CLI as a production onboarding path.

### 7.4 WP3 aggregate gate (2026-11-26, frozen candidate)

`fnm exec --using=26.13.1 -- bash scripts/check.sh` was run once on the frozen candidate after the completion audit. It exited 0.

| Gate step | Observed result |
|---|---|
| Preflight / Compose database | **PASS** — dev database recreated and healthy; `workshop_pos_test` reachable |
| `npm run typecheck` | **PASS** — web, auth, contracts, db; 0 errors |
| `npm run lint` | **PASS** — all four workspaces; 0 errors/warnings |
| `npm run test:unit` | **PASS** — web 33, auth 208, contracts 26, db 11 (278 total) |
| `npm run test:integration` | **PASS** — web 13, auth 41, db 63 (117 total) |
| `npm run test:e2e:web` | **PASS** — 22 Chromium tests; E2E reset guarded to the disposable dev DB; Cashier `/users` and `/outlets` return HTTP 403; Owner unlock and multi-outlet Cashier switch covered |
| `npm run build` | **PASS** — Next.js 16.4.6 production build; all API routes dynamic, `/login`, `/users`, `/outlets` dynamic; Proxy compiled |

The only post-gate edit was this documentation row (no code, config, test, or dependency changed). The E2E dev server logged one non-fatal `destination stream errored while writing data` after an intentionally aborted navigation; no test failed and it did not reproduce in the final run.

### 7.5 WP4 execution checks (2026-11-27, branch `feat/wp4-web-shell-catalog-inventory`)

WP3 was merged to `main` as PR #3 (`344de62`) before WP4 started. Focused checks below were run on the final working tree after the review/repair round; the aggregate gate runs once on the frozen candidate after the completion audit.

| Check | Result |
|---|---|
| `npm ci` | **PASS** — clean install from the single root lockfile, 576 packages |
| `npm run typecheck` | **PASS** — web, auth, contracts, core, db, design-tokens; 0 errors |
| `npm run lint` | **PASS** — all six workspaces; 0 errors/warnings |
| `npm run test:unit` | **PASS** — web 52, auth 208, contracts 37, core 25, db 11, design-tokens 4 (**337 total**) |
| `npm run test:integration` | **PASS** — web 41, auth 41, db 63 (**145 total**); catalog/inventory coverage includes active-outlet scoping, cost hiding, price/cost audit, opening stock, stock-in/adjustment, low-stock shortfall, append-only denial, ledger continuity, concurrent last-unit and duplicate replay, reversal pairing, WIB date boundaries, and cross-outlet audit |
| `npm run test:e2e:web` (Chromium) | **PASS** — 37 tests; shell/skip link, catalog CRUD + cost hiding, money-field Tab order, unsaved-change guard, inventory stock-in/adjustment/override, single ledger filter, Cashier 403 + audit row, and no page overflow at 320/390/768/1024/1440 |
| `npm run build` | **PASS** — Next.js 16.4.6 production build; `/`, `/catalog`, `/inventory`, `/users`, `/outlets` dynamic; catalog/inventory API routes force-dynamic |
| `bash scripts/license-report.sh` | **PASS** — `@tanstack/react-table` 9.3.1 and its MIT tree recorded; no disallowed runtime license |
| Secret scan | **PASS on the source tree** — `gitleaks dir .` after removing gitignored `.next` and `test-results` build artifacts; no tracked secret. Local `.next` caches contain generated preview keys and stay out of scans/commits |
| Design evidence (Chromium) | **PASS** — 1440/1280/1024/768/390/320: no page overflow; sidebar 264/72, top bar 56 + 1 px rule, 44 px rows for single-line content; dark `data-theme` with token contrast 15.67/5.76; axe 0 critical/serious on catalog/inventory/legacy/login in light and dark; cashier has no cost column/text or mutation controls; `/inventory` returns a real 403. Real Android/iOS, Firefox, WebKit, OS dark mode beyond Chromium emulation, screen-reader output, 200%/400% zoom, and a 200-character reason are **NOT VERIFIED** |
| Known limitation | The catalog global search is catalog-scoped until WP5 adds vehicle/customer lookup; legacy WP3 users/outlets table density is unchanged by WP4; self-hosted Inter/IBM Plex Mono remain WP9 work, so the documented fallback stack renders; the dev server logs a non-fatal React warning from next-themes' pre-paint script (production build passes), and the dev DB must be re-seeded after E2E because the reset leaves test fixtures |

### 7.6 WP4 aggregate gate (2026-11-27, frozen candidate)

`fnm exec --using=26.13.1 -- bash scripts/check.sh` was run once on the frozen candidate after the completion audit and the §7.5 documentation update. It exited 0.

| Gate step | Observed result |
|---|---|
| Preflight / Compose database | **PASS** — Docker preflight, dev database healthy, `workshop_pos_test` reachable |
| `npm run typecheck` | **PASS** — web, auth, contracts, core, db, design-tokens; 0 errors |
| `npm run lint` | **PASS** — all six workspaces; 0 errors/warnings |
| `npm run test:unit` | **PASS** — web 52, auth 208, contracts 37, core 25, db 11, design-tokens 4 (337 total) |
| `npm run test:integration` | **PASS** — web 41, auth 41, db 63 (145 total) |
| `npm run test:e2e:web` | **PASS** — 37 Chromium tests |
| `npm run build` | **PASS** — Next.js 16.4.6 production build; `/`, `/catalog`, `/inventory`, `/users`, `/outlets` dynamic |

The only post-gate edit is this documentation section and the status fields above (no code, config, test, or dependency changed). WP4 was merged to `main` as PR #4 (`cdf3036`) before WP5 started.

### 7.7 WP5 execution checks (2026-11-27, branch `feat/wp5-customers-vehicles-history`)

WP4 was merged to `main` as PR #4 (`cdf3036`) before WP5 started. Focused checks below were run after the consolidated review repair round; the aggregate gate runs once on the frozen candidate after the completion audit.

| Check | Result |
|---|---|
| `npm run test:unit --workspace @workshop-pos/contracts` | **PASS** — 3 files, 46 tests; customer/vehicle/history round-trips, phone canonicalization and masking, list payloads exclude address/notes/vin, plate input, year/odometer bounds, export document |
| `npm run test:unit --workspace @workshop-pos/web` | **PASS** — 8 files, 84 tests (WP5 DOM file: 24 static-markup tests for masked phone, anonymized row and actions, drill-down link, reuse notice, chip tones, collapse, out-of-range states) |
| `npm run test:integration --workspace @workshop-pos/web -- --run tests/customers-vehicles.integration.test.ts` | **PASS** — 25 tests against `workshop_pos_test`: `b 1234 xyz` → `B1234XYZ`, idempotence, duplicate reuse (200/reused, one row), exactly one customer, odometer/year/invalid-character rejection, list search by name/phone/raw plate, masked phone and omitted address/notes, VIN/notes omitted from list and history, history newest-first with lines/quantities/odometer/total/status/balance, empty history, 1,000-order page 40/40, Cashier own outlet vs Owner all outlets, cross-outlet denial + audit, Mechanic detail 403 + audit, anonymization (Owner only, audited, no erased values in audit, vehicles/orders preserved), export (Owner only, audited, reassignment exclusion, no bind-parameter list), draft/estimated balance agreement |
| `npx vitest run --config vitest.config.ts tests/vehicle-history.test.ts` (apps/web) | **PASS** — 8 tests on money/status mapping and the non-void balance rule |
| `npm run typecheck --workspace @workshop-pos/web` | **PASS** — 0 errors |
| `npm run lint --workspace @workshop-pos/web` | **PASS** — 0 errors/warnings |
| `npx playwright test tests/e2e/customers-vehicles.spec.ts` | **PASS** — 5 Chromium journeys: Owner creates customer+vehicle, full phone only in the edit dialog, duplicate `b …` plate reuse (single row, owner named, dirty-navigation guard), duplicate/out-of-range pages, read-only history, export JSON (`formatVersion: 1`), anonymization with reason and no residual name/phone/address/notes, VIN/notes never rendered; Cashier has no personal-data action and gets 403; unknown/malformed vehicle ids; populated PAID/COMPLETED-unpaid/VOID history with seeded orders at every width |
| Design evidence (Chromium) | **PASS at 1440/1024/768/390/320** on `/customers`, `/vehicles`, and a populated `/vehicles/[id]`: `scrollWidth <= innerWidth` on every page; 15 full-page screenshots in gitignored `apps/web/test-results/design-qa/`; payment status moved next to the date so “Lunas”, “Belum lunas”, and “Dibatalkan” are visible at 320 px before horizontal scroll; masked phone in lists, 44 px targets, role-gated controls absent rather than disabled |
| Privacy controls | **PASS (focused)** — full customer phone/address/notes and vehicle VIN/notes are management-only (Owner/Admin/Cashier); Mechanic list/history reads carry masked phone and no VIN/notes; anonymization and export are Owner-only and audited; audit entries store field names/counts only (founder decision 2026-11-27: names only); no PII in application logs or error responses; export is `no-store` JSON attachment |
| Design review | `designer` gate: no blocker, no contrast failure, no page-level overflow; the fixable majors (dead anonymized controls, phone hint, unbounded picker, dirty navigation, plate target, payment priority, out-of-range pages, line collapse) were fixed in the repair round. Remaining items are WP4-owned shared-shell work: global search, offline banner, DataTable `min-width`/`aria-sort`, Pagination disabled semantics, dark-mode `color-scheme`, template/token drift |
| Security review | `security-reviewer`: no critical/high finding; medium full-detail read fixed (management-only, audited), list payload minimization fixed, service-level denial audits added, export customer-only and scoped, history payment aggregation scoped, no new dependencies |
| Secret scan | **PASS on the final source tree** — gitignored `.next`/`test-results` removed first; `gitleaks dir .` scanned ~3.03 MB and found **no leaks** (exit 0). `gitleaks git .` also found no leaks across 15 commits. The 15 design screenshots were moved outside the worktree before the scan |

**Known limits recorded, not silently accepted**

- History is read-only and empty in a fresh installation until WP6 writes orders; populated rows are proven by integration tests and a synthetic-order Playwright fixture, never by a fake order API.
- Performance target NFR-002/AC10.5 (first page ≤ 5 s p95 at 1,000 orders) is structural only; the 1,000-order pagination test proves correctness, not latency. Real measurement is WP8.
- Customer/vehicle master data is business-level because the schema has no outlet column (BR-006/D-5); Cashier/Mechanic outlet scope applies to order history, not master rows. A Cashier can edit a customer/vehicle used at another outlet; a Mechanic can read the masked list but not the full detail. Changing master visibility would require a data-model change (WP2) and is not done here.
- Masked phone search is an authenticated existence oracle and WP5 endpoints have no per-user rate limit; denial and export/anonymize spam is bounded only by authentication. WP8 owns edge/rate-limit hardening.
- Anonymization clears the customer row only; plate/VIN/vehicle notes and order linkage remain for financial integrity. Field-level retention is counsel-required (PRD §7.4/D-6).
- Export is order-level JSON (no payment references/line descriptions) and uncapped; a very large history is a memory risk, not solved here.
- Real Android/iOS, Firefox, WebKit, screen readers, OS dark mode, 200%/400% zoom, and a production build render are **NOT VERIFIED**. The dev-only Next indicator appears in the design screenshots.

### 7.8 WP5 aggregate gate (2026-11-27, frozen candidate)

`fnm exec --using=26.13.1 -- bash scripts/check.sh` was run once on the frozen candidate after the completion audit returned `complete`. It exited 0 in 152.80 s.

| Gate step | Observed result |
|---|---|
| Preflight / Compose database | **PASS** — Docker preflight, development database healthy, `workshop_pos_test` reachable |
| `npm run typecheck` | **PASS** — web, auth, contracts, core, db, design-tokens; 0 errors |
| `npm run lint` | **PASS** — all six workspaces; 0 errors/warnings |
| `npm run test:unit` | **PASS** — web 84, auth 208, contracts 46, core 25, db 11, design-tokens 4 (**378 total**, 21 files) |
| `npm run test:integration` | **PASS** — web 73, auth 41, db 63 (**177 total**); WP5 contributes 25 tests including the 1,000-order history and privacy/RBAC cases |
| `npm run test:e2e:web` | **PASS** — 42 Chromium tests (WP4 37 + WP5 5); the dev server logged a non-fatal `destination stream errored while writing data` after an intentionally aborted navigation and a pre-existing next-themes script warning; no test failed |
| `npm run build` | **PASS** — Next.js 16.4.6 production build; `/customers`, `/vehicles`, `/vehicles/[id]`, `/api/v1/customers/**`, and `/api/v1/vehicles/**` dynamic; proxy compiled |

The only post-gate edits are this §7.8 block, the §7.7 secret-scan row, and the status fields above (no code, config, test, or dependency changed). WP5 was merged to `main` as PR #5 (`8a2a550`).

### 7.9 WP6 execution checks (2026-11-27, branch `feat/wp6-orders-payments-receipts`)

WP5 was merged to `main` as PR #5 (`8a2a550`) before WP6 started. Focused checks below were run after the consolidated review repair round; the aggregate gate runs once on the frozen candidate after the completion audit.

| Check | Result |
|---|---|
| `npm run test:unit` | **PASS** — web 104, auth 208, contracts 58, core 47, db 11, design-tokens 4 (**432 total**); WP6 adds the BR-007 lifecycle table, 58/80 mm receipt rows/stamps/wrapping, the AC3.1 pricing example, order/payment/receipt contract round-trips, and static-markup tests for receipt, summary, timeline, list, filter, and payment-status copy |
| `npm run test:integration` | **PASS** — web 119, auth 41, db 63 (**223 total**); WP6 contributes 35 tests against `workshop_pos_test`: AC3.1 figures and one decrement (20→19), empty/invalid order rejection, discount-cap denial + audit, approved override + audit, service-line vehicle requirement, product-only sale, idempotent replay and concurrent double submit, split and partial payments, non-cash ceiling and cash change, estimate issue/approval/revert with edits frozen, completion and paid-while-in-progress single decrement, unpaid void (Admin-only, stock restored once) and paid void (Owner-only, per-method refunds, reversal), pre-`PAID` payment correction with before/after audit, cross-outlet denial + audit, Mechanic work-list scoping, tampered client totals, receipt/reprint/void stamps, 80 mm outlet, WP5 vehicle history showing the paid order, and regression coverage for percent line discounts (stored amount + re-price), whole-completion rollback on a stock shortage, correction-to-PAID settlement, partial-paid void refunds, edits below collected money, estimate-vs-receipt print counts, active-Mechanic technician validation, Mechanic self-assignment on intake, header edits that do not change the discount needing no new approval, and the paid-void password re-authentication |
| `npm run test:e2e:web` (Chromium) | **PASS** — see §7.10 for the full-suite count; the WP6 spec adds 11 journeys: AC3.1 counter sale with the exact receipt and database figures, Cashier cap denial + audit, split payment, estimate→approval→work→completion→payment, Admin paid-void denial, Owner paid void with refunds and `DIBATALKAN`, reprint `SALINAN` + audit count, one-order double submit, Mechanic assigned-only list and intake-only screen, a partial counter tender that stays on the payment step, and 320/390/768/1024/1440 px overflow checks on the list, sale, detail, and print pages |
| `npm run typecheck` / `npm run lint` | **PASS** — all six workspaces; 0 errors/warnings |
| `npm run build` | **PASS** — Next.js 16.4.6 production build; `/orders`, `/orders/new`, `/orders/[id]`, `/print/receipt/[id]`, `/api/v1/orders/**`, `/api/v1/payments/**`, and `/api/v1/receipts/**` dynamic |
| Design evidence (Chromium) | **PASS** — 1440 px and 390 px screenshots of the order list, counter sale, order detail, voided order, and receipt; no page-level horizontal overflow at 320/390/768/1024/1440; the receipt preview shows all 35/48 columns at a readable size and keeps the paper white in dark mode (verified by computed style: `#fff` paper, `#111` ink); browser print declares `@page size: <58/80>mm auto`; 44 px controls; permission-denied actions are absent rather than disabled. Real Android/iOS, Firefox, WebKit, a hardware printer, and screen-reader output are **NOT VERIFIED** |
| Design review | `designer` gate: 4 blockers and 13 majors triaged. Fixed in WP6-owned files: status and money are the first list columns; line/tender tables are consolidated with a visible scroll hint; the void dialog states the refund for partially paid orders; the empty-cart primary is disabled with a visible reason; the tender action shows the applied amount and a live change row; the paid-void dialog asks for the Owner password, verified server-side before the transaction; refunds are visible on the order detail; payment delete/correction dialogs name the method and amount; money is tabular; one accent primary per view; money and actions precede history on narrow screens; Bahasa forbidden/not-found boundaries; the receipt preview uses a readable token size with `@page` paper width and real print tokens. One defect stays **open in WP4 and was not edited here** (the brief forbids WP4 shell/token changes): `components/ui/{input,textarea}.tsx` and `.bo-select` use `border.default` (1.57:1) where `DESIGN.md` §2.2 assigns `border.strong` (3.61:1); WCAG 2.2 AA 1.4.11 needs 3:1 on the only boundary cue. Remedy is one class/token per primitive. Line and tender rows were rebuilt as responsive lists (not the WP4 1,000 px table), so quantity, totals, and the payment actor never clip; the order list uses stacked cards below 640 px. Deferred with reason: route-level `loading.tsx` would stream a 200 before `forbidden()`/`notFound()` (the WP4 precedent), so order routes keep real 403/404 statuses and WP8 owns a navigation-progress affordance; document-number typography, status rails, and share/PDF remain WP4/WP7/WP9 |
| Decision log | DEC-0012 (a payment row stores applied money; refunds reverse it; the two WP5 read sites were corrected and ratified), DEC-0013 (`PAID` terminal per BR-007, refunds for every tender on a void, correction-to-`PAID`, rejecting edits below collected money), and DEC-0014 (founder-ratified: audited pre-`PAID` tender deletion; `SALINAN` marks a print attempt) are recorded in `docs/ops/decision-policy.md` |
| Money semantics decision | `payments.amount` stores the money applied to the balance and `change_amount` stores returned cash, so a whole-order refund reverses exactly the retained money. The two WP5 read sites that subtracted change again (`vehicle-service.ts`, `customer-service.ts`) were corrected to `sum(amount)`; the change is still printed as the tendered cash row (`amount + change`) |
| Review regressions fixed | Consolidated review round: percent line discounts now persist their computed rupiah amount and re-price as percent XOR amount (a double-discount derivation bug is covered by a regression test); stock settlement/reversal is passed the order's open transaction so a later-line shortage rolls the whole completion back (test proves zero decrement rows); a pre-`PAID` correction that covers the total now reaches PAID with `paidAt`, timeline, and stock; partially paid voids record refunds; edits that would drop the total below collected money are rejected; estimate prints no longer inflate the receipt's `SALINAN` count; the counter stays on the payment step after a partial tender; a Mechanic's intake is auto-assigned to the Mechanic so it is readable immediately; header edits that leave the order discount unchanged no longer re-ask for approval; the print page is read-only until the operator presses Cetak (the POST then records exactly one attempt); a paid void re-authenticates the Owner's password server-side and audits a failed attempt (state matrix §2.10) |
| Known limits recorded | PAID is terminal except VOID under BR-007, so AC6.2's "paid while in progress then completed" is proven by rejecting the later completion while the ledger holds exactly one decrement; the print page is read-only on render and records one `receipt.printed` audit row per Cetak click; order search covers number/plate/customer name only (phone search was removed so a phone never lands in a GET URL or proxy log); order routes have no route-level skeleton so 403/404 statuses stay real; the paid-void password requirement is evaluated from the pre-lock read (a concurrent COMPLETED→PAID transition during the same request could skip the second prompt, though the role gate is re-checked inside the lock and only the Owner can void PAID) — WP8 hardening note; the input/select boundary contrast fix belongs to WP4; reports, void exclusion from sales totals, and native ESC/POS printing remain WP7/WP8 |


### 7.10 WP6 aggregate gate (2026-11-27, frozen candidate)

`fnm exec --using=26.13.1 -- bash scripts/check.sh` ran on the frozen candidate after the completion audit returned `complete`, then again after the consolidated review fixes (Mechanic intake, header-discount gating, read-only print render, paid-void re-authentication). The final run exited 0 in 172.71 s (`All gates passed.`).

| Gate step | Observed result |
|---|---|
| Preflight / Compose database | **PASS** — Docker preflight, development database healthy, `workshop_pos_test` reachable |
| `npm run typecheck` | **PASS** — web, auth, contracts, core, db, design-tokens; 0 errors |
| `npm run lint` | **PASS** — all six workspaces; 0 errors/warnings |
| `npm run test:unit` | **PASS** — web 104, auth 208, contracts 58, core 47, db 11, design-tokens 4 (**432 total**) |
| `npm run test:integration` | **PASS** — web 119, auth 41, db 63 (**223 total**) |
| `npm run test:e2e:web` | **PASS** — 53 Chromium tests (WP4 37 + WP5 5 + WP6 11; the full suite was re-run to capture the count and took 2.0 m) |
| `npm run build` | **PASS** — Next.js 16.4.6 production build of the full route table; `/orders`, `/orders/new`, `/orders/[id]`, `/print/receipt/[id]`, and the order/payment/receipt API routes dynamic |

**Post-gate edits:** only this §7.10 block, the §7.9 rows that record the consolidated review fixes and the founder-ratified DEC-0014, and the status fields above (no code, config, test, or dependency changed after the gate). The count-only re-runs of unit, integration, and E2E used the same frozen tree; they reset the disposable dev database as their documented setup does.

**Carry-over for WP4:** the input/textarea/select boundary uses `border.default` (1.57:1) where `DESIGN.md` §2.2 assigns `border.strong` (3.61:1); WCAG 2.2 AA 1.4.11 requires 3:1. WP6 did not edit WP4-owned files; the remedy is one class/token per primitive.

**Carry-over for PM:** a PRD errata at the next revision should align AC6.2's "paid while in progress, then later completed" wording with BR-007/AC8.1 (DEC-0013).

### 7.11 WP6.1 execution checks (2026-11-27, branch `feat/wp6-1-server-sync`)

WP6 was merged to `main` as PR #6 (`9f2fc8f`) before WP6.1 started. The seam adds `packages/contracts/src/sync.ts`, `POST /api/v1/sync`, `POST /api/v1/sync/[clientKey]/resolve`, `GET /api/v1/sync/conflicts`, and one additive offline-application function in `apps/web/lib/order-service.ts`; no schema, auth package, UI, mobile, or WP6 order/payment logic was rewritten.

| Check | Result |
|---|---|
| `npm run test:unit` | **PASS** — web 107, auth 208, contracts 66, core 47, db 11, design-tokens 4 (**443 total**). WP6.1 contributes 8 contract tests (envelope, money shape, conflict codes, result round-trips) and 3 hash tests (stable replay hash; actor/key/money sensitivity) |
| `npm run test:integration --workspace @workshop-pos/web` | **PASS** — 139 tests, including 17 WP6.1 cases against `workshop_pos_test`: first apply at the local price with one decrement, a `PRICE_CHANGED` notice, server-assigned timestamps, and the device time returned separately; replay returning the same order with an incremented attempt count and no duplicate order/payment/ledger row; same key with different content rejected; `STOCK_INSUFFICIENT` with local/server quantities and no order/ledger; one failing sale not blocking the next; Admin override of two short lines (one unflagged decrement, one `OVERRIDE` row, reason persisted, stock −11); Mechanic list/void denials audited and a Cashier void with a cash refund row, no decrement, and a cleared conflict; replay of a resolved result; cross-outlet/device denial audited; `PLATE_REASSIGNED` conflict and explicit re-link without mutating the vehicle; void and stock-short re-confirmation of plate conflicts; `CASH_REPORTING` on a prior-business-date sync; bearer conflict listing pinned to its outlet; payment-sum and local-tax arithmetic rejection; above-cap discount and tax-rate mismatch audits; and an idempotency-key collision mapped to a stable 409 without a sale. The existing WP6 order/payment/void cases still pass |
| `npm run typecheck` / `npm run lint` | **PASS** — all six workspaces; 0 errors/warnings |
| `npm run build` | **PASS** — Next.js 16.4.6 production build; `/api/v1/sync`, `/api/v1/sync/[clientKey]/resolve`, and `/api/v1/sync/conflicts` are dynamic |
| Review round | `reviewer` + `security-reviewer`: the late-conflict 500, nondeterministic timeline tie, cross-outlet replay audit rollback, unpinned bearer conflict list, and idempotency-key collision were fixed; above-cap discounts and device/setting tax-rate differences now write audit rows. Remaining nits (unpaginated list, body cap vs 100-line contract, second copy of note text, unbounded `changeAmount`) are recorded as limits. `completion-auditor` returned PASS on the final candidate |
| Decision review | `decision-reviewer` approved DEC-0015 (a Cashier may void a queued conflict under `create_sale`; normal order voids still need `void_unpaid`) and DEC-0016 (offline above-cap discount and tax-rate deviations apply with local money and an audit row). Both are Tier 2 reference-matching, recorded in `docs/ops/decision-policy.md` |
| `gitleaks dir .` | **PASS on source** — the first scan reported 13 `generic-api-key` matches exclusively inside the gitignored `apps/web/.next/**` build output; after removing that generated directory the rescan reported `no leaks found` (3.52 MB scanned) |

**Behavior evidence:** the client key is unique per business and the stored result is returned verbatim on replay, with the attempt count and last-attempt time advanced; the order, payments, stock decrement, `sync_keys` row, and stored result commit in one transaction. Local unit prices, discounts, tax, and tender amounts are validated arithmetically against the local tax rate and persisted without repricing. Stock is checked under `FOR UPDATE` product locks; a shortage writes nothing. Overrides flag only the line that drives the balance negative. A void creates `DRAFT` order → lines/payments → refunds → `VOID` so the financial-history trigger stays satisfied, with no ledger row. Order and payment timestamps are server-assigned (a wrong device clock cannot future-date a report); the device time is retained in `sync_keys.device_recorded_at` and the response. Resolution keeps the sale attributed to the capturing cashier while the resolver is the audit/ledger actor. A Cashier without override permission may void the queued sale (DEC-0015); a Mechanic is denied and audited. A late second conflict (for example the plate moves again before an override) is persisted as the new code and returned rather than escaping as a 500. Offline above-cap discounts and device/setting tax-rate differences apply with the paid money but write `sync.discount_above_cap` / `sync.tax_rate_mismatch` (DEC-0016). The order timeline breaks same-timestamp ties with the initial `DRAFT` event first. Bearer conflict listing is pinned to the device outlet and requires `create_sale`. Denials use WP3's `auditDenial` (cross-outlet and role), and conflicts remain listable until `resolved_at` is set.

**Recorded limits:** the WP2 `sync_state` enum is `QUEUED | APPLIED | CONFLICT`, so the brief's fourth state is derived: resolution writes `resolved_at`/`resolved_by` (override also becomes `APPLIED`; void stays `CONFLICT` with resolution markers) and the API reports `RESOLVED`. The original sync request is stored beside its result in `idempotency_keys.response_body` because `sync_keys` has no payload column; resolution needs the local snapshot, so free-text notes/references exist in a second table with no purge path yet (WP8 retention). The shared 16 KiB JSON body cap (WP3) still applies to sync uploads and a contract-maximum 100-line cart can exceed it. Local discount-cap and tax-rate deviations are audited rather than blocked (DEC-0016); `CASH_REPORTING` is raised by a business-date rollover because WP8 has no day-close table yet. Device time is never used as a report timestamp; only the `CASH_REPORTING` comparison reads it. A business-wide client key means another outlet that learns a key can claim it first (WP2 schema uniqueness); a collision with an online idempotency key is mapped to a stable 409, not a 500. Conflict listing is unpaginated and unbounded. Route-level bearer HTTP exchange with a real device token, the mobile client, UI, and multi-day e2e synchronization are **NOT VERIFIED**; the integration cases drive the same service with bearer/web contexts.

### 7.12 WP6.1 aggregate gate (2026-11-27, frozen candidate)

`fnm exec --using=26.13.1 -- npm ci` reinstalled the tree from the committed lockfile (576 packages, exit 0, 12.25 s). After the review fixes, `fnm exec --using=26.13.1 -- bash scripts/check.sh` ran on the frozen candidate and exited 0 in 169.89 s (`All gates passed.`); the earlier post-`npm ci` gate also passed.

| Gate step | Observed result |
|---|---|
| Preflight / Compose database | **PASS** — development database healthy; `workshop_pos_test` reachable |
| `npm run typecheck` | **PASS** — web, auth, contracts, core, db, design-tokens; 0 errors |
| `npm run lint` | **PASS** — all six workspaces; 0 errors/warnings |
| `npm run test:unit` | **PASS** — web 107, auth 208, contracts 66, core 47, db 11, design-tokens 4 (**443 total**) |
| `npm run test:integration` | **PASS** — web 139, auth 41, db 63 (**243 total**) |
| `npm run test:e2e:web` | **PASS** — 53 Chromium tests |
| `npm run build` | **PASS** — Next.js 16.4.6 production build; the three sync routes are dynamic |
| `gitleaks dir .` | **PASS** — after removing the generated `apps/web/.next` directory, no leaks found (3.52 MB scanned) |

**Post-gate edits:** only this §7.11/§7.12 documentation block and the removal of generated `.next` output (no code, config, test, or dependency changed after the gate).

### 7.13 WP7 execution checks (2026-11-27, branch `feat/wp7-mobile-offline-pos`)

WP6.1 was merged to `main` as PR #7 (`c8a38ec`) before WP7 started. The mobile workspace consumes `packages/contracts/src/sync.ts` and the existing catalog/customer/vehicle/order/auth endpoints; no server route, schema, auth package, or web UI was edited. The thermal printer dependency remains uninstalled (`REVIEW`).

| Check | Result |
|---|---|
| `npm ci` | **PASS** — reinstalled the tree from the committed lockfile after the mobile dependencies were added; exit 0 (67.65 s) |
| `npm run typecheck` | **PASS** — all seven workspaces including `@workshop-pos/mobile`; 0 errors |
| `npm run lint` | **PASS** — web/auth/contracts/core/db/design-tokens plus mobile; 0 errors/warnings |
| `npm run test:unit` | **PASS** — web 107, auth 208, contracts 66, core 47, db 11, design-tokens 4, mobile 72 (**515 total**, 38 files) |
| Mobile sync-contract test | **PASS** — the AC3.1 offline payload (`1×250000` product + `1×50000` service, 10% order discount, 11% PPN, cash 300000) parses with the shared `syncApplyRequestSchema`; total `299700`, tax `29700`, per-line tax `24750`/`4950`, payment `amount=299700`, `changeAmount=300` |
| Offline sale and outbox | **PASS** — one SQLite transaction writes `local_orders` + `outbox`; the queue survives a real file reopen; a row left `SENDING` by a force-kill returns to `QUEUED`; cashier discount caps block before any row is written; a duplicate client key cannot create a second local order |
| Sync engine (client) | **PASS** — deterministic `seq` order, single-flight run, replay of the same client key with the identical payload, jittered exponential backoff (2 s → 5 min cap), one transient/permanent failure not blocking the next row, conflict rows never retried, and a 401 aborting the run while leaving both queued sales intact |
| Conflict decisions | **PASS** — `STOCK_INSUFFICIENT` shows product/local quantity/server stock/money; override is refused for a Cashier even when the API is reachable; void and override require the outlet minimum reason; unresolved conflicts persist across runs and are only cleared by an explicit resolve response |
| Cache and erasure | **PASS** — catalog stock is cached as provisional; only masked customer phones are stored; vehicle history survives offline; 401 clears read-only personal caches but keeps paid-but-unsynced sales; explicit destructive sign-out purges the queue and every personal cache table |
| Receipt | **PASS** — 35/48 columns, no row wider than the paper; offline stamp `SALINAN LOKAL — BELUM TERSINKRON`; final invoice number removes the stamp; `SALINAN` and `DIBATALKAN` stamps; ESC/POS bytes initialize, print, and cut; non-ASCII receipt punctuation is transliterated. Real printer output is **NOT VERIFIED** |
| RNTL | **PASS** — 8 component tests: keypad `000`/backspace/limit/clear, sync-chip offline/conflict/online copy, offline banner, the conflict screen for Cashier (no override) and Admin (reason-gated override), and the inactivity lock/absolute expiry timers |
| Auth-boundary and transport regression | **PASS** — 4 HTTP-client tests: a 401 with no bearer token (failed login) never clears the device session; a rejected bearer token triggers exactly one session clear and is sent only in the Authorization header; a server error never echoes the token; production `http://` fails closed while development loopback HTTP is accepted (NFR-007) |
| License report | **PASS** — `bash scripts/license-report.sh` reports no disallowed runtime license. The founder approved the minimal WP1-gate change on 2026-11-27: SPDX `OR` alternatives are evaluated correctly (`node-forge` BSD-3-Clause chosen over GPL-2.0) and Expo-CLI `lightningcss` (MPL-2.0) is a recorded build-only exception because it is not bundled into the APK. The pre-existing dev/optional buckets remain review-only; WP1/WP8 must add a forbidden-license hard fail before handover |
| Design QA (static) | **PASS after fixes (visual `NOT VERIFIED`)** — token-only palette/type, role-aware four tabs, 64 dp tab bar with safe-area inset, 56 dp header/sale summary, 48 dp control targets, 3:1 control boundaries and accent selected segment, paper-white receipt, pinned payment balance, bottom receipt action bar, honest loading/error/`—` states, WIB timestamps, shared order-status labels, and a conflict `PERLU TINJAUAN` stamp. Remaining design debt: lifecycle `StatusRail`, mono `PlateText`, header avatar/profile sheet, quantity keypad, native `Alert` → in-app sheet, visible search labels, theme toggle, tablet rail/two-pane, and long-content/font-scale visual captures. No screenshots or device renders exist |
| Auth storage | **PASS (unit)** — the bearer token and session snapshot live in SecureStore; sign-out clears them; PIN enrollment stores only a salted SHA-256 verifier; five wrong attempts trigger a 60 s lock and two lockouts require the full credential. A stored session with an unreadable PIN verifier fails closed to full sign-in, and unlock checks absolute expiry. Device keystore behavior on a real Android build is **NOT VERIFIED** |
| Decision log | DEC-0017–DEC-0022 recorded in `docs/ops/decision-policy.md`: 401 queue preservation, outlet-switch guard (founder 2026-11-27), learned outlet policy, destructive sign-out/erasure, production HTTPS with dev-only HTTP (founder 2026-11-27), and SPDX `OR`/Expo-CLI license exception (founder 2026-11-27, review 2027-05-31). DEC-0015 covers conflict void/override |

**Behavior decisions recorded in the client**

- Money is local-authoritative. The mirrored pricing module reproduces the server allocation/rounding rule exactly and the payload is validated with the shared contract before the local transaction.
- Stock is server-authoritative. Local stock is always labelled provisional until a server refresh; a conflict is a persistent queue state, never a dismissed toast.
- Outlet policy (tax, paper width, cashier discount cap, void-reason minimum) has no mobile endpoint. The app learns it from the newest server order on cache refresh and from every applied sale, and falls back to the documented server defaults (11% PPN, 58 mm, 0% cashier cap, 10-character void reason) until then. The sale screen names the default source; the server audits a tax-rate deviation.

**Recorded limits and `NOT VERIFIED` items**

- No Android emulator, physical device, APK build, cold-start measurement, or thermal printer was available. APK size ≤ 60 MB, cold start ≤ 5 s, print p95 ≤ 5 s, real 58/80 mm output, TalkBack, OS font scaling, tablet layout, auto-lock timing on a real device, and iOS are **NOT VERIFIED**.
- The native printer transport is intentionally absent (Epson SDK `REVIEW`). `Cetak struk` reports "Printer tidak terhubung" and offers share/PDF, which work offline.
- The destructive sign-out screen requires a reason, but no server audit endpoint exists for a local logout; the reason gates the action and is not transmitted. WP8/retention work should decide whether a local audit trail is required.
- The local settings snapshot lacks receipt header/footer text until a server settings API exists; the receipt uses the header/footer learned from a previously synced order when available, otherwise none.
- Conflict resolution is online-only by design; the screen keeps the conflict visible offline instead of queueing a decision that the server has not accepted.
- Design QA remaining (not blockers after the fix round): lifecycle rail on cards, mono plate treatment, header avatar/profile sheet, quantity keypad sheet, in-app confirm sheets instead of native alerts, visible search labels, per-device theme toggle, and the 768–1024 dp rail/two-pane layout. These require visual/device work and are recorded as WP7 design debt.
- The mobile app uses `expo-router` typed-route strings; no deep-link allowlist or universal-link configuration exists, and an unknown deep link lands on the route guard. App-link hardening is WP8/WP9 work.
- No device-level rate limit exists for repeated PIN attempts beyond the in-app delay; Android keystore hardening and device management are handover/ops work. The PIN verifier is a salted SHA-256 (fast KDF) and is defense-in-depth only; a native KDF is a future hardening item.
- An inactivity timer locks the device at the outlet's idle timeout, but DESIGN §7.7's shared-device user list, server-side PIN recovery/Admin unlock, and per-user cached views are not implemented; the shipped flow is a single cached user with a local 6-digit PIN and full sign-out to switch users. This is a recorded design gap for the next mobile iteration.
- Queue rows are scoped by outlet but not by creating user: the next same-outlet staff member can see a predecessor's unsynced sale/receipt. The server attributes the applied order to the token that syncs it (the contract has no actor field). This is an accepted minimization/attribution limit; syncing before a shift change is the operational control.
- Sign-out, PIN forgot, and session expiry make a best-effort `POST /api/v1/auth/logout` to revoke the bearer token; when offline the local credential is still removed but the server keeps the token until its idle/absolute TTL. Device revocation by an Owner remains the authoritative control.
- Receipt exports are deleted after share and swept from the dedicated cache directory on sign-out/expiry/outlet switch. `app.json` sets `android.allowBackup = false`; the generated manifest was not inspected in a real Android build.
- DESIGN §7.8's 768–1024 dp navigation rail is not implemented; the same four bottom tabs are used at every width. Tablet layout is **NOT VERIFIED**.
- Haptics (supplementary per DESIGN §7.3) are not wired; visual feedback is always present.

### 7.14 WP7 aggregate gate (2026-11-27, frozen candidate)

`fnm exec --using=26.13.1 -- bash scripts/check.sh` ran once on the frozen candidate after `completion-auditor` returned `complete`. It exited 0 in 343.03 s (`All gates passed.`).

| Gate step | Observed result |
|---|---|
| Preflight / Compose database | **PASS** — Docker preflight, development database healthy, `workshop_pos_test` reachable (the gate aborts otherwise) |
| `npm run typecheck` | **PASS** — all seven workspaces including `@workshop-pos/mobile`; 0 errors (also re-run directly before the gate) |
| `npm run lint` | **PASS** — all seven workspaces; 0 errors/warnings (also re-run directly before the gate) |
| `npm run test:unit` | **PASS** — mobile 72, web 107, auth 208, contracts 66, core 47, db 11, design-tokens 4 (**515 total**, 38 files); the unit counts were captured from the direct run immediately before the gate |
| `npm run test:integration` | **PASS** — no step failed; the gate log was tail-truncated, so this run's exact per-workspace counts were not captured (WP6.1 recorded web 139, auth 41, db 63 on the same server code) |
| `npm run test:e2e:web` | **PASS** — no step failed; 53 Chromium tests were the last recorded count on the same web code, but this run's count was not captured from the truncated log |
| `npm run build` | **PASS** — Next.js 16.4.6 production build; the full route table including `/api/v1/sync/**`, orders, payments, receipts, and back-office pages was printed |

**Post-gate edits:** only this §7.14 block and the non-behavioural documentation corrections above (no code, config, test, dependency, or lockfile change after the gate). `gitleaks dir .` was run on the source tree immediately before the gate: no leaks found (3.99 MB scanned).

### 7.15 WP8 execution checks (2026-11-27, branch `feat/wp8-reports-audit-settings-hardening`)

WP7 was merged to `main` as PR #8 (`589418d`) before WP8 started. WP8 adds `packages/core/src/report-period.ts`, the reports/audit/settings/export contracts, report and export read models, Owner-only settings/branding services, the reports/audit/settings screens, the WP4 input/select contrast fix, `.woodpecker/ci.yml`, `.githooks/`, and `scripts/install-hooks.sh`. `packages/db`, WP3 auth, WP4 shell/tokens, WP5 master-data logic, WP6 order/payment logic, WP6.1 sync, and WP7 mobile code were not rewritten; the only WP4/WP5 edits are the input/select boundary classes and one vehicle-link accessible name required by the axe sweep.

| Check | Result |
|---|---|
| `npm run typecheck` | **PASS** — all seven workspaces (web, auth, contracts, core, db, design-tokens, mobile); 0 errors |
| `npm run lint` | **PASS** — all seven workspaces; 0 errors/warnings |
| `npm run test:unit` | **PASS** — mobile 72, web 116, auth 208, contracts 77, core 55, db 11, design-tokens 4 (**543 total**); WP8 adds 8 report-period tests, 11 report/settings/audit contract tests, and 9 report/audit DOM tests |
| `npm run test:integration` | **PASS** — web 171, auth 41, db 63 (**275 total**). WP8 contributes 20 tests against `workshop_pos_test`: exact daily sales/status counts, explicit zero day, outlet isolation and prior-day exclusion, payment mix with refunds and change, service-vs-product allocation reconciling with net sales, technician completed orders/lines/labour, stock valuation at a stated date, end-of-day figures and void reasons, Cashier own-outlet read + audited cross-outlet denial, Mechanic denial, CSV BOM/Bahasa header/integer values, ledger CSV `+07:00`, formula guard, export denial and audit, audit filters, Owner-only audit, end-to-end append-only rejection, Owner-only settings with before/after audit and unchanged order snapshot, branding audit, and the NFR-013 performance fixture |
| Report recomputation | **PASS** — fixtures: 3 paid orders, 1 voided paid, 1 completed unpaid, 1 draft on 2026-11-27; gross 500000, discounts 30000, tax 29700, net 499700; cash payments 424700 − refunds 75000 = expected cash 349700; product 349750 + service 149950 = 499700; technician 3 orders/3 lines/199950 labour; stock valuation 19×150000 + 5×50000 + 1×10000 = 3110000 |
| Report performance (NFR-013 / acceptance 4) | **PASS (measured)** — 1,000 orders × 100 lines = 100,000 lines over 365 days, 20,000 vehicles, 1 product/outlet: p95 daily sales 13.7 ms, payment mix 38.6 ms, service-vs-product 299.0 ms, technician 365.3 ms, stock valuation 9.9 ms, end-of-day 44.0 ms (threshold 10,000 ms). The fixture is inside the integration test and prints these values |
| `npm run test:e2e:web` | **PASS** — full Chromium suite 60 tests (WP4/WP5/WP6/WP7 53 + WP8 5 reports/settings/permissions + 2 axe); CSV download content asserted (BOM, Bahasa header, `Kas diharapkan`), settings success and audit filter, Cashier/Admin 403 on audit/settings/export APIs and pages, Cashier report read allowed by the PRD matrix |
| axe (WCAG 2.2 AA) | **PASS** — `@axe-core/playwright` tags `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`, `wcag22aa` on `/login` and every back-office route (`/`, `/orders`, `/catalog`, `/customers`, `/vehicles`, `/inventory`, `/reports`, two report tabs, `/audit`, `/settings`, `/users`, `/outlets`): zero violations. The sweep fixed one WP5 vehicle-link accessible-name mismatch (`Lihat kendaraan X` → `Lihat N kendaraan X`) |
| Input/select contrast (carry-over) | **PASS** — default border `#C9D0CB` on `#FFFFFF` = **1.57:1**; the shared `Input`/`Textarea`, `.bo-select`, and `.wp3-input`/`.wp3-select` now use `#7C8A83` = **3.61:1** (WCAG 2.2 AA 1.4.11 minimum 3:1). Hover remains `#7C8A83`; invalid keeps the danger border with a 1 px outline |
| License report | **PASS** — `bash scripts/license-report.sh` reports no disallowed runtime license. `@axe-core/playwright` 4.14.1 and its `axe-core` tree are dev-only MPL-2.0 REVIEW; `@csstools/color-helpers` MIT-0 is recorded; neither ships in the runtime image |
| CI/hooks | **PASS (local evidence)** — `scripts/check.sh` runs license → typecheck → lint → unit → integration → E2E → build; local mode keeps Docker Compose, `WP_CI=1` uses provided `DATABASE_URL`/`INTEGRATION_DATABASE_URL`, creates the `_test` database if missing, and skips Docker only in that explicit mode. `.woodpecker/ci.yml` runs Gitleaks + `npm ci` + browser provisioning + exactly `scripts/check.sh`; `.githooks/pre-commit` scans staged secrets/whitespace and typechecks, `pre-push` runs the gate; `scripts/install-hooks.sh` sets `core.hooksPath`. The first remote CI run is **NOT VERIFIED** (no runner attached) |
| Secret scan | **PASS** — `gitleaks dir .` on the source tree after removing gitignored `.next`/`test-results`; no leaks |
| Bahasa Indonesia sweep | **PASS (review)** — every new report/audit/settings string, button, empty/error state, CSV header and validation message is product Bahasa; identifiers, comments, and commit messages remain English |

**Known limits recorded, not silently accepted**

- Daily sales figures count paid, non-void orders by `paid_at`; a paid order voided later is removed from the earlier day's figures and its refund lands on the refund day. This is the PRD's current-data recomputation model, not an immutable daily snapshot; an immutable end-of-day snapshot would need a schema addition (WP2).
- A repeated void reason is stored once per order; the audit log carries the actor and timestamp. The report lists the void's current reason, which is immutable after `VOID`.
- Stock valuation uses the ledger's server-assigned `created_at`. The integration fixture temporarily disables only `stock_ledger_server_created_at` to place historical fixture rows; production rows keep the server timestamp.
- CSV export caps the stock ledger at 100,000 rows with an explicit error. Report exports are bounded by the 366-day request range; a larger ledger export must be split by date/product.
- The audit log is business-wide for the Owner; the UI outlet filter is an optional narrowing control. Admin/Cashier are denied server-side and the denial is audited by the route guard.
- Branding uses the existing `businesses.product_display_name` / `logo_path` columns; logo upload/storage is intentionally absent (a path or `https://` URL only). No schema migration was added.
- Real Android/iOS devices, a thermal printer, APK size, cold start, Firefox, WebKit, screen readers, OS font scaling, and a live CI runner remain **NOT VERIFIED**.

### 7.16 WP8 aggregate gate (2026-11-27, frozen candidate)

`fnm exec --using=26.13.1 -- bash scripts/check.sh` was run once on the final tree after the focused fixes (signed-money rendering, strict audit/export date validation, blank-number settings guard, audit/report filter primitives, audited ledger cross-outlet denial). It exited 0 in 204.70 s (`All gates passed.`). Earlier runs during the same session were discarded because a source file changed while they were running; only this run counts.

| Gate step | Observed result |
|---|---|
| Preflight / Compose database | **PASS** — Docker preflight, development database healthy, `workshop_pos_test` reachable |
| License report | **PASS** — `PASS: no disallowed runtime licenses`; pinned `caniuse-lite` exception unchanged |
| `npm run typecheck` | **PASS** — web, auth, contracts, core, db, design-tokens, mobile; 0 errors |
| `npm run lint` | **PASS** — all seven workspaces; 0 errors/warnings |
| `npm run test:unit` | **PASS** — mobile 72, web 116, auth 208, contracts 77, core 55, db 11, design-tokens 4 (**543 total**) |
| `npm run test:integration` | **PASS** — web 171, auth 41, db 63 (**275 total**) |
| `npm run test:e2e:web` | **PASS** — 60 Chromium tests (2.1 m) |
| `npm run build` | **PASS** — Next.js 16.4.6 production build; `/reports`, `/audit`, `/settings`, the report/audit/settings/export API routes, and the existing order/catalog/customer/mobile-sync routes are dynamic |

**Post-gate edits:** only this §7.16 block and the §7.15 count/status rows (no code, config, test, dependency, or lockfile change after the gate).

**CI-mode status:** `WP_CI=1 DATABASE_URL=… INTEGRATION_DATABASE_URL=… bash scripts/check.sh` was also run on the final tree and exited 0 in 227.13 s (`All gates passed.`), proving the no-Docker, provided-PostgreSQL branch (including the `_test` database readiness check and the E2E CI database allowance). The remote Woodpecker pipeline itself is **NOT VERIFIED** because no runner is attached. The local default (Docker Compose) is the gate reported above.

### 7.17 WP9 focused verification (2026-11-28)

| Check | Result |
|---|---|
| Backup image | **PASS** — `postgres:19-alpine` + OpenSSL 3.5.9-r1 + bash; runs as `postgres`; streaming pipeline writes no plaintext |
| Encrypted backup | **PASS** — `workshop-pos-20261128T035332Z.dump.enc`, 110,928 bytes, 13 s on a loaded host; plaintext sha256 `337e31b8…cd843f`; streaming decrypt/checksum passed; `/backups` contains only mode-600 ciphertext, checksum, and HMAC |
| Ciphertext MAC | **PASS** — HMAC-SHA256 matched (`3ab5cd9c…`); one-byte tamper changed it (`aeccabd5…`) |
| Fail-closed / fail-loud | **PASS** — empty passphrase exits 1 and writes nothing; unreachable DB exits 1 with `backup failed: pg_dump/encrypt pipeline` and 0 "backup ok" lines (review regression fixed) |
| Crash cleanup / healthcheck | **PASS** — startup removes plaintext/partial leftovers; healthcheck exits 0 with a fresh dump |
| Restore + app smoke | **PASS** — decrypt checksum matched; `pg_restore` exit 0 in 2 s; source/restore counts identical (orders 11, lines 20, payments 10, product 1, `user` 5, audit 19, stock ledger 9, customers 1, vehicles 1); health 200 and `/login` 200 against the restored DB; **RTO 6 s** on the drill dataset |
| Compose profiles | **PASS** — default services are `db, web, proxy`; `--profile backup` adds `backup`; rendered passphrase is empty until supplied |
| Gitleaks history | **PASS** — `gitleaks git --redact -v .` exit 0 |
| Gitleaks working tree | **PASS after disposition** — first run found 8 generated-cache hits under gitignored `apps/web/.next/dev`; cache deleted, final run exit 0 (27.08 MB, no leaks) |
| License re-audit | **PASS** — `scripts/license-report.sh` exit 0, `PASS: no disallowed runtime licenses`; no dependency added by WP9 |
| `npm ls --all` | **PASS** — exit 0; only optional-peer notices |
| `npm audit --omit=dev` | **24 moderate, recorded** — dev/build tooling (`drizzle-kit` esbuild, Jest glob/minimatch, Expo CLI fingerprint); no server-runtime path; forced fix would break majors and is out of WP9 |
| WCAG 2.2 AA axe sweep | **PASS** — 2 tests / 27.9 s; 0 violations on `/login` and 13 back-office routes (tags `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`, `wcag22aa`) |
| Keyboard/viewport | **PASS** — 10 auth/home tests / 22.5 s incl. keyboard reachable login with visible focus ring and 320 px no-overflow |
| Contrast | **PASS** — body 16.20:1, secondary 7.02:1, muted 5.07:1, link 7.28:1, white-on-accent 6.10:1, focus 6.10:1, input boundary 3.61:1, status pairs 6.37–8.48:1 |
| Bahasa sweep | **PASS** — targeted English-label scan of user-facing source returned 0 hits; printer strings are Bahasa |
| Mobile tests | **PASS** — 86 tests / 12 suites (14 new: transport + picker states) |
| Android compile | **PASS** — full build 21 m 25 s / 403 tasks, then 32 s incremental after the security fix; `EscposBluetoothModule` in `classes8.dex`; APK declares `BLUETOOTH`, `BLUETOOTH_ADMIN`, `BLUETOOTH_CONNECT` |
| Real printing/TalkBack | **NOT VERIFIED** — no device (`adb devices` empty) and no printer; no emulator used |
| FR-071 buyer branding | **PASS** — settings PATCH 200 is audited and the saved name/logo now render in the expanded sidebar wordmark, the 72 px collapsed rail (logo or up to two initials), the mobile top bar, the home `<h1>` and browser title, and the login card. The branding read needs no `manage_settings`: Cashier and Mechanic see it while `/settings`, `GET /api/v1/settings`, `GET/PATCH /api/v1/settings/branding` stay 403. A protocol-relative logo (`//host/file.png`, admitted by the contract's local-path pattern but neither a local path nor an `https://` URL) is dropped on read, so the wordmark falls back to text/initials instead of fetching a third-party origin. Evidence: 5 Playwright tests (Owner save → shell/home/title/login, role visibility, invalid logo 400 with no write, 80-char name at 1440/1024/768/390/320, no-logo fallback), 9 DOM tests, 2 integration tests (RBAC read, protocol-relative logo) |
| Cross-WP test repair | **PASS (test-only)** — the first gate run exposed a WP4 integration test that hardcoded 2026-11-27 while the server trigger stamps `now()`; the test now derives the WIB day from the stored row. No product code changed |

### 7.18 WP9 aggregate gate (frozen candidate)

Run in a fresh clone at `16bdb3aa09` with `fnm exec --using=26.13.1 -- bash scripts/check.sh`: **exit 0, 256 s, `All gates passed.`**

| Gate step | Observed result |
|---|---|
| Preflight / Compose database | **PASS** — Docker preflight, dev database healthy, `workshop_pos_test` reachable |
| License report | **PASS** — no disallowed runtime license; pinned exceptions unchanged |
| `npm run typecheck` | **PASS** — all seven workspaces; 0 errors |
| `npm run lint` | **PASS** — all seven workspaces; 0 errors/warnings |
| `npm run test:unit` | **PASS** — mobile 86, web 116, auth 208, contracts 77, core 55, db 11, design-tokens 4 (**557 total**) |
| `npm run test:integration` | **PASS** — web 171, auth 41, db 63 (**275 total**) |
| `npm run test:e2e:web` | **PASS** — 60 Chromium tests (2.5 m) |
| `npm run build` | **PASS** — Next.js 16.4.6 production build |

**Cross-WP test repair:** the first gate attempt failed one WP4 integration test because the `stock_ledger_server_created_at` trigger stamps `now()` while the test hardcoded 2026-11-27. The test now derives the Asia/Jakarta day from the stored row; it is a test-only change, and the gate was re-run from the fresh clone. No product code changed.

**CI-mode status:** `WP_CI=1 DATABASE_URL=… INTEGRATION_DATABASE_URL=… bash scripts/check.sh` on the same tree exited 0 in 171 s (`All gates passed.`), exercising the no-Docker, provided-PostgreSQL branch, `_test` readiness, and the E2E CI database allowance. The remote Woodpecker pipeline itself remains **NOT VERIFIED** (no runner attached).

---

### 7.19 FR-071 branding wiring (2026-11-28)

Branch `feat/fr071-branding-wiring`; `fnm exec --using=26.13.1 -- bash scripts/check.sh`: **exit 0, 202 s, `All gates passed.`**

| Gate step | Observed result |
|---|---|
| License report | **PASS** — `PASS: no disallowed runtime licenses.`; no dependency added |
| `npm run typecheck` | **PASS** — all seven workspaces; 0 errors |
| `npm run lint` | **PASS** — all seven workspaces; 0 errors/warnings |
| `npm run test:unit` | **PASS** — mobile 86, web 125, auth 208, contracts 77, core 55, db 11, design-tokens 4 (**566 total**; web gained 9 branding DOM tests) |
| `npm run test:integration` | **PASS** — web 173, auth 41, db 63 (**277 total**; +2 branding tests: RBAC read and protocol-relative logo) |
| `npm run test:e2e:web` | **PASS** — 65 Chromium tests, 2.2 m (5 new FR-071 branding tests) |
| `npm run build` | **PASS** — Next.js 16.4.6 production build |
| `gitleaks dir .` | **PASS after disposition** — first run flagged 21 entries, all inside gitignored `apps/web/.next/**` build caches; caches deleted, rescan of 4.37 MB found no leaks |

**Viewport evidence:** the branding E2E renders an 80-character product name at 1440/1024/768/390/320 with no horizontal overflow, a 72 px collapsed rail that fits the compact mark, and an ellipsized name at 390/320. Logo rendering is asserted against a Playwright-served SVG because no brand asset is shipped; a real buyer logo URL is not part of this evidence.

**Logo origin:** only a same-origin path (`/…`) or an explicit `https://` URL is rendered. The contract's local-path pattern also admits protocol-relative values (`//host/file.png`); those are dropped on read and covered by an integration test.

**Not verified:** mobile/Android branding parity, real-device printing, TalkBack, and the remote CI run remain `NOT VERIFIED`.

---

### 7.20 Mobile router root — real-device navigation (2026-11-28)

Branch `fix/mobile-router-root`; delivery class `standard`; device Infinix X6882 (Hot 50), Android 14, arm64-v8a, `adb devices` state `device`, no emulator started.

| Check | Result |
|---|---|
| Root cause | `@expo/cli` `getRouterDirectory` returns `src/app` whenever that directory exists, checking it before `app`. `apps/mobile/src/app` held only provider/runtime modules, so Expo Router treated them as routes: Metro logged `Using src/app as the root directory for Expo Router` and one `Route "./AuthProvider.tsx" ... missing the required default export` per module, and the device opened `workshoppos:///` as "Unmatched Route". Navigation had never been exercised on a device, so no JS test caught it |
| Fix | `AuthProvider`, `AutoLock`, `RuntimeProvider`, `SaleProvider`, `SessionGate`, `SyncProvider`, and `runtime.ts` moved from `src/app/` to `src/providers/`; every `@/src/app/...` import rewritten in `app/**`, `src/providers/**`, and `tests/**`; `src/app/` removed. No auth, API, money, schema, or UI behavior changed |
| Convention | `apps/mobile/app/**` holds route modules only (all 20 files export a default component); shared providers/runtime live in `src/providers/**`; `src/app` must not exist |
| Regression guard | `apps/mobile/tests/router-root.test.ts` fails if `src/app` is recreated, if a provider module is missing from `src/providers`, or if one reappears under `app/` |
| Mobile tests | **PASS** — 88 tests / 13 suites (86 existing + 2 route-root guard tests) |
| `npm run typecheck` / `npm run lint` (`@workshop-pos/mobile`) | **PASS** — 0 errors, 0 warnings |
| Metro | Clean cache (`.expo` and the Metro cache removed); bundle rebuilt (3859 modules). No `Using src/app as the root directory for Expo Router` line and no `missing the required default export` warning |
| Install | `npx expo run:android --device 13313704BD004233` → `BUILD SUCCESSFUL in 4m 18s`, debug APK installed and launched via `workshoppos://` |
| Cold start | `am force-stop` + `am start` → `Perangkat terkunci` PIN lock screen, no "Unmatched Route" |
| Owner login | Seed Owner (local disposable password provisioned for this run, never committed; API reached over `adb reverse tcp:3000`) → PIN enrollment → Jual shell with `Outlet Pusat`, `Pemilik: Rina Wijaya`, Online chip, `Stok server · 28 Nov 2026 13.45 WIB` after a catalog reload |
| Four tabs | Jual / Pesanan / Stok / Lainnya all render after login |
| Dev-only warning | One `The action 'ROUTE_NAMES_CHANGED' ... was not handled by any navigator` warning is logged during the login transition; React Native marks it development-only and it does not appear in production builds. No functional impact observed and it is unrelated to the route root; left unchanged (auth/navigation behavior is out of scope for this fix) |
| `gitleaks dir .` | **PASS after disposition** — first scan flagged 6 entries, all inside gitignored `apps/web/.next/dev` caches; caches deleted, rescan of 21.09 MB found no leaks |
| `bash scripts/check.sh` | **PASS** — exit 0, 305 s, `All gates passed.` License report clean, typecheck and lint 0 errors, `test:unit` (mobile 88/13 suites, web 125, auth 208, contracts 77, core 55, db 11, design-tokens 4 = **568**), `test:integration` (web 173, auth 41, db 63 = **277**), `test:e2e:web` (65 Chromium tests), `next build` succeeded. Run as `env -u NODE_ENV … bash scripts/check.sh`: this Orca session exports `NODE_ENV=development`, and `next.config.mjs` loads the root `.env` without overriding it, so a plain `next build` in that shell compiles in development mode and crashes prerendering `/_global-error` (`Cannot read properties of null (reading 'useContext')`). The failure reproduces on pristine `daf1852` and disappears once the inherited variable is unset, so it is a session-environment artifact, not a repo defect or a branch regression; no web file changed |
| Still `NOT VERIFIED` | Real 58/80 mm printing, TalkBack, tablet layout, offline sale/queue flow on the device, and any screen beyond launch, login, and the four-tab switch |

## 8. Approved kickoff decisions

Recorded 2026-11-26 from the product owner. These close the corresponding open questions for implementation; they do not replace legal or tax counsel.

| Topic | Decision | Consequence |
|---|---|---|
| Template treatment | **Clean-room only.** No Ecme source, demo asset, or brand asset is included. Web UI starts from **shadcn/ui (MIT)** components copied into the repo and styled with project tokens | UI follows the documented visual language; no Envato transfer is required |
| Web UI basis | **shadcn/ui (MIT)** + Radix + Tailwind, restyled to the Ecme-inspired tokens | Fast shell without a commercial-template licence; buyer owns the copied component source |
| Buyer model | **Single workshop**, internal use | No multi-tenant SaaS build; one installation serves one business |
| Hosting | **Buyer-operated VPS with Docker Compose** | Buyer owns the database and backups; no vendor processor by default |
| Stack | **Next.js + Expo/React Native + PostgreSQL** | Follow ADR-0001; no Laravel/Flutter rewrite |
| Printer | **Generic ESC/POS now, with pilot**: project-owned Bluetooth SPP transport for 58/80 mm, no Epson SDK; PDF/share fallback | Epson SDK remains `REVIEW` and uninstalled; multi-brand hardware printing is piloted by the buyer (founder decision 2026-11-28) |
| Retention | **10 years, anonymize personal fields on deletion request** | Preserve financial/audit records; counsel still confirms duration |
| Branding | **“Workshop POS” placeholder** until the buyer supplies name/logo | No invented brand assets |
| P1 scope | **Include audited pre-`PAID` payment correction and cycle count** | FR-048 and FR-056 are MVP; QA must map them to their stories |

**Still open before production:** Epson SDK redistribution terms, tax rounding confirmation, privacy notice and retention counsel, and the buyer's support/warranty contract.

## 9. Next actions

1. Obtain buyer counsel review for the privacy notice, retention duration, tax rounding, and any future Epson SDK integration; record the signed outcomes.
2. WP1–WP9 are merged to `main` (WP9 PR #10, `98b17e0`); FR-071 branding wiring is merged as PR #11 (`a7dab6e`); no merge action remains.
3. The buyer must run the hardware pilot on a real Android device and its 58/80 mm printers, repeat TalkBack/touch-target checks, re-measure production-sized RTO, exercise an off-host restore, and attach a monitoring/alert route. No emulator result is accepted.
4. The buyer must repeat the checklist on a clean host and complete the account/domain/credential transfer, signed manifest, and tag. Those items are deliberately not marked complete here.
