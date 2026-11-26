# Workshop POS

> **Current status: WP1 (walking skeleton), WP2 (database schema, migrations, seed), and WP3 (auth, RBAC, staff, outlets) are merged to `main`.** WP4 (web shell, domain core, catalog, inventory) is on `feat/wp4-web-shell-catalog-inventory` and is not merged. Orders, receipts, reports, and the mobile app have not started, so the capability list below is the product target, not current functionality.

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

WP1 created `apps/web/`, `docker/`, `scripts/`, `compose.yaml`, and `compose.dev.yaml`; WP2 added `packages/db/`; WP3 added `packages/auth/` and `packages/contracts/`; WP4 added `packages/core/`, `packages/design-tokens/`, the back-office shell, and catalog/inventory screens. `apps/mobile/` is created by a later WP.

| Path | Contents |
|---|---|
| `apps/web/` | Next.js App Router back-office UI + REST route handlers |
| `apps/mobile/` | Expo / React Native Android app (offline outbox, sync, printing sink) |
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
- **Android tooling** for mobile builds: JDK + Android SDK — the app builds locally with `expo prebuild` + Gradle; no paid build service is required
- A 58 mm or 80 mm ESC/POS thermal printer and Android 8.0+ devices for counter use (buyer-supplied)

## Setup

The commands below are implemented by WP1–WP4. Run them under Node 26.13.1 (for example `fnm exec --using=26.13.1 -- npm ci`). The dev database uses disposable local credentials and publishes port **55432**; the integration test database `workshop_pos_test` is created by `docker/initdb/01-test-database.sql` on a fresh volume.

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

WP4 maps the documented token values into shared CSS variables and uses the documented font fallback stack; self-hosted Inter / IBM Plex Mono are WP9 work.

`.env` is gitignored; only `.env.example` (placeholders + comments) is tracked. Never put real credentials in the repository. `apps/web/next.config.mjs` loads the root `.env` for host-run Next.js commands; Compose-injected variables take precedence.

## Quality gate

The npm scripts and aggregate runner exist. The individual steps and the aggregate runner were executed on 2026-11-26; `bash scripts/check.sh` passed on a fresh development volume after review. The aggregate gate starts the dev database with `--wait`, waits for `workshop_pos_test` itself, then runs the steps in order. `scripts/check.sh` fails loudly when Docker is unavailable; it never skips a step.

| Command | Scope |
|---|---|
| `npm run typecheck` | TypeScript strict type checking across workspaces |
| `npm run lint` | ESLint 10 flat config (`eslint-config-next`) |
| `npm run test:unit` | Unit tests (health, contracts, RBAC matrix, lockout arithmetic, HTTP guards, loading skeleton) |
| `npm run test:integration` | Database integration test against the Compose test database |
| `npm run test:e2e:web` | Playwright Chromium test for the walking-skeleton page |
| `npm run build` | Next.js production build with standalone output |
| `bash scripts/check.sh` | **Aggregate gate** — all of the above in that exact order, plus Docker preflight and test-DB readiness |

Runner parity rule: automation must run exactly these commands in this order; nothing may pass locally and fail elsewhere. Stop any running `npm run dev` before the aggregate gate; Next.js allows one dev server per project, and the E2E step starts its own on port 3100.

**CI workflows and git hooks are intentionally not part of this kickoff.** They are introduced later as a gate inside WP8; until then `scripts/check.sh` is the only aggregate gate and runs locally. The aggregate gate passed on the frozen candidate.

Verified on 2026-11-26: `npm ci`, typecheck, lint (ESLint 10.15.0), 5 unit tests, 1 integration test against PostgreSQL 19.0, 1 Playwright Chromium test, production build, license report, Compose config parsing, and production-image health checks. Chromium viewports 320, 390, 768, and 1440 px were measured; real devices, Firefox, WebKit, and OS dark mode are **NOT VERIFIED**.

## Deployment summary

- **Compose services:** `web` (Next.js standalone), `db` (PostgreSQL 19 with a named persistent volume), `proxy` (Caddy 2: TLS, compression, security headers). The optional `backup` sidecar exists only as a commented block in `compose.yaml`; scheduled backups are WP9 work. No Redis, no mandatory cloud service.
- **Health checks:** `/api/v1/health` (DB roundtrip + migration version) is used by the Compose healthcheck and returns 503 with `database:"down"` when PostgreSQL is unreachable. The proxy waits for a healthy web container.
- **Migrations before app start:** `npm run db:migrate` applies the WP2 Drizzle migrations. The web container does not auto-migrate; run the command (or the release runbook step) before starting a new image. Production data still requires a backup before a migration.
- **Backups:** planned for WP9 (`pg_dump` schedule, off-host copy, encryption, restore drill); nothing is scheduled yet.
- **Upgrades and rollback:** image tags and the DB-volume snapshot rule are design requirements (ADR §5.3); the upgrade/rollback rehearsal is not yet executed.

Details: [`docs/adr/0001-stack-and-architecture.md`](docs/adr/0001-stack-and-architecture.md) §3.9 and §5.

## License

- **Original code: MIT** (see [`LICENSE`](LICENSE)).
- **Web UI components: shadcn/ui (MIT)**, copied into the repository and restyled from project tokens; the MIT notice is retained. This is component source, not a commercial admin template.
- **Dependencies: permissive only** — MIT / Apache-2.0 / ISC / BSD (plus PostgreSQL License and OFL for the font). No GPL/AGPL/SSPL/FSL or commercial runtime dependencies.
- **No third-party admin-template source is included.** The Ecme/ThemeForest template referenced in earlier research is commercial and must never appear in this repository; the UI is an original implementation using MIT-licensed shadcn/ui components and project tokens.
- **Thermal-printer SDK: REVIEW.** The ESC/POS printing candidate bundles the Epson ePOS SDK, whose redistribution terms require buyer-counsel confirmation before shipping; a browser/PDF fallback exists so this is a bounded swap, not a lock-in.

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

**Current status: WP1, WP2, and WP3 merged to `main`; WP4 on `feat/wp4-web-shell-catalog-inventory`.** Requirements, architecture, design system, work packages, and handover documentation exist. WP1 added the monorepo harness, web skeleton, health endpoint, Compose stacks, license report, and aggregate gate; WP2 added the database schema, migrations, seed, and scoped query helpers; WP3 added auth, RBAC, staff, and outlets; WP4 adds the domain core, design tokens, back-office shell, catalog, and inventory ledger screens. No CI pipeline or git hook exists yet; the mobile app, orders, and reports have not started.

| Milestone | Scope | Status |
|---|---|---|
| **M1 — Walking skeleton** (WP1) | Clone-and-run monorepo harness, Compose stack, health endpoint, aggregate gate, license report | **Verified 2026-11-26 and merged to `main` as PR #1 (`a96ffcb`)** |
| **M2 — MVP** (WP2–WP8) | Schema and seed; auth/RBAC/outlets; catalog and inventory ledger; customers, vehicles, plate history; orders, payments, receipts; Android offline app with sync; reports, audit, export, settings, hardening gate | **In progress** — WP2 merged (PR #2, `88252dc`); WP3 merged (PR #3, `344de62`); WP4 on `feat/wp4-web-shell-catalog-inventory` |
| **M3 — Handover-ready** (WP9) | Backup restore drill, accessibility sign-off, fresh-clone deployment rehearsal, license re-audit, executed handover checklist and evidence bundle | Not started |

Milestone definitions and exit criteria are maintained in [`docs/STATUS.md`](docs/STATUS.md); work-package acceptance criteria in [`docs/plan/work-packages.md`](docs/plan/work-packages.md) define the detailed proof. Handover is executed against [`docs/ops/handover-checklist.md`](docs/ops/handover-checklist.md) on a frozen candidate commit.
