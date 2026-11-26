# Watchdog — repository hazards

Advisor-only review guidance. It is not product documentation and not a
substitute for the product requirements. These rules exist because this
repository handles money, stock, vehicle identity, and offline sales, where a
plausible-looking change can silently corrupt financial or inventory history.

## How to report a finding

1. Cite the rule ID, file, and line: `blocker: B6 — <path>:<line> — <observed>`.
2. Quote the smallest piece of evidence that proves the violation. For a
   missing constraint, cite the schema/migration file and state what is absent.
3. State the required fix in one sentence. Do not prescribe a large rewrite.
4. Only report what you verified by reading the workspace. If you cannot reach
   the file or the rule needs a running system, report a concern and say what
   is unverified — never a blocker.
5. Do not report formatting, naming, or style preferences as blockers. Those
   belong to the project's lint/format gate.

A finding is a **blocker** when continuing would ship an unrecoverable or
silently wrong behavior: leaked identity/credentials, wrong money, unledgered
stock, dropped offline sales, or an authorization hole. Everything in the
concern list is worth fixing before merge but does not by itself require
stopping the turn.

## Blockers — stop and fix

### B1. Local absolute paths or home directories in tracked files

**Scope:** every tracked file (`**/*`), especially docs, fixtures, configs,
skills, tests, and sample commands. Ignored files are out of scope.

**Violation:** `/Users/<name>`, `/home/<name>`, `C:\Users\<name>`,
`/private/var/...`, `~/...`, `file:///...`, or a machine-specific workspace
path in content that will be cloned by another person or the buyer. Paths in
generated build output are not tracked and are not findings.

**Required:** relative repository paths, documented placeholders such as
`<repo-root>`, or environment references. Documentation must work from a fresh
clone on another machine.

### B2. Internal company or studio names

**Scope:** every tracked file (`**/*`).

**Violation:** the delivering vendor's company name, studio name, internal
project or product codenames, staff handles, internal issue-tracker URLs, or
private team names appearing in source, docs, comments, fixtures, commit-facing
files, or UI copy. The product is delivered as an independent, buyer-owned
codebase; the buyer may rebrand it.

**Required:** product-neutral wording ("the project", "the team"), or the
buyer-facing product name configured in settings. Public upstream dependency
names are not internal names.

### B3. Hardcoded production domains, registries, or credentials

**Scope:** source, configs, Compose files, Dockerfiles, scripts, docs, tests,
fixtures, and CI-adjacent files (`**/*`).

**Violation:** a non-placeholder production hostname, API base URL, private
package-registry URL, SMTP/DB/storage endpoint, certificate, connection string
with an inline password, or any token/key/password literal. Also a test that
contains a credential-shaped literal instead of generating it at runtime.

**Allowed substitutes:** `localhost`, loopback addresses, Docker Compose
service names, RFC 2606/6761 reserved names (`*.example`, `*.test`,
`*.invalid`), documented `<placeholder>` values, and environment-variable
references. Public `registry.npmjs.org` URLs in the lockfile are normal
dependency metadata, not hardcoded infrastructure.

**Required:** runtime configuration through documented environment variables
with safe examples; no secret-scanner allowlist may be added to make a finding
disappear.

### B4. Non-permissive dependency or bundled commercial runtime

**Scope:** `package.json`, `package-lock.json`, Dockerfiles and base images,
mobile native dependencies, vendored binaries/assets, and
`docs/ops/license-inventory.md`.

**Violation:** a runtime or bundled dependency under GPL, AGPL, SSPL, FSL,
BUSL, or a commercial/EULA runtime license; a paid or hosted service the
delivered product cannot run without; a lockfile entry that resolves to such a
package; a Docker base image whose redistribution terms forbid the buyer's
self-hosting; a bundled binary governed by vendor SDK terms that the inventory
marks as unresolved.

**Allowed:** MIT, Apache-2.0, ISC, BSD, PostgreSQL License, OFL for fonts, and
explicitly reviewed permissive licenses. Dev-only tooling still needs an
inventory row (see C3) but is not a runtime blocker unless it ships.

**Required:** remove or replace the dependency, or obtain an explicit recorded
decision that keeps it out of the delivered runtime. Do not "fix" this by
editing the scanner or ignoring the package.

### B5. Floating-point money math

**Scope:** shared domain package, database schema/migrations, API route
handlers, receipt templates, sale/quote calculators on mobile and web
(`packages/core/**`, `packages/db/**`, `apps/web/app/api/**`,
`apps/web/**/receipt*/**`, `apps/mobile/**/sale*/**`, `apps/mobile/**/cart*/**`).

**Violation:** `parseFloat`, `Number(...)` division or multiplication on
amounts, `toFixed` used to round an amount, `* 0.11`, `Math.round` used as an
ad-hoc tax/rounding helper, `decimal`/`numeric` columns that permit a
fractional rupiah scale, `real`/`double precision`/`float` columns, JavaScript
`number` for stored money, locale-formatted strings parsed back into amounts,
or accepting a client-sent total as authoritative.

**Required:** amounts are integers in rupiah from input to storage to output.
Exactly one documented half-up rounding helper in the shared domain package is
used for per-line tax; percentages are integers from 0 to 100; display
formatting happens at the UI edge and is never parsed back. Recompute totals,
discounts, and tax server-side from line data inside the order transaction.

### B6. Stock mutation without a ledger entry

**Scope:** database schema/migrations, domain stock and order code, inventory
and order route handlers, offline sync application
(`packages/db/**`, `packages/core/**/*stock*`, `packages/core/**/*order*`,
`apps/web/app/api/**/inventory/**`, `apps/web/app/api/**/orders/**`,
`apps/mobile/**/sync/**`).

**Violation:** an `UPDATE`/increment/decrement of stock-on-hand that does not
insert an append-only ledger row in the same transaction; a ledger row missing
before/after quantity, actor, reason, or reference; stock changed more than
once for the same order line; decrementing at a point other than the earlier of
`COMPLETED` or `PAID`; a reversal that does not restore exactly the previously
decremented quantity; negative stock without an `OVERRIDE` flag and a reason;
`UPDATE`/`DELETE` against the ledger.

**Required:** every stock change is one transaction containing both the
stock-on-hand update and its ledger row, with the order/line reference. The
ledger is append-only and is the audit source for stock. Offline application
uses the same server path, not a mobile-side stock write.

### B7. Offline queue writes that can be silently dropped

**Scope:** mobile outbox, sync worker, local database, logout/reset flows
(`apps/mobile/**/outbox/**`, `apps/mobile/**/sync/**`,
`apps/mobile/**/*sqlite*`, `apps/mobile/**/logout*`, `apps/mobile/**/settings/**`).

**Violation:** a queue row marked sent or deleted before the server's success
response; sale creation succeeding locally when the outbox insert failed;
enqueue not atomic with the local sale record; a catch block that discards a
failed item and reports success; clearing app data, logout, or cache eviction
that removes unsynced sales without an explicit blocking confirmation; a
terminal conflict dropped instead of surfaced; no persisted idempotency key
before the first send.

**Required:** durable enqueue in the same local transaction as the sale; the
row survives restart; deletion only after an acknowledged server result; every
failure lands in a visible state (`MENUNGGU_SINKRON`, `KONFLIK`, or an explicit
failed state) that requires a user action. No silent loss on any path.

### B8. Auth/RBAC checks bypassed in route handlers

**Scope:** every API route handler and its guard wiring
(`apps/web/app/api/**/route.ts`, auth middleware, scoping query helpers).

**Violation:** a non-health endpoint with no authenticated-session guard; a
guard applied only in a layout or middleware whose matcher excludes the route;
role checks performed only in the UI or client; outlet scope taken from the
request body, query string, or client-selected value instead of the session;
Owner-only actions (paid void, settings, user/role management, audit log, CSV
or personal-data export) without an explicit server-side role check; a
cross-outlet lookup that does not include the outlet/business predicate.

**Required:** every endpoint resolves actor, role, and outlet scope server-side
before touching data, and outlet-scoped queries carry the predicate from the
session. Denied attempts are audited. Hiding a control in the UI is cosmetic
and never counts as enforcement.

### B9. Plate-number uniqueness enforced only client-side

**Scope:** database schema/migrations, vehicle intake and lookup handlers,
normalization helper, mobile intake
(`packages/db/**`, `packages/core/**/*plate*`,
`apps/web/app/api/**/vehicles/**`, `apps/mobile/**/vehicle*/**`).

**Violation:** no database unique constraint on the normalized plate within the
business; uniqueness checked by a pre-insert `SELECT` only; server inserts or
searches without normalizing first; case- or whitespace-sensitive comparison;
a duplicate vehicle created for `b 1234 xyz` and `B1234XYZ`; client-side
normalization treated as the sole guarantee.

**Required:** normalize on the server for every create, lookup, and search;
store the normalized form; a unique constraint (business + normalized plate)
makes duplicate races impossible; a unique violation resolves to the existing
vehicle, not a second record. Normalization is idempotent.

### B10. Secrets in logs

**Scope:** logging, error handling, request instrumentation, audit code, and
mobile crash reporting (`**/*.ts`, `**/*.tsx`, `**/*.js` excluding generated
output; also Docker/Compose logging configuration).

**Violation:** logging or serializing passwords, password hashes, session
tokens, bearer tokens, cookies, API keys, connection strings, private keys, or
full request bodies/headers; logging a full error object that may contain such
values; shipping customer phone numbers, addresses, plate numbers, or free-text
notes to third-party telemetry. Session and device tokens are stored hashed at
rest and are never written to logs, error output, or any response other than
their one-time issuance.

**Required:** log identifiers (user ID, order ID, request ID) and outcomes, not
credential or personal-data values; use a redacting serializer; never log an
entire auth request. Test fixtures assemble credential-shaped values at runtime
rather than committing them.

## Concerns — raise before merge

### C1. Missing audit entry for void, refund, or price change

**Scope:** order void/refund handlers, product/service price and cost updates,
settings changes, role changes, discount-above-cap approvals, negative-stock
overrides, exports, and personal-data anonymization
(`apps/web/app/api/**`, `packages/db/**`).

Every such action needs an append-only audit entry written in the same
transaction as the change: actor, action, target, timestamp, reason where
required, and before/after values. Paid-order void also needs per-method refund
rows that fully reverse the payments; no partial refund path may appear. A
missing audit entry is a concern unless the change also violates B6 (stock) or
B8 (authorization).

### C2. UI states missing offline or error handling

**Scope:** screens and components that read or mutate data
(`apps/web/app/**/page.tsx`, `apps/web/app/**/*client*.tsx`,
`apps/mobile/app/**/*.tsx`, `apps/mobile/**/components/**`).

Flag screens that assume a happy online response: no loading state on a
blocking action, no empty state, no user-visible error with a retry path, no
offline state where the action requires the server, double-submit not
prevented, printer failure without the browser-print fallback, or a destructive
action without confirmation. For offline-capable sale screens, provisional
stock must be visibly provisional and the sync state must be visible.

### C3. New dependency without a license-inventory entry

**Scope:** `package.json`, `package-lock.json`, Dockerfiles, native mobile
dependencies, and `docs/ops/license-inventory.md`.

Any added or upgraded direct dependency needs an inventory row with name,
pinned version, SPDX license, purpose, tier (runtime/dev/external/asset),
buyer-transferable verdict, evidence URL, and verification date. A transitive
lockfile addition also needs review when it introduces a new license family.
Missing inventory is a concern; a copyleft or commercial license is B4.

## Fast checks

Run these against tracked files only; generated output and ignored directories
are out of scope. Adjust path arguments once the workspace layout exists.

```sh
git ls-files -z | xargs -0 rg -n '/Users/|/home/|C:\\\\Users|file:///|~/'
git ls-files -z | xargs -0 rg -n 'parseFloat|toFixed|parseInt\([^)]*\)\s*/\s*100'
git ls-files -z | xargs -0 rg -n 'console\.(log|error)\(.*(password|token|authorization|cookie)'
rg -n 'license' package.json package-lock.json docs/ops/license-inventory.md
```

The checks are aids, not the rule. A violation found by reading the code counts
even when no pattern matches, and a pattern match in a test fixture, comment
explaining a prohibition, or documentation example is not a violation by
itself — verify context before reporting.

## Not this repository's concern

- Framework-specific style preferences, file naming, import ordering, and test
  framework choice: the project's lint/format/typecheck gates own those.
- Product scope changes: raise as a concern only when the change contradicts a
  stated requirement; do not block on missing features that are explicitly out
  of scope.
- Performance tuning without a demonstrated regression: comment, do not block.
