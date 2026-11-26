# ADR 0001 — Stack, Architecture, and Delivery Baseline

| | |
|---|---|
| **Status** | Proposed (awaiting `decision-reviewer` / founder acceptance) |
| **Date** | 2026-11-26 |
| **Supersedes** | Nothing (first ADR) |
| **Related** | `docs/product/PRD.md` (FR/BR/NFR/PD IDs cited below), `docs/ops/license-inventory.md`, `docs/product/personal-data.md` |

---

## Founder Summary

Workshop POS ships as a **single TypeScript monorepo** (one Next.js web back-office that also hosts the API, one Expo/React Native Android app, one PostgreSQL database) deployable on **one host with Docker Compose** — no Redis, no managed cloud, no paid SaaS. Buyer-facing costs are a domain + one small VPS + backups: **≈ IDR 350k–1.4 juta/month** (§3.11). All runtime dependencies are permissively licensed (MIT/Apache-2.0/ISC/BSD; see the license inventory); no founder approval is needed for any dependency listed here, but two items are flagged for attention: the thermal-printer library is a **verified-maintenance candidate, not a lock-in** (§3.7), and self-managed backup DR depends on the buyer actually running restores per NFR-009 (§5).

---

## 1. Context & Constraints

### 1.1 Product drivers (from the PRD)

- One transaction mixes physical products (spare parts) and services (labor): FR-030–FR-043.
- Vehicle identity = normalized plate number, unique per workshop business (BR-006), with full service history per plate (FR-024).
- Mobile is offline-first: sales queue locally, sync idempotently, server stock is authoritative, conflicts are surfaced (FR-041–FR-043, PR-3).
- Money is integer IDR with per-line PPN rounding half-up (BR-001/BR-002/BR-004); PPN default 11%, settable to 0.
- Voids are whole-order only; paid-order void is Owner-only with per-method refund rows (BR-008).
- Roles: Owner / Admin / Cashier / Mechanic with per-outlet scoping (Appendix A, BR-012).
- 58/80 mm ESC/POS thermal receipts from Android with browser-print fallback (FR-040, NFR-004).
- Targets: p95 ≤ 2 s list/detail (NFR-002), Android 8.0+/2 GB RAM, APK ≤ 60 MB (NFR-003), WCAG 2.2 AA web (NFR-005), 99.5% availability (NFR-008), RPO ≤ 15 min / RTO ≤ 2 h (NFR-009, targets), self-hostable with open tooling (NFR-011), one business per installation (NFR-012).

### 1.2 Constraints

- **Fixed stack:** TypeScript monorepo; Next.js web; Expo/React Native mobile; PostgreSQL; Docker Compose self-hosting; no mandatory paid SaaS.
- **Licenses:** MIT, Apache-2.0, ISC, BSD only. No GPL/AGPL/SSPL/FSL or commercial runtime dependencies (NFR-011).
- **Handover economics:** the delivered source is maintained after handover by a **local Indonesian software team that a single workshop can hire**. Every choice must be boring, documentable in Bahasa-Indonesia-friendly plain English, and servable by a mid-level TypeScript engineer without exotic infrastructure.
- **Buyer hardware:** buyer-supplied Android 8.0+ devices and ESC/POS printers (PRD DEP-1); intermittent internet at outlets (DEP-2).
- **Clean-room UI:** no third-party commercial admin-template source or assets (PR-8; the Ecme Next template is not included — see `docs/ops/license-inventory.md` §Ecme).
- **No application code/CI in this kickoff** — this ADR defines the target only; WP1 implements tooling.

### 1.3 MVP scale and evolution triggers

Per NFR-013 (assumed volumes): ≤ 10 outlets, ≤ 50 staff/outlet, ≤ 100k order lines/year/outlet, ≤ 20k vehicles. This is well inside a single PostgreSQL instance and a single Next.js process.

**Measured triggers to re-open this architecture (each is observable in monitoring, not speculative):**

| # | Trigger | Threshold | Action |
|---|---|---|---|
| T1 | p95 API latency on list/report endpoints | > 2 s for 14 consecutive days at assumed volumes (NFR-002) | Add missing indexes / read replica; not a rewrite |
| T2 | DB size | > 200 GB or order lines > 1M/year total | Partition orders/ledger by year |
| T3 | Sync-failure rate | > 5% of queued sales ending in unresolved conflict for 30 days (PRD SM-04 target ≥ 95%) | Review conflict taxonomy before adding features; consider dedicated sync service |
| T4 | Concurrent staff | Sustained > 200 concurrent active sessions | Add second app replica behind reverse proxy (stateless app — safe by design, §3.2) |
| T5 | Attachment storage | > 50 GB on the host volume | Move to S3-compatible object storage (interface already optional, §3.9) |
| T6 | Outlets | > 10 outlets or a second *business* tenant appears | Re-open tenancy: NFR-012 is one-business-per-install by design; a second business requires a new deployment or a formal multi-tenant redesign (Tier 3 founder decision) |

## 2. Decision Drivers Summary

1. **Buyer-maintainable > maximally clever.** A two-skill team (TS + basic Linux/Postgres ops) must run this.
2. **One deployable, boring components** until a measured trigger (§1.3) says otherwise.
3. **Money/stock integrity is the core domain risk**, not scale — the architecture optimizes for correct integer math, append-only ledgers, and idempotent writes.
4. **Offline counter availability** is a product promise (JTBD-5), so the mobile app owns a local durable queue and the server owns truth.

---

## 3. Decision

### 3.1 Monorepo layout (npm workspaces, one lockfile)

```
workshop-pos/
├── apps/
│   ├── web/          # Next.js App Router: back-office UI + versioned REST route handlers
│   └── mobile/       # Expo + React Native (expo-router): cashier/technician app
├── packages/
│   ├── db/           # Drizzle schema, migrations (drizzle-kit), seed, query helpers
│   ├── core/         # Domain logic: money math (BR-001/002/004), order lifecycle (BR-007),
│   │                 #   stock rules (BR-005), plate normalization (BR-006) — pure functions,
│   │                 #   no I/O, shared by web API and mobile offline calculator
│   ├── auth/         # Session, password hashing, RBAC and outlet scoping (Better Auth)
│   ├── contracts/    # Zod schemas + TypeScript types for every REST request/response/event
│   └── design-tokens/# Colors, spacing, type scale shared by web (Tailwind theme) and mobile
├── compose.yaml + compose.dev.yaml + docker/ (prod images and dev stack)
├── docs/
└── package.json (npm workspaces) + package-lock.json (single lockfile)
```

**npm workspaces with one lockfile** is the default. The alternative (pnpm) is faster but adds a second tool to teach a hiring market that mostly knows npm; TypeScript project references + `packages/*` paths give the same strictness without changing the package manager. `packages/core` and `packages/contracts` have **zero runtime dependencies** (only `zod` in contracts) so mobile can import them without dragging server code into the APK.

### 3.2 Web: Next.js App Router + Tailwind + Radix-based own components

- **Next.js App Router** (Server Components by default, `next build` standalone output for the Docker image).
- **Tailwind CSS** for styling; `packages/design-tokens` is the single source of truth (Tailwind theme reads from it; mobile maps tokens to its own theme object — one design language, two renderers).
- **Own UI component layer built on accessible primitives** (Radix UI unstyled primitives + our props/labels in Bahasa Indonesia) — this is how WCAG 2.2 AA (NFR-005) is met without copying any commercial template. **No template code from the Ecme Next item or any ThemeForest product is included**; the visual language is an original clean-room implementation in a similar spirit (PR-8).
- Data fetching in client components uses TanStack Query against the app's own REST API; server components read the DB directly via `packages/db` where simpler.

### 3.3 Mobile: Expo + expo-router + SQLite outbox + TanStack Query

- **Expo SDK / React Native / expo-router**; Android-first (NFR-001/003). EAS not required for handover — the app builds locally with `expo prebuild` + Gradle; EAS is optional.
- **Local persistence:** `expo-sqlite` for (a) the **outbox** of unsent transactions, (b) a read cache of catalog/customers/vehicles for offline intake and vehicle-history viewing (FR-041, AC14.4), (c) the idempotency-key → local-record mapping (BR-011).
- **TanStack Query** for online data; the outbox is *not* Query-managed — it is a dedicated module with its own lifecycle (§3.6).
- APK ≤ 60 MB (NFR-003) is a budget checked in WP acceptance (Hermes + no heavy native deps; the printer candidate is measured against this).

### 3.4 API: versioned REST route handlers + Zod contracts + dual auth

- REST endpoints live in the Next.js app under `/api/v1/...`, implemented as route handlers. **Every request/response body is a schema in `packages/contracts`** (Zod), shared verbatim by web, mobile, and tests — no drift between client and server shapes.
- **Auth per surface:**
  - Web back-office: **httpOnly, SameSite=Lax, Secure cookie session** (Caddy terminates TLS; the app must never see the token in JS).
  - Mobile: **bearer token** (random 256-bit, stored hashed at rest server-side, SHA-256 digest; sent via `Authorization: Bearer`). No webview cookies on mobile.
  - Sessions carry `userId`, `role`, `outletIds[]`, `activeOutletId`. Idle timeout default 30 min, configurable per outlet (AC2.3, NFR-007).
  - **Mobile revocation:** device list per user; Owner/Admin (and the user themselves) can revoke a device; revoked tokens fail on next call and the app clears its outbox-pending state gracefully (queues remain encrypted-on-disk until re-auth). Logout from the app revokes its token.
- Rate limiting on login failures (AC2.2) is implemented **in the app + DB** (attempt counters), not via a Redis quota service — no Redis in the loop for auth.

### 3.5 Data: PostgreSQL + Drizzle + integer money + audit + ledger

- **PostgreSQL** as the only server state store (one instance per deployment).
- **Drizzle ORM + drizzle-kit migrations** in `packages/db`; migrations run as a deployment step (`drizzle-kit migrate` in the entrypoint before app start); every migration is forward-fixable, see rollback (§5.3).
- **Money:** `bigint`-mode integer columns for all amounts (BR-001). Rounding is `Math.round` with half-up semantics implemented **once** in `packages/core` (BR-004) and unit-tested against the PRD worked example (AC3.1: 11% of 270000 → 29700). No floating-point columns in the money path.
- **Time:** timestamps in UTC (`timestamptz`); Asia/Jakarta rendering and business-date assignment (BR-010) live in `packages/core`.
- **Core schema groups:** outlets, users/staff, sessions/devices, products, services, customers, vehicles (unique normalized plate per business, BR-006), orders, order lines, payments, refunds, stock ledger (append-only), audit log (append-only), settings, sync key registry.
- **Append-only guarantees:** no UPDATE/DELETE grants on `stock_ledger` and `audit_log` for the app role; Postgres trigger blocks mutations (defense in depth) — AC20.2/AC12.4 enforceable.
- **Idempotency:** `idempotency_keys` table (key unique per business, stores request hash + resulting order/payment/ledger IDs); replay returns the original result (AC3.6, AC14.3, BR-011).

### 3.6 Offline sync: outbox, idempotency, server-authoritative stock, conflict taxonomy

**Invariants (non-negotiable):**
1. The server's ledger is the only stock authority (PR-3). The device may *propose*.
2. A queued sale is applied **at most once** (BR-011): the client-generated transaction key maps 1:1 to a server result, forever.
3. **No silent loss, no silent mutation.** Money on a synced sale is the price the customer actually paid (AC15.4); conflicts change stock handling only through explicit user action.

**Mechanics:**
- Creating a sale offline: device records the order + client key in SQLite outbox (state: `MENUNGGU_SINKRON`), prints from local data (AC14.1), marks local stock *provisional*.
- Sync (background worker + manual): outbox rows are sent **in deterministic order** (local creation sequence), each as an independent transaction with its idempotency key; exponential backoff with jitter on failure; a failing sale never blocks the others (AC14.5).
- Server application: validate against current server state inside one DB transaction — price is taken from the **local record** (money local-authoritative, AC15.4); stock decrement either succeeds, is rejected for insufficient stock (no override attached), or applied with the override the resolving user later attaches (AC15.2).

**Conflict taxonomy (exhaustive, surfaced in a dedicated sync screen):**

| Code | Situation | Device behavior | Required user action |
|---|---|---|---|
| `STOCK_INSUFFICIENT` | Server stock < queued quantity | Sale marked `KONFLIK` (AC15.1) | Authorized override with reason (Admin/Owner) **or** void with reason (records cash refund row, AC15.3) |
| `PRICE_CHANGED` | Server price differs from price actually paid | None — money stays local (AC15.4) | None automatic; informational only |
| `PLATE_REASSIGNED` | Vehicle re-linked to another customer while offline | Conflicting record flagged | Owner/Admin re-links explicitly |
| `CASH_REPORTING` | End-of-day already closed for the assigned date at sync | Sale flagged in day report reconciliation | Admin/Owner reviews the day report |

Unresolved conflicts are visible with a badge and require explicit resolution (AC15.5) — the sync screen cannot be left with an unacknowledged conflict.

### 3.7 Receipts: ESC/POS candidate + PDF/browser fallback (no unverified lock-in)

- **Candidate (verified-maintenance check as of 2026-11-26):** `react-native-esc-pos-printer@4.6.0` (MIT) — actively maintained (v4.5.1 released 2026-10, 4.6.0 in 2026-11), new-architecture compatible, BLE/LAN/USB/Wi-Fi, wraps the Epson ePOS SDK (`react-native-esc-pos-printer-sdk@2.31.1`, ISC). License implications of the bundled Epson SDK are inventoried in `docs/ops/license-inventory.md` and **flagged REVIEW** (epOS SDK terms are Epson's, not MIT-only).
- **Decision:** implement receipt rendering as a **`packages/core`-owned template** (58/80 mm layouts from the order data model), then two sinks: (a) the ESC/POS library above behind a thin `ReceiptPrinter` interface, (b) **browser print / PDF fallback** (FR-040, AC17.2) that requires no printer library at all. The interface — not the library — is the committed dependency. If the candidate fails pilot acceptance (AC17.1 within NFR-004 p95 ≤ 5 s; tested-model list per PRD D-9), swapping sinks must not touch order data or UI logic.
- Pilot acceptance includes the buyer's actual printer models (DEP-1); a tested-model list is published post-pilot (D-9).

### 3.8 Auth/RBAC: Better Auth (self-hosted) + server-side role/outlet scoping

- **Library:** `better-auth@1.7.x` (MIT) — self-hosted, Drizzle adapter supported, email+password with salted adaptive hashing (scrypt per its defaults; configured to the strongest available), session management, bearer-token support for the mobile surface, plugin model for admin roles. Chosen over hand-rolling because credential handling is high-risk and low-differentiation; chosen over hosted identity because nothing may depend on a mandatory external service (NFR-011).
- **Roles/outlets:** four fixed roles (Appendix A). Authorization is enforced **server-side on every endpoint** via a middleware-style guard resolving role + outlet scope from the session; the UI merely hides what the server denies (AC16.x, NFR-007). Owner/Admin = all outlets (A); Cashier/Mechanic = assigned outlet only (O), cross-outlet requests denied and audited (BR-012, AC16.4).
- **Rate limiting:** login-failure counters in Postgres with the app; 5 consecutive failures lock + backoff (AC2.2), attempts logged **without** the attempted password (PD-02).
- **Passwords:** adaptive salted hash only; plaintext never stored or logged (PD-01/02). Reset tokens stored hashed, single-use, short-lived.

### 3.9 Deployment: Docker Compose, volumes, backups, health checks, no mandatory Redis/cloud

- **Compose services:** `web` (Next.js standalone, runs migrations on start), `db` (PostgreSQL with a named volume), `proxy` (Caddy: automatic TLS, gzip/brotli, security headers), optional `backup` (scheduled `pg_dump` cron sidecar) — **no Redis**; `compose.dev.yaml` adds hot reload and a seeded database.
- **Persistent volumes:** DB data volume; optional `attachments` volume if the buyer enables file attachments; S3-compatible object storage is an **optional** interface (§1.3 T5), not a required component.
- **Backups (NFR-009 targets: RPO ≤ 15 min, RTO ≤ 2 h):** default path is `pg_dump` every 15 minutes to the backup volume + copy off-host (any external disk or the buyer's choice); encrypted at rest (section on key handling in `docs/product/personal-data.md`). pgBackRest (MIT) is the recommended step-up tool if WAL-level granularity is needed; `pg_dump` meets the RPO target at these volumes and is the simpler default. **The restore procedure is documented and rehearsed in WP acceptance; the buyer's ops team owns recurring restore verification.**
- **Health checks:** `/api/v1/health` (DB roundtrip + migration version) wired into Compose healthchecks; proxy waits for healthy web.
- **Upgrade path:** `docker compose pull` new images → Compose runs migration → restart web. **Rollback:** app images are versioned and rollback-compatible one migration behind (§5.3); DB volume snapshot before every upgrade is a required pre-flight.
- **Resource floor:** 2 vCPU / 4 GB RAM VPS (see cost model).

### 3.10 Testing strategy + CI-parity commands (WP1 implements; no CI files in this ADR)

| Layer | Tool | Scope |
|---|---|---|
| Unit (pure domain) | Vitest | `packages/core` money/lifecycle/stock/plate rules vs PRD examples (AC3.1, AC11.x, AC4.4) |
| Contract | Vitest | Zod schemas in `packages/contracts` (round-trip serialization) |
| API integration | Vitest + test Postgres (Compose service) | Route handlers, idempotency replay, concurrency (AC11.5), RLS-style scoping (AC16.4) |
| Web E2E | Playwright | Critical back-office paths, WCAG smoke (axe), CSV export shape (AC19.1) |
| Mobile component | Vitest + @testing-library/react-native | Sale flow, outbox states |
| Mobile E2E (optional, candidate) | Maestro (Apache-2.0 CLI) | Offline sale → sync happy path; device/emulator only |

**CI-parity commands** (single package.json scripts; WP1 wires them into CI):
`npm run typecheck` · `npm run lint` · `npm run test:unit` · `npm run test:integration` (Compose test DB) · `npm run test:e2e:web` · `npm run build` (web + mobile typecheck/build). One runner parity rule: CI runs exactly these commands in this order; nothing CI-only may pass locally and fail remotely.

### 3.11 Hosting cost estimate (IDR/month, labeled range + assumptions)

**Self-hosted baseline (recommended):**

| Item | Assumption | IDR/month |
|---|---|---|
| VPS 2 vCPU / 4 GB / 80 GB SSD (Jakarta region) | 1 deployment, NFR-013 volumes | 300.000 – 700.000 |
| Domain (.com or .id) | 1 domain, yearly amortized | 15.000 – 50.000 |
| Off-host backup storage | 100–200 GB, buyer-owned disk or storage box | 30.000 – 200.000 |
| (Optional) managed snapshot provider | if buyer prefers platform-managed disk snapshots | +0 – 400.000 |
| **Total** | | **≈ 350.000 – 1.400.000/month** (≈ USD 22–90) |

Assumptions: one business ≤ 10 outlets; TLS free via Caddy; no CDN; email/SMS not in MVP (out of scope §2.3); printer + Android devices are buyer hardware (DEP-1), excluded.

**Managed-cloud alternative (same code, `docker compose` on a managed host or a managed Postgres add-on):** +IDR 700.000 – 2.500.000/month depending on provider/region; buys managed backups/monitoring at the cost of (a) higher recurring cost, (b) a **processor relationship requiring a DPA** and cross-border assessment (Tier 3 founder decision — see `docs/product/personal-data.md` §Cross-border). Recommended only if the buyer has no ops capacity; the architecture does not change either way.

---

## 4. Alternatives Considered

### A1 — Laravel (PHP) + Flutter
*Lost because:* splits the stack into two languages (PHP + Dart) — the hiring pool a single workshop can afford must maintain two ecosystems, and the PRD's fixed constraint is a TypeScript monorepo; Flutter's desktop/web back-office story is weaker than React's for WCAG-heavy admin screens; sharing pure domain logic (money math, lifecycle, plate rules) across web/mobile requires duplicating it in Dart. Its maturity (Breeze/Filament) does not offset this for a handover product whose buyer buys TypeScript skills.

### A2 — Next.js API only vs separate NestJS/Fastify service
*Lost because:* a second service doubles deployment surface (two containers, two health checks, two version lines) for zero benefit at NFR-013 volumes; route handlers + Zod contracts give the same typed boundary. **Re-open trigger:** T4 (sustained > 200 concurrent sessions) or a need to run the API on a separate host.

### A3 — Prisma
*Lost because:* heavier engine/tooling and historically weaker fit for the append-only ledger + money-integrity patterns needed here (fine-grained transaction control, partial indexes, triggers); Drizzle's SQL-shaped model keeps ledger/audit guarantees explicit and its migration output reviewable by a general SQL-skilled team. License status verified in the inventory (Drizzle ORM Apache-2.0; Drizzle Kit MIT).

### A4 — Firebase / Supabase (managed BaaS)
*Lost because:* vendor lock-in contradicts the source-code handover (the buyer must own their data path); cross-border data residency and processor dependency trigger UU PDP questions this product should not inherit; managed Postgres Supabase could work technically but adds a mandatory paid dependency risk (NFR-011) unless self-hosted — at which point the Compose baseline is simpler anyway. Re-evaluable only if the buyer explicitly chooses managed hosting (§3.11).

### A5 — GraphQL / tRPC
*Lost because:* for a fixed set of POS flows, versioned REST + Zod contracts is simpler to document, test, and audit per-endpoint (RBAC review is per-route, visible in code review); tRPC would still be reviewed per-route; GraphQL adds a layer of resolver complexity and a second caching model across web/mobile for no measured need.

### A6 — Redux Toolkit (mobile state)
*Lost because:* TanStack Query covers server-state caching with less boilerplate; the offline queue is a purpose-built outbox, not generic client state — adding Redux would give two sources of truth for the same data.

### A7 — Expo IME/native receipt printing only (no ESC/POS library)
*Lost because:* raw Android Bluetooth printing without a maintained wrapper means writing and maintaining an ESC/POS native module forever — the opposite of buyer-maintainable. The wrapper (§3.7) is a verified-maintenance candidate with a fallback, not a lock-in.

### A8 — Serverless-only (Vercel/Cloud Run style)
*Lost because:* long-running migrations, local file backups, and self-hosting-with-Compose are core handover requirements (NFR-011); serverless adds cold-start risk against the 2 s p95 (NFR-002) on low-end buyer networks and hard-couples the buyer to vendor pricing/regions — a mandatory SaaS dependency, out of scope.

### A9 — Microservices (order/inventory/auth split)
*Lost because:* at ≤ 10 outlets there is no scaling pressure (§1.3) to justify network-fragmented consistency for what must be ACID money/stock writes; splitting would *increase* the risk of stock/ledger drift, the exact failure mode the product exists to prevent. Re-open only on T4/T6.

---

## 5. Trust Boundaries, Failure Modes & Rollback

### 5.1 Trust boundaries and isolation

| Boundary | Enforcement |
|---|---|
| Internet ↔ app | Caddy (TLS 1.2+, headers); app validates every request body against `packages/contracts` Zod schemas — no body is trusted unvalidated |
| Anonymous ↔ authenticated | Session/bearer guard on all non-health endpoints; no unauthenticated business route exists |
| Staff ↔ staff (roles) | Server-side RBAC per endpoint (Appendix A); UI hiding is cosmetic only (NFR-007) |
| Outlet ↔ outlet (BR-012) | Every outlet-scoped query carries an outlet predicate resolved from the session, applied at the data layer (`packages/db` query helpers) — not assembled ad hoc at call sites; cross-outlet requests denied + audited (AC16.4) |
| Business ↔ business (NFR-012) | One deployment = one business; a business discriminator column exists in the schema so a future multi-business redesign has a seam, but no cross-business route exists today |
| Client ↔ money/stock | **Server recomputes** totals, tax, discounts from line data inside one transaction; the client-sent total is informational only. Stock decrements occur server-side in the ledger within the order's transaction |
| Device ↔ server (sync) | Idempotency key + server revalidation (§3.6); a device cannot overwrite server state, only propose |

**Input validation boundary:** all external input (HTTP bodies, query params, CSV upload headers, printer strings) passes Zod schemas before reaching domain logic; free-text fields (customer notes, void reasons) are length-capped and logged sanitized (PD-02).

### 5.2 Failure modes

| Failure | Behavior | Recovery |
|---|---|---|
| Sync network drop mid-upload | Outbox row stays `MENUNGGU_SINKRON`; retry with backoff; server idempotency prevents duplicates (AC14.3) | Automatic |
| Server applies sale but response is lost | Retry with same key returns original result (BR-011) | Automatic |
| Double-tap submit | Same client key → one order (AC3.6) + UI disable | Automatic |
| Concurrent completions on last unit | One succeeds; the other gets `STOCK_INSUFFICIENT` (AC11.5) or requires authorized override; ledger never silently negative (BR-005) | Explicit user action |
| Mobile DB corrupted/lost device | Queued sales not yet synced are **lost** — acceptable only because receipts were printed and staff follow-up; the sync screen shows the un-synced backlog before logout, and outbox data survives app restarts | Documented procedure; not silent |
| App crash | Postgres transaction atomicity: order + payment + ledger rows commit or roll back together; no partial order | Automatic |
| App down (99.5% target, NFR-008) | Mobile keeps selling offline (FR-042); web read-only degraded | `docker compose` restart; RTO ≤ 2 h via restore (NFR-009) |
| DB host failure | Restore from backup volume/off-host copy (RPO ≤ 15 min target) | Restore runbook (§3.9) |
| Migration failure mid-deploy | Entrypoint aborts before app start; app stays on prior image | §5.3 |
| Printer unreachable | Error + "Coba lagi"/"Cetak via browser" fallback (AC17.2) | Explicit user action |

### 5.3 Rollback strategy

- **App images:** tag every release; `docker compose` pins image tags; rollback = redeploy previous tag (stateless app, seconds).
- **Schema:** drizzle-kit migrations are **forward-fixable by policy**: every migration ships with a matching down-script or a documented forward-fix (add-column → backfill → switch reads → drop old), so a one-generation rollback is always possible *without data loss*. Destructive migrations (drop/rename) are split into their own release one generation after the read path stops using the old shape.
- **Data:** DB volume snapshot immediately before every upgrade (§3.9); audit log and ledger are append-only so rollback can never lose their history.
- **Config:** settings/tax rate changes are data, not code — existing orders are immutable (BR-002), so a rollback never rewrites financial history.
- **Runtime rollback rehearsal:** part of WP1 acceptance — the upgrade-then-rollback path is exercised once on the delivery environment and documented in the ops runbook.

## 6. Consequences & Ownership

### 6.1 Trade-offs accepted
- **Single Next.js process** hosting UI + API couples their deploys — accepted at this scale; split trigger is T4.
- **No Redis** means rate limiting and any future cache live in Postgres/app memory — fine ≤ 200 sessions (T4).
- **Idempotency via Postgres** adds one write per client transaction — negligible here, and it is the honest cost of BR-011.
- **Printer candidate not locked:** if `react-native-esc-pos-printer` fails pilot, a swap costs a bounded integration task, not a redesign (interface-first, §3.7).
- **Offline loss window:** a device destroyed before sync loses unsent sales — surfaced in the ops runbook; acceptable because receipts print at sale time and staff have a physical artifact.

### 6.2 Dependencies added (all verified MIT/Apache-2.0/ISC/BSD-PostgreSQL — see `docs/ops/license-inventory.md` for versions, evidence URLs, and verification date)

| Dependency | License | Role |
|---|---|---|
| Node.js 26 LTS | MIT (+ permissive vendored) | Runtime |
| Next.js 16 / React 19 | MIT | Web |
| Expo 58 / React Native 0.88 / expo-router 58 | MIT | Mobile |
| TypeScript 7 | Apache-2.0 | Language |
| Tailwind CSS 4 | MIT | Styling |
| Radix UI 1.8 | MIT | Accessible primitives |
| Drizzle ORM 0.45 / Kit 0.31 | Apache-2.0 / MIT | Data |
| Zod 4 | MIT | Contracts |
| TanStack Query 5 / Table 9 | MIT | Data fetching |
| Better Auth 1.7 | MIT | Auth |
| Lucide 1.80 | ISC | Icons |
| Recharts 3 | MIT | Charts |
| Vitest 5 / Playwright 1.65 / RNTL 14 / Maestro | MIT / Apache-2.0 / MIT / Apache-2.0 | Testing |
| Docker Engine / Compose | Apache-2.0 | Deployment |
| Caddy | Apache-2.0 | Reverse proxy |
| PostgreSQL 19 / pgBackRest | PostgreSQL License / MIT | Database / backup |
| react-native-esc-pos-printer 4.6 (+ bundled SDK) | MIT / ISC (**Epson SDK terms → REVIEW flag**) | Receipt printing candidate |
| Inter font | OFL-1.1 | Typography |

### 6.3 Affected work packages (file-disjoint; owned paths are indicative, refined in `docs/plan/work-packages.md`)

| WP | Owner | Owns | Verification evidence |
|---|---|---|---|
| WP1 Tooling & CI-parity | `devops-engineer` | root `package.json` scripts, Compose dev/prod files, Dockerfiles, test DB service, license-report generation, no CI files yet per kickoff | `npm run typecheck/lint/test:*/build` green locally; license report generated |
| WP2 `packages/db` schema + migrations | `backend-engineer` | `packages/db/**` | drizzle-kit generate/migrate on clean DB; seed loads PRD fixtures (AC3.1 values) |
| WP3 `packages/core` domain rules | `backend-engineer` | `packages/core/**` | Vitest green on money/lifecycle/stock/plate tables (BR-001..012) |
| WP4 `packages/contracts` + web API | `backend-engineer` | `packages/contracts/**`, `apps/web/app/api/**` | integration tests incl. idempotency + cross-outlet denial |
| WP5 Web back-office UI | `frontend-developer` | `apps/web/app/**` (non-API), `packages/design-tokens/**` | Playwright green; axe clean on core screens |
| WP6 Mobile app | `mobile-developer` | `apps/mobile/**` | RNTL green; offline-sale → sync flow on emulator |
| WP7 Receipts | `mobile-developer` | `apps/mobile/**/receipts/**`, web print route | AC17.1–17.4 on target printers; fallback verified |
| WP8 Auth + RBAC wiring | `backend-engineer` | auth config + guard middleware | login/rate-limit/session tests; Appendix A denial matrix |
| WP9 Backups/DR runbook + hosting handover | `devops-engineer` | `docker/**`, `docs/ops/**` (backup runbook only) | restore rehearsal timed ≤ RTO target on a scratch host |

### 6.4 Review & escalation
- `decision-reviewer` and the founder should review **§3.7 (printer candidate + Epson SDK terms)** and **§3.11 (hosting model / managed-cloud DPA)** — both are Tier 3 founder-relevant decisions flagged for counsel.
- Everything else here is reversible at the stated triggers (§1.3) with no data-loss risk (§5.3).

---

*Verification date for all versions cited: **2026-11-26**, from npm registry metadata, GitHub repositories, and official project pages (URLs in `docs/ops/license-inventory.md`). No application code, CI pipelines, or git hooks are created by this ADR.*
