---
name: workshop-pos-domain
description: "Domain invariants for a workshop point-of-sale system: integer rupiah money, tax and discount rounding, plate normalization and uniqueness, vehicle history, order status transitions, stock ledger integrity, and void/refund audit."
---

# Workshop POS domain rules

Use this skill for any change that touches prices, discounts, tax, payments,
receipts, vehicles, orders, stock, or audit records. These are correctness
rules, not style advice. If a change cannot satisfy one of them, stop and
surface the conflict instead of encoding an exception.

## Money is integer rupiah

- Every amount is an integer in Indonesian Rupiah. The smallest unit is 1
  rupiah; there are no cents and no fractional amounts at rest or in transit.
- Store amounts in integer columns (a 64-bit integer is sufficient), transport
  them as integers, and compute with integer arithmetic. Never use binary
  floating point, decimal strings, or locale-formatted text in the money path.
- Percentages are integers from 0 to 100. Quantities are positive integers;
  zero and negative quantities are rejected at the boundary.
- Have exactly one documented round-half-up helper for tax. Do not scatter
  ad-hoc rounding through handlers, components, or SQL.
- Display formatting (thousand separators, `Rp` prefix) is a presentation
  concern. Never parse a formatted string back into an amount.
- The server recomputes line totals, discounts, tax, and the order total from
  line data inside the order transaction. A total supplied by a client is
  informational only; it is never persisted as authoritative.

## Tax, discount, and rounding

- Tax is configured per outlet: default 11 percent, may be 0. Snapshot the
  applied rate on the order so later settings changes do not rewrite existing
  orders.
- Tax applies to the discounted line subtotal. Order tax is the sum of the
  rounded line taxes, not tax recomputed on the final total.
- Order-level discounts are allocated across lines in integer rupiah using one
  documented deterministic method (proportional allocation with a defined
  remainder rule). Assign every rupiah; never leave a rounding residual
  unallocated.
- Discounts may be per line, per order, or both, expressed as an integer
  percentage or a fixed rupiah amount. Discounts are non-negative and may
  never exceed the pre-tax subtotal. The payable total can never go negative.
- Role caps are enforced on the server. A discount above the actor's cap needs
  an authorized approver, a recorded reason, and an audit entry.
- Worked checks that must pass:
  - 11 percent of 12345 = 1357.95, rounded half-up to 1358.
  - Subtotal 300000, order discount 10 percent (30000), taxable 270000,
    tax 29700, total 299700.
  - Changing the outlet tax rate afterwards leaves those figures unchanged.

## Plate normalization and uniqueness

- Normalize by trimming, uppercasing, and removing all whitespace. Reject the
  value if the result contains anything outside `A-Z` and `0-9`.
- Normalization is idempotent: `b 1234 xyz`, `B 1234 XYZ`, and `B1234XYZ` all
  become `B1234XYZ`. Apply it on create, on update, on lookup, and on search.
- Store the normalized plate. Enforce uniqueness with a database constraint
  scoped to the business (the whole business, across its outlets). A
  pre-insert existence check alone is not sufficient; it races.
- A duplicate insert resolves to the existing vehicle and continues intake. Do
  not create a second vehicle, and do not auto-merge two existing vehicles;
  surface that for an explicit audited decision.
- Brand and model are required. Year, color, odometer, and notes are optional.
  Odometer is a non-negative integer when present. Never rewrite a historical
  mileage reading.

## Vehicle history invariants

- A vehicle is identified by its normalized plate within the business. Its
  history is the chronological set of orders for that plate, including line
  items, services, recorded mileage, payments, and status.
- History is per business for Owner/Admin and per outlet for Cashier/Mechanic.
  Every history read carries the actor's scope; cross-outlet reads are denied.
- Orders are never deleted to hide history. Void orders remain visible and are
  marked void. Anonymizing a customer preserves the financial and vehicle
  linkage required for records.
- Cached history may be shown read-only offline. It must be visibly a cache
  and must not accept writes while the device is offline.
- The same plate entering a different workshop business is a separate vehicle;
  scope every uniqueness and lookup by business.

## Order status transitions

Allowed transitions, and nothing else:

| From | Allowed to |
|---|---|
| `DRAFT` | `ESTIMATED`, `PAID`, `VOID` |
| `ESTIMATED` | `APPROVED`, `DRAFT` (revert; Admin/Owner, audited), `VOID` |
| `APPROVED` | `IN_PROGRESS`, `PAID`, `VOID` |
| `IN_PROGRESS` | `COMPLETED`, `PAID`, `VOID` |
| `COMPLETED` | `PAID`, `VOID` |
| `PAID` | `VOID` (Owner only) |
| `VOID` | none — terminal |

- A walk-in sale moves `DRAFT` to `PAID` on full payment.
- Payments are accepted only in `DRAFT` (walk-in only), `APPROVED`,
  `IN_PROGRESS`, or `COMPLETED`. When the balance due reaches zero the order
  becomes `PAID` and a receipt is available. Partial payment leaves the prior
  status and the remaining balance.
- Rejected transitions change no state, return a message naming the current
  status, and are audited as denied attempts.
- Lines of an `ESTIMATED` order are not editable by Cashier/Mechanic. Reverting
  to `DRAFT` is an Admin/Owner action with a reason and an audit entry.
- A `VOID` order rejects every mutation: lines, payments, and further status
  changes.

## Stock ledger integrity

- Stock is tracked per product per outlet. Every change inserts an append-only
  ledger row: type (`STOCK_IN`, `ADJUSTMENT`, `SALE_DECREMENT`,
  `SALE_REVERSAL`, and override-flagged variants), before and after quantity,
  actor, reason where applicable, and a reference to the source record.
- The stock-on-hand update and its ledger row commit in the same transaction.
  A stock change without a ledger row is a defect, even if the numbers look
  right.
- Each order line decrements stock exactly once, at the earlier of the order
  reaching `COMPLETED` or `PAID`. Paying an in-progress order and completing it
  later must not decrement twice.
- A void that reverses a decrement restores exactly the previously decremented
  quantity with a `SALE_REVERSAL` row. It does not recompute from current
  stock.
- Stock may not go negative unless an Admin/Owner applies an override with a
  reason; the resulting ledger row carries the override flag.
- The ledger is immutable: no update and no delete through the application.
  On a concurrent last-unit sale, one request succeeds and the other is
  rejected or must take the explicit override path; it is never silently
  negative.

## Void, refund, and audit

- A void requires a mandatory free-text reason (minimum 10 characters by
  default, configurable). A missing or too-short reason blocks the void.
- Unpaid orders may be voided by Admin/Owner. A paid order may be voided by
  Owner only, whole-order, never partially.
- A paid-order void records full per-method refund rows reversing every
  payment. Change stays part of the original cash row; it is never booked as a
  separate negative payment. The void reverses the stock decrement exactly
  once. Voided orders are excluded from sales totals and listed with their
  reasons in the day report.
- Write the audit entry in the same transaction as the action for: void,
  refund, price or cost change, role or user change, outlet settings change,
  discount above cap, negative-stock override, CSV export, and personal-data
  anonymization. Include actor, action, target, timestamp, reason where
  required, and before/after values.
- The audit log is append-only. No product path may edit or delete an entry.
- Expected cash for a day is the sum of cash payment rows minus cash refund
  rows; change is part of the cash row, not a separate negative payment.

## Required tests for any change here

| Scenario | Expected |
|---|---|
| Tax on 12345 at 11 percent | 1358, not 1357 or 1357.95 |
| Mixed line, order discount, 11 percent tax | 299700 for the documented example |
| Three plate spellings | One normalized vehicle, no duplicate |
| Two concurrent intake requests for a new plate | One vehicle; second converges |
| Illegal status transition | Rejected, no mutation, audited |
| Pay while `IN_PROGRESS`, then complete | Exactly one stock decrement |
| Void a paid order | Every payment reversed by method; exact stock reversal; audit row |
| Negative stock without override | Rejected |
| Existing order after tax-rate change | Unchanged figures |
| Duplicate submission of one transaction key | One order, one payment, one ledger row |

When reviewing a diff, look for the invariant being weakened rather than for
the feature being described. A UI that hides an invalid action is not an
enforcement.
