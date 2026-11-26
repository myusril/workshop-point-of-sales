---
name: offline-sync
description: "Offline-first sync rules for a point-of-sale app: durable outbox, idempotency keys, optimistic UI boundaries, server-authoritative stock, conflict taxonomy, retry with backoff, and no silent data loss."
---

# Offline sync rules

Use this skill when implementing or reviewing anything that creates a sale
without connectivity, queues work, retries a request, or applies a queued
record on the server. The counter must keep selling during an outage without
ever duplicating a sale, losing a queued sale, or silently changing money or
stock.

## Three invariants

1. A sale is applied **at most once** on the server, no matter how often the
   device retries.
2. A queued sale is **never silently dropped** and never marked successful
   before the server confirms it.
3. Money is authoritative from the record the customer actually paid; stock is
   authoritative from the server. A conflict that would change stock or the
   paid amount is surfaced, never auto-resolved; a catalog price difference is
   informational because the paid price already wins.

Any design that violates one of these is wrong even if the happy path works.

## Durable outbox

- The device owns a durable local outbox. Creating a sale writes the local sale
  record, its line items, its idempotency key, and its outbox row in one local
  transaction. If the enqueue fails, the sale is not reported as saved.
- Each row has an explicit state: pending (`MENUNGGU_SINKRON`), in-flight,
  synced, conflict (`KONFLIK`), or a terminal failure that still requires a
  user action. A row is never deleted merely because a request was attempted.
- Delete or archive a row only after an acknowledged server response for that
  idempotency key. Keep the local sale record available for reprint and audit
  even after sync.
- Rows survive process restart, app upgrade, and logout. Clearing the queue or
  app data requires an explicit blocking confirmation that names the number of
  unsynced sales; it is never part of ordinary sign-out.
- Send in deterministic creation order. Each row is validated independently: a
  failing row does not block the others and does not silently skip ahead in a
  way that reorders dependent operations.
- The outbox is a dedicated module with its own lifecycle, not generic query
  cache state. Cached catalog/vehicle reads are separate and may be evicted
  freely.

## Idempotency keys

- The client generates the key when the sale is created, before the first
  network attempt, and persists it with the sale. Every retry reuses that exact
  key. Never regenerate a key on retry.
- The server stores keys with a uniqueness scope (business plus key), the
  request fingerprint, and the identifiers of the resulting order, payments,
  and ledger rows.
- A replay with the same key returns the original result and creates no second
  order, payment, ledger row, or audit row. The response is identical enough
  that the client can mark the row synced.
- Reusing a key with a different payload is a conflict, not an overwrite. Do
  not "latest wins" a key.
- Apply validation, order creation, payment rows, ledger rows, and the
  idempotency record in one database transaction. A half-applied sale is not a
  valid outcome.

## Optimistic UI boundaries

Present these states differently; do not blur them:

- **Money is local-authoritative.** The price the customer paid on the device
  is the price stored when the sale syncs, even if the server price changed in
  the meantime. Recompute only from the local line data that produced the
  receipt.
- **Stock is server-authoritative.** A local decrement is provisional. Show it
  as provisional, and replace it with the server value after sync. Never let a
  second device inherit the provisional number as truth.
- **The receipt may be printed offline** from local data, but label the sale as
  awaiting sync. The sale is not visible in server reports until it is applied.
- **Actions requiring the server are unavailable offline** (end-of-day report,
  exports, role changes), with a clear message. Cached reads remain available
  and read-only.
- A visible sync state exists on the sale screen and the sync screen: pending,
  syncing, synced, conflict. "Saved" alone is ambiguous and must not be used
  for an unsynced sale.

## Server-side application and stock

- The server applies a queued sale inside one transaction: validate the
  payload, re-check stock, insert the order and payments, insert exactly one
  ledger row per line, and record the idempotency result. Recompute totals from
  the local line prices that produced the receipt, not from the current
  catalog.
- Stock is decremented on the server through the normal order path. The device
  never sends a stock number that the server trusts.
- If server stock is insufficient, do not apply the sale and do not partially
  apply it. Return a structured conflict that includes the product, requested
  quantity, and current server quantity.
- An authorized user may resolve with an override and a reason; the resulting
  ledger row is flagged as an override. Otherwise the sale can be voided with a
  reason, which records the refund and clears the conflict without a stock
  change.
- Money from the local record and stock from the server are deliberately
  different authorities. Do not "fix" a price mismatch by rewriting the paid
  amount, and do not "fix" a stock mismatch by accepting the local count.

## Conflict taxonomy

Surface exactly one of these codes for a queued sale that cannot be applied
automatically, with a user-readable explanation and an explicit resolution
action:

| Code | Condition | Automatic action | Required resolution |
|---|---|---|---|
| `STOCK_INSUFFICIENT` | Server stock is below the queued quantity | Sale stays pending/conflicted; nothing is applied | Admin/Owner override with reason, or void with reason and record the refund |
| `PRICE_CHANGED` | Server price differs from the price paid | Apply the local paid price; flag informationally | None; the paid amount is preserved |
| `PLATE_REASSIGNED` | Vehicle was re-linked to another customer while the device was offline | Keep both records; flag the conflict | Owner/Admin re-links explicitly |
| `CASH_REPORTING` | The business date was closed before this sale synced | Apply the sale; flag it in reconciliation | Admin/Owner reviews the day report |

Transport failures, timeouts, rate limits, and revoked credentials are not
domain conflicts. They are retry or pause states: they must not be presented
as a stock or price problem, and they must not delete the row.

## Retry and backoff

- Retry only retryable failures: network errors, timeouts, 5xx, and 429. Honor
  a server-provided retry delay when present.
- Use exponential backoff with jitter, a bounded maximum delay, and a bounded
  attempt count. Never retry in a tight loop; never retry a 4xx validation
  failure unchanged.
- On authentication or authorization failure, pause the queue and require
  re-authentication. Do not discard queued sales; retain them until the device
  can sync again.
- Background sync must be registered and observable: pending count, oldest
  pending age, last successful sync, and unresolved conflict count. A queue
  that is stuck must be visible to the user and in diagnostics.
- A retry after a lost response must be safe. If the server committed and the
  response was lost, the same key returns the original result; the client then
  marks the row synced rather than creating a second sale.

## No silent data loss

Reject any of these patterns in review:

- A catch block that logs and continues while the queue row is deleted or
  marked synced.
- A success state set before the response arrives, or on a timeout.
- Dropping a terminal failure without a visible failed state.
- Clearing local data on logout, token revocation, cache pressure, or app
  upgrade while unsynced rows exist.
- Replacing a conflicted row with the server's version and losing the local
  paid price or line detail.
- A conflict badge that can be dismissed without choosing a resolution.
- Relying on the printed receipt as the only record of a queued sale: the local
  record must survive until sync.

## Test scenarios

| Scenario | Expected |
|---|---|
| Create a sale offline, reconnect | One order server-side, exactly one ledger row per line, local row synced |
| Send the same key twice after a timeout | One order; both responses reference the same identifier |
| Server commits but response is lost | Retry returns the original result; no duplicate payment or ledger row |
| Offline sale of the last unit; another sale takes it | `STOCK_INSUFFICIENT`; nothing applied; explicit override or void |
| Price changed while offline | Sale keeps the paid price; `PRICE_CHANGED` is informational |
| Several queued sales, one invalid | The invalid row is conflicted; the others still sync |
| App killed mid-upload | Row remains pending and resumes after restart |
| Logout with unsynced rows | Blocked or explicitly confirmed; rows survive and sync after re-authentication |
| Token revoked during sync | Queue pauses, rows remain, no data loss |
| Device clock is wrong | Server assigns report date and timestamps; local sale time is retained separately |
| End-of-day already closed | Sale applies and is flagged `CASH_REPORTING` in reconciliation |

For each scenario, assert the **absence** of duplicates and the **presence** of
a user-visible state. A test that only checks the happy-path response body is
not enough.
