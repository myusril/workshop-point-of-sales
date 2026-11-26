# @workshop-pos/db

Database schema, migrations, seed fixtures, and outlet-scoped query helpers for
Workshop POS. PostgreSQL is the only server state store; this package is the
single source of truth for its shape.

- TypeScript source package, ESM, `.ts` relative imports, no build step.
- Drizzle ORM `0.45.4` + drizzle-kit `0.31.11`.
- Money is integer rupiah in `bigint`-mode columns. Timestamps are UTC
  `timestamptz`.
- `stock_ledger` and `audit_log` are append-only, enforced by grants **and**
  triggers.
- There is no connection at import time and `src/index.ts` has no side effects.

## Setup

From the repository root:

```sh
cp .env.example .env        # local placeholders only; .env is gitignored
npm install
npm run db:migrate          # owner credentials in DATABASE_URL
npm run db:seed             # demo fixtures (synthetic data only)
```

Node 26.13.1 or newer is required: the seed runs `src/seed/run.ts` directly with
native TypeScript type stripping.

### Commands (inside `packages/db`)

| Command | Purpose |
|---|---|
| `npm run db:generate` | Generate a migration from the current schema (`drizzle-kit generate`). |
| `npm run db:migrate` | Apply pending migrations (`drizzle-kit migrate`). |
| `npm run db:seed` | Load the idempotent demo fixtures. |
| `npm run typecheck` | `tsc --noEmit`. |
| `npm run lint` | ESLint flat config (typescript-eslint recommended + strict). |
| `npm run test:unit` | Pure scope unit test. |
| `npm run test:integration` | PostgreSQL integration suites (sequential). |

Integration tests default to
`postgresql://workshop:workshop@127.0.0.1:55432/workshop_pos_test` and honour
`INTEGRATION_DATABASE_URL`. Every integration file refuses any database whose
name does not end in `_test`, then drops and recreates the `public` and
`drizzle` schemas before migrating. Never point that variable at a real
database.

## Role model

| Role | Runs | Privileges |
|---|---|---|
| Database owner (deployment credentials) | Migrations, backups, break-glass fixes | All. Row triggers still block ledger/audit/financial-history mutations. |
| `app_rw` | The running application | Least privilege, table by table, from `0001_append_only_guard`. Never runs migrations. |

A real deployment needs **two** connection strings:

1. An **owner DSN** for `npm run db:migrate` and backups. It is the only role that
   may run DDL, create the role, or disable a trigger in a break-glass window.
2. An **`app_rw` DSN** for the running application. The role is created by
   `0001_append_only_guard`; its password comes from deploy secrets and is never
   written in this repository. The app must connect with this DSN, not the owner
   DSN, or the whole least-privilege matrix above is inert.

Wiring the application DSN into the web/mobile deployment (compose, container
env, secret store) is a **WP3/WP8 deliverable**; this package only creates the
role and grants. Local dev/test connect as the owner and use `SET ROLE app_rw`
to exercise the application policy.

`0002_financial_history_guard` re-checks the role at migrate time: if `app_rw`
exists with `SUPERUSER`, `CREATEROLE`, or `BYPASSRLS`, or owns any public table,
the migration fails loudly instead of leaving a role that can disable the
guards.

Grants are explicit and grouped:

- `SELECT, INSERT, UPDATE`: `businesses`, `outlets`, `products`, `services`,
  `customers`, `vehicles`, `orders`, `payments`, `settings`,
  `idempotency_keys`, `sync_keys`, `user`.
- `SELECT, INSERT, UPDATE, DELETE`: `staff_outlets`, `device_tokens`,
  `login_attempts`, `order_lines`, `session`, `account`, `verification`.
- `SELECT, INSERT` only: `refunds`, `stock_ledger`, `audit_log`,
  `order_status_events`.

**No `ALTER DEFAULT PRIVILEGES` on purpose.** It would silently give future
append-only tables UPDATE/DELETE. Every migration that creates a table must add
its own explicit grants to `app_rw`, and the append-only integration test
asserts, as the owner, that `app_rw` can `SELECT` every table in schema
`public`, that `app_rw` has no `TRUNCATE`, and that the grant set matches the
three groups above exactly.

`payments` deliberately has **no `DELETE`** grant: FR-048 corrects a mis-keyed
pre-`PAID` row in place (method, amount, or reference note), and money on a
`PAID` order is reversed by whole-order void/refund rows, never removed.
`order_lines` keeps `DELETE` because removing a line while the order is editable
is part of FR-044; the `0002` trigger blocks it once the order is
`PAID`/`VOID`.

Accepted on purpose (kept so the schema does not drift into half-RBAC):

- `app_rw` may `UPDATE` `user` including `role`/`businessId`, and may
  `UPDATE`/`DELETE` `login_attempts`. Role and tenant changes are authorized
  server-side by WP8; lockout counters must be mutable for WP3 rate limiting.
- The owner's `TRUNCATE`/`DISABLE TRIGGER` remains the documented break-glass
  bypass. `app_rw` cannot reach it: no `TRUNCATE` grant and no table ownership.
  Any future hardening (separate owner role, ledger row-count canary) is an ops
  decision, not a schema change.

### Break-glass (owner only, documented, audited by policy)

Inside a single transaction, the owner may
`ALTER TABLE public.stock_ledger DISABLE TRIGGER stock_ledger_append_only_guard`,
apply a forward fix, and re-enable it. `TRUNCATE` bypasses row triggers; only the
owner may run it and `app_rw` has no `TRUNCATE` privilege. Test cleanup uses
schema resets behind the `_test` guard, never `TRUNCATE`.

## Migration inventory

| Migration | Contents | Down path / forward fix |
|---|---|---|
| `0000_init` | Enums, all 23 tables, named checks/uniques/indexes/FKs. | Forward-fix only. Destructive changes (drop/rename) ship one release after reads stop using the old shape (ADR-0001 §5.3). To undo wholly, drop the schema objects the file creates; there is no data-safe down script. |
| `0001_append_only_guard` | `app_rw` role (create-if-absent), schema usage, explicit table grants, `prevent_append_only_mutation()` and its two triggers. | Drop both triggers, drop the function, revoke grants. Keeping the role is fine. |
| `0002_financial_history_guard` | `refunds.payment_id NOT NULL`; SHA-256 hex checks (`device_tokens.token_hash`, `idempotency_keys.request_hash`); four stock-ledger entry/source consistency checks; an `app_rw` role-safety assertion; paid/VOID immutability triggers on `orders`, `payments`, `order_lines`; whole-refund match trigger; server-assigned `created_at` triggers on `stock_ledger`, `audit_log`, `order_status_events`. | Drop the seven triggers and five functions, drop each named CHECK, then `ALTER TABLE refunds ALTER COLUMN payment_id DROP NOT NULL;`. Forward-fix only once applied: never edit the file. |
| `0003_payment_move_guard` | Replaces `enforce_paid_payment_immutability()` so an `UPDATE` validates the payment's source (`OLD`) order and any destination (`NEW`) order; a payment can no longer be moved out of a `PAID`/`VOID` order into an editable one. | Re-apply the function body from `0002_financial_history_guard.sql` (the narrower check). No table, grant, or trigger changes. |

`0000` and `0001` are frozen; `0002` was generated from the Drizzle schema diff
and then extended with hand-written policy SQL (trigger bodies, role assertion),
so `drizzle-kit generate` reports no drift against it. `0003` is a hand-written
`--custom` function replacement with no snapshot: it changes behavior, not the
schema. Every trigger is dropped-if-exists before creation, so re-running the
files on a fresh schema is safe. `drizzle-kit migrate` records applied
migrations in `drizzle.__drizzle_migrations`; a second run applies nothing.

Migrations run as the **owner**. `app_rw` is application-only.

## Seed policy

`src/seed/fixtures.ts` holds fixed ids and synthetic values; `seedDatabase`
upserts on primary keys, and inserts the single opening ledger row with
`ON CONFLICT DO NOTHING`. Running the seed twice yields the same fixture counts
and stock-on-hand `20`.

`seedDatabase` refuses to run once the database holds real data: any `orders`
row, or any business other than the seed business, aborts with a clear error
before a single write (inside the same transaction, so there is no partial
seed). The demo seed is for an empty database only; it can never rewrite the
roles, prices, or PII of a live install that happens to contain the fixed ids.

Fixtures: business “Bengkel Contoh Jaya” (Asia/Jakarta), outlet “Outlet Pusat”,
default settings (`tax_rate` 11, cashier cap 0, idle timeout 30, 58 mm, minimum
void reason 10), one staff member per role, product `BRK-001`
“Kampas rem depan” (cost 150000, price 250000, threshold 5) with a
`STOCK_IN` ledger row `0 → 20`, service `SRV-001` “Ganti oli mesin”
(50000, 30 min), customer “Budi Santoso”, and vehicle `B1234XYZ`
(Honda / Beat 110 / 2021 / Hitam / 12450 km).

**No credentials are seeded.** There are no `account` rows, no password hashes,
and no `username` values. WP3 provisions Better Auth credentials for seeded
staff and fills `username`/`displayUsername` through the auth flow. The seed
cannot fabricate a Better Auth hash it cannot verify.

`src/seed/run.ts` loads the repository `.env`, requires `DATABASE_URL`, logs
fixture counts only, closes the pool, and exits non-zero on failure.

## Query helpers

Every helper requires an `OutletScope`
(`{ businessId, outletIds }`) and the uniform predicate
`business_id = :businessId AND outlet_id IN (:outletIds)`. Blank ids and empty
outlet lists throw `ScopeViolationError`; duplicate outlet ids collapse.

Reads: `listProducts`, `listServices`, `listOrders` (status/from/to/limit/offset),
`listStockLedger` (requires a product id), `stockOnHand`, `getSettings`.

Writes:

- `appendStockLedgerEntry` runs in one transaction and proves the product, the
  acting user (`createdBy`), the referenced order line, and the `ORDER` source
  order all belong to the scoped business (orders also to a scoped outlet). The
  row's business/outlet come from the product, never from the caller. It does
  **not** implement stock continuity or per-product serialization: WP4 owns
  `SELECT ... FOR UPDATE`, deriving `quantity_before`, and rejecting stale
  continuity. The database only enforces the entry/source-shape checks.
- `appendAuditEntry` requires the business from the scope, an outlet that
  actually belongs to that business, and an actor that belongs to that
  business. `before`/`after` payloads are made JSON-safe: `bigint` becomes a
  decimal string (never a float) and `Date` becomes ISO-8601. Callers must call
  it **inside the same transaction as the mutation it audits**, otherwise a
  crash can commit the action without its audit row.
- `appendOrderStatusEvent` verifies the order is in the requested outlet scope
  and the actor belongs to the scoped business before inserting the timeline
  row; `created_at` is server-assigned.

Child tables (`order_lines`, `payments`, `refunds`, `order_status_events`) are
scoped **only through their parent order**. There is deliberately no unscoped
child-table helper: later work packages must join through a scope-checked order.

Tenant helpers enforce existence-in-scope, not full business/outlet coherence:
`business_id` columns and child FKs prove the referenced row exists, not that
every FK pair belongs to one tenant. A second tenant reopens that design
(N-4 accepted below).

Scoping is helper-enforced, not row-level security. A second business tenant
would reopen this design (ADR-0001 §1.3 T6, founder decision).

## Naming: Better Auth vs domain tables

Better Auth tables (`user`, `session`, `account`, `verification`) are singular
and use camelCase columns (`emailVerified`, `createdAt`, `userId`,
`activeOutletId`) because the adapter reads those names directly. Domain tables
are snake_case and plural. Do not “normalize” the auth tables: renaming a column
breaks the adapter silently.

## Security notes

**Session tokens.** Better Auth stores the browser session token opaque in
`session.token`; it is not hashed upstream. Compensating controls: the web
cookie is httpOnly/SameSite/Secure, sessions expire (`expiresAt`), idle timeout
comes from outlet settings, and sessions are revoked server-side. Mobile device
tokens are different: `device_tokens.token_hash` stores a SHA-256 hex digest
only, never the raw bearer token, and `0002_financial_history_guard` enforces the
shape (`CHECK (token_hash ~ '^[0-9a-f]{64}$')`). `idempotency_keys.request_hash`
carries the same shape check.

**Better Auth credential columns (WP2 deviation, accepted).**
`account.accessToken`, `account.refreshToken`, `account.idToken`, and
`verification.value` are plain-text Better Auth-owned columns that this package
does not hash. Constraints and controls:

- **Social/OAuth providers stay disabled for the MVP**: email + password only.
  With no OAuth provider configured, the three `account.*Token` columns are
  never populated, so no third-party refresh token is ever stored.
- `verification.value` holds single-use, short-TTL email/login verification
  values (Better Auth sets `expiresAt`; the adapter deletes the row on use).
  Purging expired rows is owned by **WP3/ops**.
- `account.password` stores a Better Auth password hash only; plaintext is never
  written there.

**Financial history is immutable after payment.** `0002_financial_history_guard`
adds row triggers for every role (including the owner):

- `orders`: pre-`PAID` edits stay allowed. A `PAID` order may only transition to
  `VOID` (void timestamp/reason required) and may not change any business or
  money field, `paid_at`, or `created_by` in the same statement. A `VOID` order
  is terminal.
- `payments`: `UPDATE`/`DELETE` rejected while the parent order is `PAID` or
  `VOID`. An `UPDATE` also validates the source (`OLD`) and any destination
  (`NEW`) order, so a payment cannot be moved out of a paid receipt into an
  editable order (`0003_payment_move_guard`). FR-048 corrections happen before
  `PAID`; post-`PAID` money movement is a refund row, not an edit.
- `order_lines`: `INSERT`/`UPDATE`/`DELETE` rejected while the parent order is
  `PAID` or `VOID`, so a paid receipt cannot gain, lose, or reprice a line.

**Refunds are whole-payment only.** `refunds.payment_id` is `NOT NULL` and
unique, and a `BEFORE INSERT` trigger requires the payment to exist, belong to
the same order, and match the refund's `amount` and `method` exactly (BR-008).
Partial or misattributed refunds are rejected at the database.

**Ledger chronology is server-assigned.** `BEFORE INSERT` triggers overwrite
`created_at` with `now()` on `stock_ledger`, `audit_log`, and
`order_status_events`, so a caller-supplied timestamp can never backdate an
entry or sliding retention window.

**Stock ledger entry/source consistency.** Checks tie `entry_type` to
`source_type`: `STOCK_IN`↔`STOCK_IN`; `ADJUSTMENT`→`ADJUSTMENT`/`CYCLE_COUNT`;
`SALE_DECREMENT`/`SALE_REVERSAL`→`ORDER` with a non-null `order_line_id`; and any
`ORDER` source requires a `source_id`. Combined with the partial unique index on
`(order_line_id, entry_type)`, a sale can decrement once and reverse once.

**Login attempts.** `login_attempts` is mutable operational data for WP3 rate
limiting, not a ledger. It stores the normalized identifier and outcome only —
never a password or token. Retention is short and owned by WP3/ops.

**Personal data.** Customer/staff PII lives in `customers`, `vehicles`, `user`,
and `audit_log`. Do not log names, phones, emails, plates, or VINs. Financial and
audit records are preserved per counsel direction (default retention: 10 years
until confirmed); anonymization replaces fields instead of deleting rows.

**Anonymization sentinel convention (FR-027/PD-04).** Replace name and phone
with the fixed Indonesian placeholder (`Pelanggan Anonim` for customers,
`Staf Anonim` for staff, and a fixed sentinel phone) and rewrite email to
`anon+<userId>@example.invalid`. The `.invalid` domain can never deliver mail,
and the user id keeps the unique email constraint collision-free. The
anonymization action itself is written to `audit_log`.

The full erasure/anonymization contract covers every column that can identify a
person, not just name/phone/email:

- `customers.name`, `customers.phone`, **`customers.address`, `customers.notes`**
  (null or sentinel).
- **`vehicles.vin`, `vehicles.notes`** (null); the plate is business-identifying
  vehicle data whose retention follows counsel direction.
- `user.name`, `user.phone`, `user.email`, **`user.username`,
  `user.displayUsername`, `user.image`** (null/sentinel; username uniqueness
  means a sentinel derived from the user id).
- **`session.ipAddress`, `session.userAgent`** (null; sessions are revoked or
  expired in the same operation).
- **`login_attempts.identifier`** (purged, not anonymized — transient).
- **`verification.identifier`, `verification.value`** (purged on expiry —
  transient, WP3/ops).
- **`account.accessToken`, `account.refreshToken`, `account.idToken`** (null;
  no OAuth provider is enabled, so these are normally empty already).

Plate/VIN retention and the full anonymization routine are implemented by WP8 on
this contract; WP3/ops purge the transient tables on a short schedule. The
database provides the columns and the immutability rules, not the erasure job.

## WP3 prerequisites (Better Auth)

- `user.businessId`, `user.role`, and `user.phone` are `NOT NULL`. WP3 must
  supply them through Better Auth database hooks; a credential created without
  them fails at the database.
- The username plugin needs both `username` and `displayUsername`.
- Deactivation is a flag, not a delete: check `deactivatedAt` on every
  authenticated request; anonymization sets `anonymizedAt`.
- **Email + password only for the MVP.** Do not enable social/OAuth providers
  until the `account.*Token` columns are encrypted or hashed and a purge job
  exists; the schema documents them as an accepted deviation, not a green light.

## Rules owned by later work packages

The schema deliberately does not encode these; no further schema change is
expected for them:

- Non-cash payments may not exceed the balance due, and cash change is explicit
  (WP6).
- Discount/subtotal/tax bounds beyond the column checks are computed in
  `packages/core` (WP6).
- Per-outlet order numbering with the receipt prefix is assigned by the order
  service (WP6); the unique `(outlet_id, order_number)` constraint is only the
  backstop.
- In-flight idempotency replay (same `request_hash`, `completedAt` null) is a
  WP6/WP7 convention on `idempotency_keys`.
- Conflict-row materialization for unapplied offline sales lives in WP7 on
  `sync_keys`.
- Free-text and JSONB size caps are **API-layer** (WP4/WP5/WP6/WP8): `notes`,
  `void_reason`, `reference_note`, `refund.reason`, `audit_log.before/after`,
  and `idempotency_keys.response_body` have shape/non-blank checks only in the
  database, deliberately no length limits.

## Accepted limitations (WP2 review)

- **Single-tenant composite-FK limitation.** Foreign keys prove that referenced
  rows exist, not that they belong to the same business/outlet:
  `order_lines.product_id`, `orders.customer_id/vehicle_id`,
  `settings.business_id/outlet_id`, and every `business_id` column can point at
  another tenant's row. With one business per install this is enforced at the
  service seam (scope-checked helpers); a second tenant reopens the design
  (ADR-0001 §1.3 T6) and would add `UNIQUE (id, business_id)` plus composite
  FKs.
- **`app_rw` UPDATE on `user` (including `role`) and UPDATE/DELETE on
  `login_attempts` are intentional.** Authorization is server-side (WP8) and
  WP3 lockout counters must be mutable.
- **Owner `TRUNCATE`/`DISABLE TRIGGER` is the only break-glass bypass**, as
  documented above. `app_rw` holds no `TRUNCATE` grant and owns no table; a
  future dedicated owner role or ledger row-count canary is an ops decision.
- **Credential columns** (`account.*Token`, `verification.value`) are accepted
  deviations with the controls listed under Security notes; OAuth is disabled
  for the MVP.

## Growth notes

- Catalog search is a text scan at pilot volume; the trigger to add a proper
  index/search path is documented in ADR-0001 §1.3 (T1).
- No RLS: helper scoping keeps the query surface small. Adding a second business
  tenant or direct database consumers reopens the design.
- All optional filter helpers cap page size (200) and require a positive limit.

## Tests

```sh
npm run test:unit --workspace @workshop-pos/db
npm run test:integration --workspace @workshop-pos/db
```

Integration suites cover schema constraints (every money column is `bigint`,
plate format/uniqueness, exactly-one order line, tax range,
service-requires-vehicle, SHA-256 hash shapes, stock-ledger entry/source
consistency and non-negativity vs override), paid/VOID financial-history
immutability (orders, payments, order_lines), whole-payment refund matching,
server-assigned ledger chronology, append-only enforcement with owner-verified
grants and no `TRUNCATE`, outlet/business scoping for every write helper
(including JSON-safe bigint/Date audit payloads and order status events),
migrate-twice idempotency, and seed-twice plus seed-guard idempotency. They are
sequential (`fileParallelism: false`) because each file resets the schema.

Unit tests cover scope validation and the exact generated
`business_id = $1 AND outlet_id IN (...)` predicate with its bound parameters,
plus the test-database guard's refusal to echo connection URLs.

## Retention and privacy

- `audit_log` and `stock_ledger` are never rewritten; retention follows the
  financial record policy and counsel sign-off.
- `login_attempts` and `verification` are transient; purge them on a short
  schedule (WP3/ops).
- `device_tokens.revoked_at` preserves revocation history; prune long-revoked
  tokens only with the same policy.
- Backups inherit the retention policy and must be encrypted at rest.
