# AGENTS.md — Engineering Guide

> **Repository state: WP1–WP6.1 merged on `main`.** WP1 (walking skeleton/tooling, PR #1), WP2 (schema/migrations/seed, PR #2), WP3 (auth/RBAC/users/outlets, PR #3), WP4 (web shell, domain core, catalog, inventory, PR #4 `cdf3036`), WP5 (customers, vehicles, plate history, PR #5 `8a2a550`), WP6 (orders, pricing, payments, receipts, PR #6 `9f2fc8f`), and WP6.1 (server offline-sync seam, PR #7 `c8a38ec`) are merged. WP7 (mobile offline POS) is implemented on `feat/wp7-mobile-offline-pos`: Expo app, SQLite outbox, idempotent sync, conflict decisions, receipt share/PDF with a thermal transport seam. CI workflows and git hooks are intentionally absent until WP8 — `scripts/check.sh` is the only aggregate gate. Every command below is executable against this tree; only results recorded in `docs/STATUS.md` §7 count as verified.

## Product and stack

**Workshop POS** — a point-of-sale system for vehicle workshops (bengkel) in Indonesia.

- Web back-office (management console) + Android-first mobile app (counter/bay tool).
- One transaction mixes spare parts and labor; split payments; one receipt.
- Vehicles are keyed by a **normalized plate number** (+ brand/model) with full service history per plate.
- Mobile is offline-capable: sales queue locally, sync idempotently, server stock is authoritative, conflicts are surfaced.
- Self-hosted with Docker Compose; no mandatory paid SaaS.

| Layer | Choice |
|---|---|
| Repository | npm workspaces monorepo, single lockfile |
| Web + API | Next.js 16 App Router; REST route handlers under `/api/v1/...`; shadcn/ui (MIT) components copied into `apps/web/components/ui` |
| Mobile | Expo 58 / React Native 0.88, expo-router, SQLite outbox, SecureStore bearer token |
| Data | PostgreSQL + Drizzle ORM; integer-IDR money; append-only stock ledger and audit log |
| Contracts | Zod schemas in `packages/contracts`, shared by web, mobile, and tests |
| Auth | Better Auth — httpOnly cookie (web), hashed bearer token (mobile) |
| Deployment | Docker Compose (`web`, `db`, `proxy`/Caddy, optional `backup`) |

Normative references: `docs/product/PRD.md` (requirements), `docs/adr/0001-stack-and-architecture.md` (architecture), `docs/ui/DESIGN.md` (design system), `docs/plan/work-packages.md` (file ownership).

## Setup commands (executable from this tree)

```sh
cp .env.example .env        # placeholders only; .env is gitignored and never committed
npm ci
docker compose -f compose.dev.yaml up -d
npm run db:migrate
npm run db:seed
npm run dev
```

`.env.example` is the only tracked env file; every value in it is a placeholder with a comment. Create real values locally from it — never commit real credentials, and never invent a second convention for configuration. Node is pinned by `.node-version` (`26.13.1`); run commands through the matching engine (for example `fnm exec --using=26.13.1 npm ci`) so installs and gates use it.

## Test and gate commands (executable from this tree)

```sh
npm run typecheck
npm run lint
npm run test:unit
npm run test:integration     # Compose test DB (workshop_pos_test); refuses any name without the _test suffix
npm run test:e2e:web         # Playwright; resets the disposable dev DB (loopback:55432/workshop_pos only)
npm run build
bash scripts/check.sh        # aggregate gate: typecheck → lint → test:unit → test:integration → test:e2e:web → build, in that order

# Mobile workspace (included by the root typecheck/lint/test:unit workspace runs)
npm run typecheck --workspace @workshop-pos/mobile
npm run lint --workspace @workshop-pos/mobile
npm run test:unit --workspace @workshop-pos/mobile     # Jest + RNTL, no emulator or Docker
EXPO_PUBLIC_API_URL=http://<LAN-IP>:3000 npm run start --workspace @workshop-pos/mobile
adb devices                                             # proceed only for a real device in "device" state
npx expo run:android --device                           # never boot or use an emulator/AVD
```

- Runner parity: automation must run exactly these commands in this order. Nothing may pass locally and fail elsewhere.
- **No emulator testing.** Never create, boot, or use an Android emulator/AVD for testing. Run `adb devices`; only a real device in `device` state may be used. If no real device is connected, skip device-only checks and report `NOT VERIFIED` with the reason; never substitute emulator results.
- **CI workflows and git hooks are intentionally not part of this kickoff.** They land later as a gate inside WP8. Until then `scripts/check.sh` is the only aggregate gate. Never weaken it: no skipped steps, no `--no-verify`, no loosening of gates to make a change pass.

## Repository conventions

- **TypeScript strict.** No `any` escapes in domain or API code; contracts are Zod-first — validate at the boundary, then trust the types.
- **Money: no floating point, ever.** All amounts are integer rupiah (`bigint`-mode columns). Rounding is half-up, implemented once in `packages/core` and unit-tested against the PRD worked example (AC3.1). No floats in the money path, in APIs, or in CSV exports.
- **Payment rows carry applied money.** `payments.amount` is what reduced the balance (never the cash tendered); a cash overpayment stores the returned difference in `change_amount`. A whole-order void refunds `amount` per row, so a receipt prints the tendered figure as `amount + change`. Do not reintroduce `amount − change` in paid-total aggregates.
- **Server-authoritative stock.** Devices may propose; only the server ledger decrements stock, inside the order's transaction. Conflicts are surfaced with an explicit user action — never silently resolved. Local stock displays are marked provisional while offline.
- **Idempotency.** Every client-generated transaction carries an idempotency key; a replay returns the original result and creates no duplicate order, payment, or ledger row (double-tap, retry, and offline sync all rely on this).
- **Append-only ledgers.** `stock_ledger` and `audit_log` are append-only: no edit or delete path, enforced by grants and triggers, not just convention.
- **Plate normalization.** Uppercase A–Z/0–9, whitespace stripped, idempotent (`b 1234 xyz` → `B1234XYZ`). Uniqueness is per business, enforced at the database level.
- **RBAC server-side, deny-by-default.** Every non-health endpoint resolves role + outlet scope from the session. The UI hiding a control is cosmetic; the server refusing it is the rule. Cross-outlet access is denied and audited. The PRD Appendix A matrix is encoded as tested constants.
- **Audit sensitive actions.** Voids, overrides, price/cost edits, discount-cap denials, exports, role changes, settings changes: actor + target + timestamp + reason, append-only, visible to Owner.
- **Customer personal data.** List and picker payloads carry a masked phone only (`maskPhone`); the full number appears only on the single-record edit read. Anonymization and personal-data export are Owner-only and audited; anonymized customers keep their financial, vehicle, and audit rows. Audit payloads for these actions record field names and counts, never the erased personal values. No PII in logs, error output, or client error text.
- **UI copy is Bahasa Indonesia**; documentation, code identifiers, and commit messages are English. All UI strings are product strings, not browser/library defaults.
- **One web UI kit.** Compose screens from the copied shadcn/ui components in `apps/web/components/ui/` and the shared tokens. Add a missing primitive there instead of introducing another UI library. Keep the shadcn/ui MIT notice; never add Ecme/ThemeForest source or assets.
- **Mobile session and offline rules.** The bearer token and the staff snapshot live only in SecureStore. A 401 clears the read cache and asks for sign-in but **never deletes paid-but-unsynced sales**; only the explicit destructive sign-out confirmation purges the outbox. Sign-out/expiry make a best-effort server logout and sweep exported receipt files. Outlet switching is blocked while that outlet has pending sales; the queue is scoped per outlet. Outlet policy (tax, paper width, cashier cap, void-reason minimum) is learned from the newest applied order and falls back to the documented server defaults until then. The thermal printer transport is not shipped (Epson SDK is `REVIEW`); receipt share and PDF must keep working without internet. Production builds require an `https://` API URL; plain HTTP is development-only. A scheduled inactivity lock + absolute session expiry guard the shared device.
- **Docs are English** and live under `docs/` per the ownership map below.

## File ownership map (current)

Owned by `docs/plan/work-packages.md`; two work packages never own the same path concurrently. WP1–WP6 rows are delivered and merged; WP6.1 is the active row. Summary:

| Path | Owner (WP) |
|---|---|
| `package.json`, `package-lock.json`, `.node-version`, `.env.example`, `compose.yaml`, `compose.dev.yaml`, `docker/web.Dockerfile`, `scripts/check.sh`, `scripts/db-*.sh`, `scripts/license-report.sh`, `apps/web` skeleton + `/api/v1/health` | WP1 (devops-engineer) |
| `packages/db/` (schema, migrations, seed, query helpers) | WP2 (merged) |
| `packages/auth/`, API + screens for auth/users/outlets | WP3 (merged) |
| `packages/core/src/{money,stock,plate}.ts`, catalog + inventory API/screens, `packages/contracts/src/{catalog,inventory}.ts`; web shell; `apps/web/components/ui/`, `components.json`, `lib/utils.ts`; `packages/design-tokens/` | WP4 (merged) |
| customers/vehicles contracts, API, and screens (composes the WP4 shell) | WP5 (merged) |
| `packages/core/src/{lifecycle,receipt}.ts`, orders/payments/receipts API + screens | WP6 (merged) |
| `packages/contracts/src/sync.ts`, `apps/web/app/api/v1/sync/**`, offline-sale application in `apps/web/lib/order-service.ts` | WP6.1 (active) |
| `apps/mobile/` | WP7 (implemented on `feat/wp7-mobile-offline-pos`) |
| reports/audit/settings/export contracts, API, screens; `.woodpecker/**`, `.githooks/**` | WP8 |
| `docs/ops/backup-runbook.md`, `docs/ops/handover-evidence.md`, `docs/ui/a11y-audit.md`, `THIRD_PARTY_NOTICES.md`, `docker/backup.Dockerfile`, buyer quickstart verification | WP9 |
| `README.md` (this kickoff creates it; WP9 re-verifies the quickstart) | WP9 (revision) |
| `docs/product/**`, `docs/adr/**`, `docs/ops/handover-checklist.md`, `docs/plan/**` | PM / architect / reviewer roles — not an implementation WP |

Need a change in a path you do not own? Ask the owner; do not edit across ownership boundaries.

## Definition of done for any change

1. Focused tests for the changed behavior (unit + integration as appropriate) — green.
2. `npm run typecheck` — green.
3. `npm run lint` — green.
4. `bash scripts/check.sh` (the aggregate gate) — green before hand-off.
5. Never weaken a gate to achieve green: no skipped tests, no `--no-verify`, no loosened rules, no narrowed assertions.
6. **Mobile device checks:** run `adb devices` and use only a real device in `device` state. Never boot an emulator/AVD. If no real device is connected, report device-only checks as `NOT VERIFIED`; unit/RNTL tests still run without a device.
7. Update the affected docs when behavior or commands change; remove obsolete code, comments, and aliases in the same change.

Report only checks you actually ran, with their real output. Unverified claims are fabrication.

## Handover neutrality

Tracked files must be neutral for handover — the buyer's team and any tooling reading the repo see a clean product:

- **Zero local machine paths** (Unix or Windows home-directory paths), machine names, or developer-specific absolute paths.
- **No internal company names, personal domains, internal hostnames, or references to other proprietary repositories.**
- **No private package registries.** Dependencies resolve from the public npm registry; no repository `.npmrc` pointing elsewhere.
- **No secrets in the repo** — no API keys, tokens, passwords, private keys, or credential-shaped strings in code, configs, docs, fixtures, or commit messages. `.env` exists only locally, created from `.env.example` (placeholders). Assemble credential-shaped test strings dynamically at runtime so secret scanners never false-positive.
- **No personal data in fixtures or docs** — seeds and samples are synthetic; example addresses use `example.com`/`example.org`.
- **No fabricated verification.** Never claim a command ran, a test passed, or a number was measured unless it was observed.

### Optional development aids

`.omp/`, `orca.yaml`, and `.worktreeinclude` (and brief/session scratch files) are optional AI-assisted-development aids. Per `docs/ops/handover-checklist.md` §A6/H1 they may be stripped from the final handover commit at the buyer's decision, and `AGENTS.md` itself is inventoried there as strippable tooling. **The product must build and run with none of them present** — no runtime, build, or deployment file may reference them. If you add documentation that mentions them, keep it out of the build path.

## Security and privacy

- **No PII in logs.** Never log passwords, tokens, session IDs, emails, or phone numbers — not in application logs, not in error output, not in CSV exports beyond the minimum required columns. Audit entries store actor IDs, not credentials.
- **No secrets in the repository** (see Handover neutrality). Rotate any credential that ever existed in development before handover.
- **Deny-by-default RBAC** on every non-health endpoint, server-side, with outlet scoping resolved from the session at the data layer — not assembled ad hoc at call sites. Denied attempts are audited.
- **Audit sensitive actions** (voids, stock overrides, price/cost edits, exports, role/settings changes) with actor, target, timestamp, and reason; the audit log is append-only and Owner-visible.
- Validate all external input with Zod contracts before it reaches domain logic; cap and sanitize free-text fields.
- Buyer is Data Controller under UU PDP from handover onward — see `docs/product/personal-data.md` before touching anything that collects or exposes personal data.

## Licensing

- **Permissive only:** MIT, Apache-2.0, ISC, BSD (plus PostgreSQL License / OFL where already inventory-listed). No GPL/AGPL/SSPL/FSL, no commercial runtime dependencies.
- **Any new dependency must be added to `docs/ops/license-inventory.md`** with a verified SPDX identifier, evidence URL, verification date, tier (runtime/dev/external/asset), and transferability verdict — before it is merged.
- **No third-party commercial template source or assets** (e.g., Ecme/ThemeForest items) anywhere in the repository. MIT component source such as shadcn/ui is allowed, must retain its license notice, and must be inventoried.
- **`THIRD_PARTY_NOTICES.md` is shipped at the root** with the shadcn/ui MIT notice and the Inter / IBM Plex Mono OFL notices. It is owned by WP9 and verified in the handover checklist.
- The thermal-printer SDK (Epson ePOS terms) is **REVIEW** until buyer counsel confirms it; keep receipt printing behind the `packages/core` receipt interface with the browser/PDF fallback so a swap stays bounded.
- `scripts/license-report.sh` (WP1) must stay green: it fails the build on any non-permissive runtime license found in the lockfile.
