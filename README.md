# Workshop POS

> **Current status: WP1–WP8 are merged to `main` (WP8 PR #9, `c93acc3`).** That covers the walking skeleton, schema/seed, auth/RBAC/outlets, the web shell + domain core + catalog/inventory, customers/vehicles/history, orders/pricing/payments/receipts, the server offline-sync seam (`POST /api/v1/sync`), the Android-first Expo app with a local outbox and conflict decisions, and reports/CSV export/audit/settings with the CI, hooks, and axe sweep. WP9 (handover evidence, accessibility sign-off, encrypted backup/restore, and generic ESC/POS Bluetooth printing) is implemented on `feat/wp9-handover-a11y-backup` and awaits review. The remote CI run is `NOT VERIFIED` without an attached runner, and real-device/printer verification is `NOT VERIFIED` without hardware.

A point-of-sale system for vehicle workshops (bengkel) in Indonesia.

- **Web back-office + Android-first mobile app.** Dense management console on the web; one-handed selling and bay tool on Android.
- **One transaction mixes spare parts and labor** — a single order prices products and services together, takes split payments (cash / bank transfer / QRIS, recorded manually), and prints one receipt.
- **Plate-keyed vehicle history.** Vehicle identity is a normalized plate number plus brand/model; every visit, part, service, and odometer reading is recorded against that plate for the full service history.
- **Offline-capable mobile.** The counter keeps selling without internet; sales queue locally and sync idempotently later. Server stock is always authoritative; conflicts are surfaced, never silently resolved.
- **Self-hostable.** One host, Docker Compose, PostgreSQL, no mandatory paid SaaS.

Full requirements live in [`docs/product/PRD.md`](docs/product/PRD.md).

## MVP features

| Capability | What it does |
|---|---|
| Auth, roles, outlets | Owner / Admin / Cashier / Mechanic roles, outlet-scoped access, audit log |
| Catalog | Products (SKU, cost, price, stock, low-stock threshold) and services (price, estimated duration) |
| Customers & vehicles | Customer profiles; vehicles keyed by normalized plate, unique per business |
| Mixed transactions | Intake → mixed line items → discount → tax (PPN) → split payment → receipt; whole-order void with mandatory reason |
| Vehicle history | Chronological orders, items, mileage, and payment status per plate |
| Inventory | Append-only stock ledger; decrement on completion; stock-in/adjustment; low-stock list; authorized negative-stock override |
| Reports | Daily sales, payment mix, service vs. product revenue, technician productivity, stock valuation, end-of-day reconciliation; CSV export |
| Mobile offline-first | Locally queued sales, idempotent sync, surfaced conflicts, server-authoritative stock |
| Receipts | 58 mm / 80 mm thermal printing from Android with browser-print fallback; reprint |
| Settings & branding | Tax rate, discount caps, receipt branding, product name/logo configurable by the buyer |

### Out of scope for MVP

Not built now, and not to be built speculatively: full accounting/payroll; supplier purchase orders and accounts payable; payment-gateway integration (payments are recorded manually; QRIS is recorded, not generated); loyalty/CRM/marketing; multi-tenant SaaS; a customer-facing portal or e-commerce; WhatsApp automation; E-Faktur integration; per-payment receipts; partial refunds (voids are whole-order only); barcode/scanner hardware integration; cash-drawer integration; multi-language or multi-currency UI; remote device management. The authoritative list is PRD §2.3.

## Architecture at a glance

| Layer | Choice |
|---|---|
| Repository | npm workspaces monorepo, single lockfile |
| Web | Next.js 16 (App Router) + shadcn/ui (MIT) — back-office UI **and** versioned REST API (`/api/v1/...`) in one app |
| UI kit | shadcn/ui components copied into the repo on Radix + Tailwind, styled from shared design tokens; no commercial template |
| Mobile | Expo 58 / React Native, Android-first, expo-router; SQLite outbox for offline sales |
| Data | PostgreSQL + Drizzle ORM (integer-IDR money columns, append-only stock ledger and audit log) |
| Contracts | Zod schemas shared by web, mobile, and tests |
| Auth | Better Auth — httpOnly cookie sessions on web, hashed bearer tokens on mobile |
| Deployment | Docker Compose (`web`, `db`, `proxy`, optional `backup`) on one host |
| Reverse proxy | Caddy (automatic TLS, security headers) |

Rationale, alternatives, trust boundaries, offline-sync design, and rollback strategy: [`docs/adr/0001-stack-and-architecture.md`](docs/adr/0001-stack-and-architecture.md).

## Repository layout

WP1 created `apps/web/`, `docker/`, `scripts/`, `compose.yaml`, and `compose.dev.yaml`; WP2 added `packages/db/`; WP3 added `packages/auth/` and `packages/contracts/`; WP4 added `packages/core/`, `packages/design-tokens/`, the back-office shell, and catalog/inventory screens; WP5 added customers/vehicles/history; WP6 added orders/payments/receipts; WP6.1 added the sync seam; WP7 added `apps/mobile/`; WP8 added reports/export/audit/settings, `.woodpecker/`, and `.githooks/`.

| Path | Contents |
|---|---|
| `apps/web/` | Next.js App Router back-office UI + REST route handlers |
| `apps/mobile/` | Expo / React Native Android app: SQLite cache + outbox, idempotent sync, conflict decisions, receipt share/PDF with a thermal transport seam |
| `packages/core/` | Pure domain logic: money math, order lifecycle, stock rules, plate normalization — no I/O |
| `packages/db/` | Drizzle schema, migrations, seed fixtures, outlet-scoped query helpers |
| `packages/contracts/` | Zod schemas + TypeScript types for every request/response/event |
| `packages/auth/` | Better Auth configuration, session/bearer issuance, RBAC guard |
| `packages/design-tokens/` | Shared colors, spacing, type scale consumed by web and mobile |
| `docker/` | Production Dockerfiles (web, optional backup sidecar) |
| `compose.yaml` / `compose.dev.yaml` | Production-shape and development Compose stacks |
| `scripts/` | `check.sh` (aggregate gate), license report, DB migrate/seed entrypoints |
| `docs/` | Requirements, ADR, design system, work packages, operations documentation |
| `.env.example` | Documented placeholder configuration (tracked); `.env` is local-only and gitignored |

Exact file ownership per work package: [`docs/plan/work-packages.md`](docs/plan/work-packages.md).

## Prerequisites

- **Node.js 26 LTS** (pinned via `.node-version`) and **npm** with workspaces support
- **Docker Engine + Docker Compose** (v2) for PostgreSQL and the deployment stack
- **Android tooling** for mobile builds: JDK 17 + Android SDK (platform 36, build-tools) and a physical Android 8.0+ device — the app builds locally with `expo prebuild` + Gradle; no paid build service is required. Emulator/AVD testing is not used
- A 58 mm or 80 mm ESC/POS thermal printer and a physical Android device for the printer pilot (buyer-supplied). The shipped build does not include a native printer transport; receipt share and PDF work offline

## Setup

The commands below are implemented by WP1–WP7. Run them under Node 26.13.1 (for example `fnm exec --using=26.13.1 -- npm ci`). The dev database uses disposable local credentials and publishes port **55432**; the integration test database `workshop_pos_test` is created by `docker/initdb/01-test-database.sql` on a fresh volume.

```sh
cp .env.example .env        # placeholders only; .env is gitignored and never committed
npm ci                      # install workspace dependencies from the lockfile
docker compose -f compose.dev.yaml up -d --wait db   # PostgreSQL on 127.0.0.1:55432
npm run db:migrate          # apply the WP2 schema migrations
npm run db:seed             # load synthetic fixtures and one outlet
WP3_TEST_PASSWORD='<generated>' npm run provision:seed --workspace @workshop-pos/auth
npm run dev                 # Next.js on 127.0.0.1:3000; reads the root .env
```

The generated design tokens are committed. After changing `docs/ui/tokens.json`, regenerate them with `npm run build:tokens --workspace @workshop-pos/design-tokens`; the web app imports `@workshop-pos/design-tokens/tokens.css`.

`BETTER_AUTH_SECRET` in `.env` must be at least 32 characters (`openssl rand -base64 32`). It signs session cookies; never commit it. The provisioning command is **local/test seed provisioning only**: it updates credentials for the four synthetic seed accounts (usernames `owner`, `admin`, `cashier`, `mechanic`) using `WP3_TEST_PASSWORD`, prints counts, and never prints passwords. It refuses `NODE_ENV=production` unless `WP3_ALLOW_PROVISION=1` is set explicitly. There is no default password and no public sign-up; **production first-Owner onboarding is not implemented in WP3** and remains an operations/handover task.

To run the whole dev stack in containers instead, use `docker compose -f compose.dev.yaml up -d --build` and open <http://127.0.0.1:3000>. In that mode skip `npm run dev`, because the web container owns port 3000. Both the root `npm run dev` script and Compose-published ports bind to loopback.

WP4 maps the documented token values into shared CSS variables; WP7 does the same for React Native and bundles Inter 400/500/600 and IBM Plex Mono 400 (both OFL) via `@expo-google-fonts`. The OFL notice must remain in the shipped third-party notices.

`.env` is gitignored; only `.env.example` (placeholders + comments) is tracked. Never put real credentials in the repository. `apps/web/next.config.mjs` loads the root `.env` for host-run Next.js commands; Compose-injected variables take precedence.

## Mobile app (Android-first)

The mobile app is a separate Expo workspace (`@workshop-pos/mobile`). It never owns server money or stock: a paid sale is written to SQLite (order + outbox row in one transaction) with a client idempotency key, and the server applies it later. The app needs the web/API process running. Device checks use a real Android device only; emulators/AVDs are never used.

```sh
# 1. Start the API (host or Compose) on port 3000.
npm run dev

# 2. Point the app at the API on the same LAN and install on a real device.
EXPO_PUBLIC_API_URL=http://<LAN-IP>:3000 npm run start --workspace @workshop-pos/mobile
# Then press "a" in the Expo terminal, or with the device connected:
adb devices                                             # must show "device"
npx expo run:android --device                           # real device only
```

Use the host's LAN address (for example `http://192.168.1.20:3000`). The URL is public configuration, not a secret; never put credentials in it. If no real device is connected, device-only checks are `NOT VERIFIED`; never substitute an emulator.

**Production requires HTTPS.** `resolveApiBaseUrl` accepts plain HTTP only in a development build (`__DEV__`); a release build with an `http://` or missing `EXPO_PUBLIC_API_URL` fails closed with a clear message. Terminate TLS at the Caddy proxy (WP1) and point the app at the HTTPS hostname.

First sign-in is online and uses an existing Owner/Admin/Cashier/Mechanic account. The app then asks for a six-digit device PIN and stores the bearer token and staff snapshot in SecureStore. After that the Jual tab works offline:

- Catalog, masked-phone customers, vehicles, and opened vehicle history are cached in SQLite per signed-in outlet.
- Stock from the cache is labelled "Stok sementara"; it is replaced by the server value after a sync refresh.
- A completed sale prints/shares a local receipt stamped `SALINAN LOKAL — BELUM TERSINKRON`; after sync the server invoice number replaces the local reference.
- Queued sales upload in creation order with jittered exponential backoff; a failing sale does not block later ones. `STOCK_INSUFFICIENT`, `PRICE_CHANGED`, `PLATE_REASSIGNED`, and `CASH_REPORTING` are surfaced; only an Admin/Owner can override stock, and a Cashier can void the queued sale with a reason.
- A 401 signs the device out and clears read-only personal data but keeps paid-but-unsynced sales for the next sign-in. Only the explicit destructive sign-out (`Lainnya → Ganti pengguna/keluar`, then the reason screen) deletes the queue.

Mobile commands (included in the root workspace runs):

```sh
npm run typecheck --workspace @workshop-pos/mobile
npm run lint --workspace @workshop-pos/mobile
npm run test:unit --workspace @workshop-pos/mobile     # Jest + React Native Testing Library
npx expo prebuild --platform android                   # generates android/ (gitignored)
npx expo run:android --device                          # real device only; never an emulator
adb devices                                             # proceed only for a device in "device" state
```

Release signing, Play Store packaging, APK size, and cold-start time are buyer/hardware tasks and are **not verified** in this repository. Direct printing uses a project-owned Android Bluetooth SPP module (`apps/mobile/modules/escpos-bluetooth`) that writes ESC/POS bytes to any paired 58 mm or 80 mm printer; no vendor SDK is linked, and the Epson ePOS SDK remains `REVIEW`/not installed. The app still exposes a `PrinterTransport` seam, and share/PDF are the always-available fallback. **Actual printing on hardware is `NOT VERIFIED`** until a pilot with the buyer's printers.

## Quality gate

The npm scripts and aggregate runner exist. The individual steps and the aggregate runner were executed on 2026-11-26; `bash scripts/check.sh` passed on a fresh development volume after review. The aggregate gate starts the dev database with `--wait`, waits for `workshop_pos_test` itself, then runs the steps in order. `scripts/check.sh` fails loudly when Docker is unavailable; it never skips a step.

| Command | Scope |
|---|---|
| `npm run typecheck` | TypeScript strict type checking across all workspaces, including `apps/mobile` |
| `npm run lint` | ESLint flat config: `eslint-config-next` on web (ESLint 10), `eslint-config-expo` on mobile (ESLint 9.39.5) |
| `npm run test:unit` | Unit tests across packages (domain, contracts, RBAC, HTTP) and the mobile Jest/RNTL suite (offline sale, outbox, sync, conflicts, receipts, keypad) |
| `npm run test:integration` | Database integration tests against the Compose test database (web, auth, db) |
| `npm run test:e2e:web` | Playwright Chromium journeys for the back-office and counter flows |
| `npm run build` | Next.js production build with standalone output |
| `bash scripts/check.sh` | **Aggregate gate** — license report, typecheck, lint, unit, integration, E2E, build; Docker preflight (local) or a provided PostgreSQL service (`WP_CI=1`) |

Runner parity rule: automation must run exactly these commands in this order; nothing may pass locally and fail elsewhere. Stop any running `npm run dev` before the aggregate gate; Next.js allows one dev server per project, and the E2E step starts its own on port 3100.

**CI and git hooks run the same gate.** `.woodpecker/ci.yml` runs a Gitleaks secret scan, `npm ci`, Playwright browser provisioning, and exactly `bash scripts/check.sh` with `WP_CI=1` against the pipeline's ephemeral PostgreSQL service; it fails on a red gate, a license blocker, or a secret finding. Locally, install the repository hooks once with `bash scripts/install-hooks.sh` (`git config core.hooksPath .githooks`). `pre-commit` runs a staged secret/whitespace guard plus the workspace typecheck; `pre-push` runs the full aggregate gate. Never use `--no-verify`.

The aggregate gate passed on the frozen candidate. CI's first remote run is **NOT VERIFIED** when no runner is connected; the workflow and `scripts/check.sh` CI mode are provider-neutral.

Observed results and exact counts for each work package are recorded in [`docs/STATUS.md`](docs/STATUS.md) §7; this README does not restate unverified numbers. Real Android devices, a thermal printer, Firefox, WebKit, screen readers, and OS font scaling remain **NOT VERIFIED**.

## Deployment summary

- **Compose services:** `web` (Next.js standalone), `db` (PostgreSQL 19 with a named persistent volume), `proxy` (Caddy 2: TLS, compression, security headers), and an optional `backup` sidecar behind the `backup` profile. No Redis, no mandatory cloud service.
- **Health checks:** `/api/v1/health` (DB roundtrip + migration version) is used by the Compose healthcheck and returns 503 with `database:"down"` when PostgreSQL is unreachable. The proxy waits for a healthy web container.
- **Migrations before app start:** `npm run db:migrate` applies the WP2 Drizzle migrations. The web container does not auto-migrate; run the command (or the release runbook step) before starting a new image. Production data still requires a backup before a migration.
- **Backups:** the optional sidecar takes an encrypted `pg_dump` every 15 minutes (`BACKUP_INTERVAL_SECONDS=900`), verifies the decrypt/checksum round-trip, and prunes after 30 days. Enable it with `docker compose --profile backup up -d` after setting `BACKUP_PASSPHRASE`. The restore, off-host copy, key custody, RPO/RTO targets, and the 2026-11-28 drill record are in [`docs/ops/backup-runbook.md`](docs/ops/backup-runbook.md). Off-host copying and alerting are buyer-owned.
- **Upgrades and rollback:** image tags and the DB-volume snapshot rule are design requirements (ADR §5.3); the backup runbook covers restore and cutover/rollback. A production-sized upgrade rehearsal remains buyer/staging work.

Details: [`docs/adr/0001-stack-and-architecture.md`](docs/adr/0001-stack-and-architecture.md) §3.9 and §5.

## License

- **Original code: MIT** (see [`LICENSE`](LICENSE)).
- **Web UI components: shadcn/ui (MIT)**, copied into the repository and restyled from project tokens; the MIT notice is retained. This is component source, not a commercial admin template.
- **Dependencies: permissive only** — MIT / Apache-2.0 / ISC / BSD (plus PostgreSQL License and OFL for the font). No GPL/AGPL/SSPL/FSL or commercial runtime dependencies.
- **No third-party admin-template source is included.** The Ecme/ThemeForest template referenced in earlier research is commercial and must never appear in this repository; the UI is an original implementation using MIT-licensed shadcn/ui components and project tokens.
- **Thermal printing: project-owned, no vendor SDK.** WP9 adds a small Android Bluetooth SPP module that writes ESC/POS bytes; it links no Epson ePOS SDK and adds no third-party dependency. The candidate `react-native-esc-pos-printer` (which bundles the Epson SDK) remains `REVIEW` and is not installed. Share/PDF are the always-available fallback.
- **Required notices:** [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md) ships the shadcn/ui MIT notice, Lucide ISC/Feather MIT notices, and the Inter and IBM Plex Mono OFL notices.

Evidence, SPDX identifiers, and verification dates: [`docs/ops/license-inventory.md`](docs/ops/license-inventory.md).

## Personal data

From handover onward the **buyer is the Data Controller** under Indonesia's UU PDP; the delivered product bundles no third-party processors. This is an engineering inventory, not legal advice — counsel items are flagged as such. See [`docs/product/personal-data.md`](docs/product/personal-data.md).

## Documentation index

| Document | Purpose |
|---|---|
| [`docs/product/PRD.md`](docs/product/PRD.md) | Requirements: user stories, FR/BR/NFR/PD IDs, scope, open decisions |
| [`docs/adr/0001-stack-and-architecture.md`](docs/adr/0001-stack-and-architecture.md) | Stack, architecture, testing strategy, deployment, rollback |
| [`docs/ui/DESIGN.md`](docs/ui/DESIGN.md) | Design system (tokens, states, accessibility) for web and mobile |
| [`docs/plan/work-packages.md`](docs/plan/work-packages.md) | Work packages WP1–WP9, file ownership, traceability |
| [`docs/product/personal-data.md`](docs/product/personal-data.md) | Personal-data inventory and UU PDP controller note |
| [`docs/ops/handover-checklist.md`](docs/ops/handover-checklist.md) | Pre-delivery verification checklist (draft, not executed) |
| [`docs/ops/license-inventory.md`](docs/ops/license-inventory.md) | Dependency license evidence and blockers |
| [`docs/ops/decision-policy.md`](docs/ops/decision-policy.md) | Tier 1/2/3 decision and approval policy |
| [`docs/ui/research/kickoff-2026-11-26.md`](docs/ui/research/kickoff-2026-11-26.md) | UX research: flows, environment, risks |
| [`docs/STATUS.md`](docs/STATUS.md) | Milestones, artifact status, license/privacy status, risks, open decisions |

## Handover status

**Current status: WP1–WP8 are merged to `main`; WP9 (handover, accessibility sign-off, encrypted backup, generic ESC/POS printing) is implemented on `feat/wp9-handover-a11y-backup` and awaits review/merge.** The web back-office, API, domain core, orders/payments/receipts, mobile offline app, reports/audit/settings, CI, hooks, and encrypted backup sidecar exist and are tested. Hardware printing, real-device accessibility, production-sized restore, remote CI, and buyer-owned account transfer remain `NOT VERIFIED`/buyer work.

| Milestone | Scope | Status |
|---|---|---|
| **M1 — Walking skeleton** (WP1) | Clone-and-run monorepo harness, Compose stack, health endpoint, aggregate gate, license report | **Verified 2026-11-26 and merged to `main` as PR #1 (`a96ffcb`)** |
| **M2 — MVP** (WP2–WP8) | Schema and seed; auth/RBAC/outlets; catalog and inventory ledger; customers, vehicles, plate history; orders, payments, receipts; Android offline app with sync; reports, audit, export, settings, hardening gate | **Complete for WP2–WP8** — WP2 `88252dc`; WP3 `344de62`; WP4 `cdf3036`; WP5 `8a2a550`; WP6 `9f2fc8f`; WP6.1 `c8a38ec` (PR #7); WP7 `589418d` (PR #8); WP8 `c93acc3` (PR #9) |
| **M3 — Handover-ready** (WP9) | Backup restore drill, accessibility sign-off, fresh-clone deployment rehearsal, license re-audit, executed handover checklist and evidence bundle | **In progress** — encrypted backup/restore drill passed; web axe sweep passed; fresh-clone and mobile-device items recorded in `docs/ops/handover-evidence.md`; real-device printing/TalkBack and remote CI remain `NOT VERIFIED` |

Milestone definitions and exit criteria are maintained in [`docs/STATUS.md`](docs/STATUS.md); work-package acceptance criteria in [`docs/plan/work-packages.md`](docs/plan/work-packages.md) define the detailed proof. Handover is executed against [`docs/ops/handover-checklist.md`](docs/ops/handover-checklist.md) on a frozen candidate commit.
