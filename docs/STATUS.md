# Delivery Status — Workshop POS

| Field | Value |
|---|---|
| Product | Workshop POS (working name; buyer may rebrand) |
| Phase | WP5 (customers, vehicles, plate history) on the task branch |
| Date | 2026-11-27 |
| Code status | WP1–WP4 are merged to `main` (WP4 as PR #4, `cdf3036`). WP5 is implemented and verified on `feat/wp5-customers-vehicles-history`; focused results are in §7.7 and the aggregate gate result in §7.8. It is not merged. Orders, payments, receipts, reports, and mobile code do not exist yet, so vehicle history is empty in a fresh installation until WP6 writes orders |
| Next gate | WP5 focused checks, review, and aggregate gate (§7.7–§7.8); the founder reviews the diff and merges. WP6 starts from `main` after the merge |
| Source of truth | `docs/product/PRD.md`, `docs/adr/0001-stack-and-architecture.md`, `docs/plan/work-packages.md` |

> **Honesty rule.** This page reports what exists and what has been verified. Documents are not proof that the product works. WP1 commands were executed on 2026-11-26 on branch `feat/wp1-walking-skeleton`, including the aggregate `scripts/check.sh` gate on a fresh development volume, and WP1 was merged to `main` as PR #1 (`a96ffcb`). WP2 (schema, migrations, seed, outlet-scoped query helpers) was merged to `main` as PR #2 (`88252dc`). WP3 (auth, RBAC, users, outlets) passed its focused gates and the aggregate gate, and was merged to `main` as PR #3 (`344de62`). WP4 (web shell, domain core, catalog, inventory) passed its focused checks and the aggregate gate and was merged to `main` as PR #4 (`cdf3036`); earlier tests are re-run by later aggregate gates. Anything not listed in §7 as verified is **NOT VERIFIED** — including WP5 until its gate result is recorded here.

---

## 1. Milestones

| Milestone | Scope | Exit criteria | Status |
|---|---|---|---|
| **M1 — Walking skeleton** | WP1: npm-workspaces monorepo, pinned Node, `.env.example`, Compose dev/prod, Postgres, Dockerfiles, `scripts/check.sh`, license report, health endpoint, minimal page/API | A fresh clone reaches a healthy web + database stack with standard Docker/Node tooling; `scripts/check.sh` exits 0; license report has no blocker | **Verified 2026-11-26 and merged to `main` as PR #1 (`a96ffcb`)** |
| **M2 — MVP** | WP2–WP8: schema/seed, auth/RBAC/outlets, catalog + stock ledger, customers/vehicles/history, mixed orders + payments + receipts, offline mobile POS + sync, reports/audit/export/settings, hardening gate | Every PRD story US-01–US-20 passes its acceptance criteria; offline/conflict, money, stock, and RBAC tests are green; no license blocker; WCAG 2.2 AA checks pass on agreed screens | **In progress** — WP2 merged as PR #2 (`88252dc`); WP3 merged as PR #3 (`344de62`); WP4 merged as PR #4 (`cdf3036`); WP5 on `feat/wp5-customers-vehicles-history` |
| **M3 — Handover-ready** | WP9: accessibility sign-off, backup/restore drill, fresh-clone deployment rehearsal, license re-audit, documentation and credential handover | `docs/ops/handover-checklist.md` is fully checked with captured evidence; restore drill meets RPO/RTO targets; buyer accepts the signed manifest | **Not started** |

---

## 2. Artifact status

| Artifact | Purpose | Status |
|---|---|---|
| `docs/product/PRD.md` | Buyer-facing requirements, 20 testable stories, business rules, NFRs, personal-data inventory | Draft for buyer review |
| `docs/ui/research/kickoff-2026-11-26.md` | Desk research, task flows, heuristics, accessibility risks | Draft; evidence and assumptions separated |
| `docs/marketing/competitors.md` | Cited Indonesian workshop POS landscape and positioning | Draft; vendor claims labeled, gaps marked `NOT VERIFIED` |
| `docs/adr/0001-stack-and-architecture.md` | Stack, data, auth, offline sync, deployment, cost range, rejected alternatives | Proposed |
| `docs/ops/license-inventory.md` | Dependency/license/transferability evidence | Updated through WP4 (`better-auth` 1.7.28, `zod` 4.6.7, `@tanstack/react-table` 9.3.1 + MIT tree; lockfile report re-run in the gate); Epson SDK remains `REVIEW` |
| `docs/product/personal-data.md` | Buyer-as-Controller obligations and engineering controls | Draft; counsel review required |
| `docs/ui/DESIGN.md`, `state-matrix.md`, `tokens.json` | Original clean-room design system shared by web and mobile | Draft for review; WP4 generates `packages/design-tokens` and renders the back-office shell/catalog/inventory; WP5 composes the same shell/components for customers, vehicles, and history |
| `docs/plan/work-packages.md` | WP1–WP9, owned paths, dependencies, acceptance gates, PRD traceability | Proposed |
| `docs/ops/handover-checklist.md` | Seller pre-delivery verification and evidence checklist | Draft; **not executed** |
| `docs/ops/decision-policy.md` | Tier 1/2/3 decision authority for the buyer's team | Draft |
| `README.md`, `AGENTS.md` | Buyer setup guide and engineering rules | README carries the verified setup/gate commands and the WP3 dev-login note; AGENTS.md now records WP1–WP4 as merged, the WP5 branch state, the executable setup/gate commands, and the customer personal-data conventions |
| `.omp/`, `orca.yaml`, `.worktreeinclude` | Optional development aids | Present; may be stripped at handover |

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
| Epson ePOS SDK (via thermal printer wrapper) | **REVIEW — legal decision** | Buyer counsel confirms redistribution terms before the native sink ships; otherwise ship the PDF/browser fallback |
| Docker Desktop | Informational | Production hosts should use Docker Engine on Linux; Desktop licensing is separate |
| Maestro Studio / Cloud | Not included | CLI only, if adopted; do not add commercial tiers to cost assumptions |
| shadcn/ui (web components) | MIT, copied source | Retain the MIT notice in `THIRD_PARTY_NOTICES.md`; listed in the license inventory |
| Inter font | OFL-1.1 | Self-host with the license text; do not imply endorsement |
| IBM Plex Mono font | OFL-1.1 | Self-host with the license text; used only for plates and receipt numerals |
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
| D-9 | Certified printer models | Protocol-generic ESC/POS first; publish a tested-model list after pilot |
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

---

## 6. Risks

| Risk | Impact | Mitigation | Owner |
|---|---|---|---|
| Template licensing mistaken for transferable | Legal claim, forced rework, delivery delay | Clean-room design; license inventory blocker; written buyer acknowledgement | Seller + buyer counsel |
| Offline sync loses or double-books a sale | Wrong stock and money; trust loss | Durable outbox, idempotency keys, server-authoritative stock, conflict UI, fault-injection tests | Engineering |
| Printer SDK terms or hardware incompatibility | Receipts fail at the counter | Sink interface with PDF/browser fallback; pilot a tested printer list | Engineering + buyer |
| Scope grows beyond MVP | Delay and quality dilution | PRD out-of-scope list; change control via decision policy | Buyer product owner |
| Personal-data obligations are underestimated | Regulatory exposure | Data inventory, counsel review, DPA, retention/anonymization tooling | Buyer as Controller |
| Buyer lacks ops capacity for self-hosting | Outages, poor backups | Compose runbook, backup drill, optional managed hosting with DPA | Buyer |
| Dependency license drift | Handover blocker | Lockfile license report in WP1 and WP9; inventory update per dependency | Engineering |

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

The only post-gate edits are this §7.8 block, the §7.7 secret-scan row, and the status fields above (no code, config, test, or dependency changed). WP5 is verified on `feat/wp5-customers-vehicles-history` and is **not merged** to `main`.

---

## 8. Approved kickoff decisions

Recorded 2026-11-26 from the product owner. These close the corresponding open questions for implementation; they do not replace legal or tax counsel.

| Topic | Decision | Consequence |
|---|---|---|
| Template treatment | **Clean-room only.** No Ecme source, demo asset, or brand asset is included. Web UI starts from **shadcn/ui (MIT)** components copied into the repo and styled with project tokens | UI follows the documented visual language; no Envato transfer is required |
| Web UI basis | **shadcn/ui (MIT)** + Radix + Tailwind, restyled to the Ecme-inspired tokens | Fast shell without a commercial-template licence; buyer owns the copied component source |
| Buyer model | **Single workshop**, internal use | No multi-tenant SaaS build; one installation serves one business |
| Hosting | **Buyer-operated VPS with Docker Compose** | Buyer owns the database and backups; no vendor processor by default |
| Stack | **Next.js + Expo/React Native + PostgreSQL** | Follow ADR-0001; no Laravel/Flutter rewrite |
| Printer | **Interface plus pilot**: native ESC/POS only after legal confirmation, with PDF/browser fallback | Epson SDK remains `REVIEW`; fallback ships regardless |
| Retention | **10 years, anonymize personal fields on deletion request** | Preserve financial/audit records; counsel still confirms duration |
| Branding | **“Workshop POS” placeholder** until the buyer supplies name/logo | No invented brand assets |
| P1 scope | **Include audited pre-`PAID` payment correction and cycle count** | FR-048 and FR-056 are MVP; QA must map them to their stories |

**Still open before production:** Epson SDK redistribution terms, tax rounding confirmation, privacy notice and retention counsel, and the buyer's support/warranty contract.

## 9. Next actions

1. Obtain buyer counsel review for the Epson SDK redistribution terms, the privacy notice, retention duration, and tax rounding; record the signed outcomes.
2. WP1 is merged to `main` (PR #1, `a96ffcb`); no merge action remains.
3. WP2 is merged to `main` (PR #2, `88252dc`); WP3 is merged to `main` (PR #3, `344de62`); WP4 (web shell, domain core, catalog, inventory) is merged to `main` (PR #4, `cdf3036`). WP5 (customers, vehicles, plate history) passed focused checks and the aggregate gate on `feat/wp5-customers-vehicles-history` (§7.7–§7.8); the founder reviews and merges, then WP6 starts from `main`.
4. Keep CI workflows and git hooks in WP8; do not add them before then.
