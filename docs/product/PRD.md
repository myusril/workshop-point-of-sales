# Workshop POS — Product Requirements Document (PRD)

| | |
|---|---|
| Working product name | **Workshop POS** (placeholder — the buyer may rename and rebrand; see FR-071) |
| Version | 1.1-draft |
| Date | 2026-11-26 |
| Change in 1.1-draft | Adds §2.4 functional requirement catalog, defining `FR-001`–`FR-071` exactly once each, and records the two resulting open decisions D-11 (payment correction before `PAID`) and D-12 (cycle count in MVP). No acceptance criterion, business rule, NFR, personal-data requirement, or success metric was altered. |
| Status | Draft for buyer review |
| Audience | The purchasing workshop (bengkel) owner and their future engineering / QA team |
| Scope of this document | Product requirements only. It contains no application code, no CI configuration, and no deployment secrets. |
| Legal note | Nothing in this document is legal, tax, or accounting advice. Sections marked **Counsel required** must be reviewed by the buyer's own legal and tax advisors before go-live. |

**How to read this document**

- `FR-nnn` = functional requirement. `BR-nnn` = business rule. `NFR-nnn` = non-functional requirement. `SM-nnn` = success metric target. `PD-nnn` = personal-data requirement. `US-nn` = user story with acceptance criteria.
- Every quantity in the acceptance criteria is testable by a QA engineer without guessing intent.
- All numeric performance/quality numbers in §5 and §6 are **targets**, not measured results.
- External facts are cited; everything else about the buyer's own operation is an assumption listed in §8.

---

## 1. Problem, Target Users, Jobs to be Done

### 1.1 Problem

A vehicle workshop (bengkel) sells two different things at the same counter: **spare parts** (physical stock that must be decremented and restocked) and **labor** (services with a price and an estimated duration). A typical job mixes both — e.g., an oil change that also consumes filters and shop supplies.

In the status quo (paper notebooks, spreadsheets, generic retail POS apps), this mix causes recurring costs:

- **No vehicle memory.** When a customer returns, the workshop cannot answer "what did we do to this plate last time, and at what mileage?" — trust and upsell opportunities are lost, and repeated diagnosis work is paid for twice.
- **Stock leaks.** Parts taken for jobs are not consistently deducted, so the shelf count and the book count drift apart. Nobody can say when a fast-moving part will run out.
- **Money ambiguity.** Discounts, tax, split payments across cash/transfer/QRIS, and day-end cash reconciliation are tracked by hand; discrepancies surface days later, if at all.
- **Counter delay.** Writing an order by hand while a customer waits (often on a slow or absent internet connection) is slow and error-prone.
- **No accountable changes.** Voids, discounts, and price edits leave no trail of who did what and why.

*(Qualitative problem framing only. No market-size or baseline figures are claimed; see §8 Assumptions.)*

### 1.2 Target users / personas

| Persona | Role in system | Context | Primary pain addressed |
|---|---|---|---|
| **Owner** | Full control of one workshop business; may own several outlets | Desktop back-office, occasionally mobile | Wants trustworthy numbers: sales, cash, stock value, and an accountable trail |
| **Admin** | Delegated manager (often the owner's right hand) | Desktop back-office + mobile | Catalog/pricing upkeep, approvals, stock corrections, reports |
| **Cashier** | Front counter | Mobile/tablet or browser, sometimes offline, low-end Android device | Fast mixed sales, correct change, receipts, not being blamed for stock drift |
| **Mechanic (Teknisi)** | Workshop floor | Mobile, hands busy, low-end Android | Sees assigned jobs, records completion, looks up vehicle history |

Secondary reader: the **buyer's engineering team**, who will implement, operate, and extend the delivered system and need requirement IDs to trace work packages.

### 1.3 Jobs to be done

- **JTBD-1.** "When a walk-in customer wants parts and labor together, I want one transaction that prices the mix correctly (discount, PPN, split payment) and prints one receipt, so the customer pays once and my counter stays fast."
- **JTBD-2.** "When a vehicle arrives, I want to identify it by plate number, capture brand/model/odometer, and see its full service history at this workshop, so I diagnose faster and the customer trusts the recommendation."
- **JTBD-3.** "When a customer must approve a cost first, I want to issue an estimate and record their approval, so there is no dispute at payment time."
- **JTBD-4.** "When a part is consumed, I want stock decremented exactly once, server-verified, with an override trail, so my book count matches the shelf."
- **JTBD-5.** "When the internet is down, I want to keep selling and queue the sale, then sync it safely, so the counter never stops."
- **JTBD-6.** "When the day ends, I want one report that tells me what I sold, by which payment method, what cash should be in the drawer, and what was voided and why."
- **JTBD-7.** "When something is changed or reversed, I want to know who did it and why, without needing to trust memory."

### 1.4 Core promise

> **One transaction mixes parts and labor; every vehicle is identified by a normalized plate number and carries its full workshop history across visits.**

Supporting promises: server-authoritative stock, offline-tolerant mobile counter, IDR-integer money math, accountable voids and overrides, Bahasa Indonesia UI, self-hostable with open tooling, and no mandatory paid SaaS.

### 1.5 Cost of the status quo (qualitative)

The buyer recognizes costs in lost history, stock drift, counter delay, and unreconciled cash. This PRD deliberately **does not quantify** these costs or any market statistics; no such research was performed for this document.

---

## 2. Product Principles and MVP Scope

### 2.1 Product principles

| ID | Principle |
|---|---|
| PR-1 | **One order, one truth.** A single order holds products *and* services, one total, one payment set, one receipt. |
| PR-2 | **Plate is the key.** Vehicle identity = normalized plate number (+ brand/model context); history is per plate, across visits and outlets of the same business. |
| PR-3 | **Server owns stock.** Local devices may *propose* sales offline; only the server's ledger is authoritative for stock. Conflicts are surfaced, never silently resolved. |
| PR-4 | **Integers only.** All money is integer rupiah; no floating point anywhere in the money path (BR-001). |
| PR-5 | **Nothing sensitive without a trail.** Voids, overrides, price edits, data exports, and role changes are audited with actor + reason. |
| PR-6 | **Counter speed over features.** The default path (walk-in sale, service intake) must be the shortest path in the UI. |
| PR-7 | **Buyer owns their data and brand.** Product name, logo, receipt branding, tax settings, and data location are buyer-configurable. |
| PR-8 | **Original, unencumbered delivery.** The delivered UI/visual design is an original implementation. No third-party admin-template code, demo assets, or brand assets are included in the handover (see §8 Dependencies). |

### 2.2 MVP scope by capability

| # | Capability | In MVP | Key requirements |
|---|---|---|---|
| C1 | Auth, roles, outlets | Owner / Admin / Cashier / Mechanic; outlet-scoped access; audit log | FR-001–FR-005 |
| C2 | Catalog | Products (SKU, cost, sell price, stock, low-stock threshold) and services (price, estimated duration) per outlet | FR-010–FR-013 |
| C3 | Customers & vehicles | Customer profiles; vehicles keyed by normalized plate, unique per business; brand/model/year/color/odometer/notes | FR-020–FR-024 |
| C4 | Transaction / service order | Intake → mixed line items → discount → tax → payment (cash, bank transfer, QRIS recorded manually; split payment) → receipt; void with reason + audit; status lifecycle | FR-030–FR-043 |
| C5 | Vehicle history | Chronological orders, items, mileage, payment status per plate | FR-024 |
| C6 | Inventory | Stock ledger; decrement on completion; stock-in/adjustment; low-stock list; authorized negative-stock override | FR-050–FR-054 |
| C7 | Reports | Daily sales, payment mix, service vs product revenue, technician productivity, stock valuation, end-of-day report; CSV export | FR-060–FR-066 |
| C8 | Mobile offline-first | Queue sales locally, idempotent sync, surfaced conflicts, server-authoritative stock | FR-041–FR-043 |
| C9 | Receipts | 58 mm / 80 mm thermal printing from Android; browser print fallback; reprint | FR-040 |
| C10 | Settings & branding | Tax rate, discount caps, receipt branding, product name/logo configurable | FR-070–FR-071 |

### 2.3 Explicitly out of scope ("Later")

The following are **not** in the MVP. Engineers must not build them speculatively.

- Full accounting / general ledger; payroll
- Supplier purchase orders, accounts payable, supplier management
- Payment-gateway integration (payments are **recorded manually**; QRIS is recorded, not generated)
- Loyalty programs, CRM, marketing campaigns
- Multi-tenant SaaS (one installation serves one workshop business)
- Customer-facing app or web portal; e-commerce
- WhatsApp (or any messaging) automation
- E-Faktur / tax-authority electronic invoicing integration
- Per-payment receipts for partially paid orders (one receipt per order, at PAID)
- Partial refunds (voids are whole-order only; see BR-008)
- Barcode/QR scanning hardware integration (catalog lookup is by text/SKU search)
- Cash drawer integration
- Purchase-price / supplier price comparison, automated reordering
- Multi-language or multi-currency UI
- Remote device wipe / MDM

### 2.4 Functional requirement catalog

**ID stability.** Requirement IDs are stable once released to engineering; renaming, re-scoping, or removing an `FR-nnn` requires a PRD revision (recorded as a new version row at the top of this document and, if it changes scope, a decision entry in §8.3). IDs are never reused.

Every functional requirement in this document is defined exactly once in the table below. `FR-001`–`FR-071` are all **in MVP**; no entry below adds scope beyond §2.2 and §2.3.

**Priority legend.** `P0` = required for an acceptance criterion in §3 to pass. `P1` = required for MVP completeness, verified through its listed user story rather than a dedicated acceptance criterion. Priority is a build order hint, not a scope boundary: every row is MVP.

| ID | Requirement | Priority | Primary story/AC |
|---|---|---|---|
| FR-001 | Owner creates, edits, and deactivates staff accounts: exactly one role (Owner, Admin, Cashier, Mechanic), one or more outlet assignments, name and phone. Deactivation blocks login while historical orders and audit entries remain attributed to that person. | P0 | US-01 (AC1.1–AC1.5) |
| FR-002 | Staff authenticate with their username/phone and password; the server issues the session. An idle session beyond the configured timeout (default 30 minutes) requires re-authentication before any write executes. | P0 | US-02 (AC2.1–AC2.3) |
| FR-003 | Role permissions are enforced server-side according to Appendix A, not only in the UI. A denied action performs no state change, shows an explanatory Bahasa Indonesia message, and is recorded in the audit log. | P0 | US-01 (AC1.2), US-16 |
| FR-004 | Outlet scoping: Cashier and Mechanic see only their assigned outlet's data; Owner and Admin see all outlets. Staff assigned to more than one outlet can switch the active outlet, and outlet-scoped lists follow that selection; no outlet switcher is offered to single-outlet staff. | P0 | US-02 (AC2.1, AC2.4), US-16 (AC16.4) |
| FR-005 | Append-only audit entries for sensitive actions — user/role creation, edit and deactivation, settings changes, price/cost edits, discounts above the role cap, voids, negative-stock overrides, exports, and personal-data anonymization — recording actor, action type, target, timestamp, and before/after values where applicable. | P0 | US-20 (AC20.1–AC20.2) |
| FR-006 | Logout immediately ends the session and clears device-local cached data and the local sync cache, so a signed-out device cannot reuse the session or display cached customer data. | P1 | US-02 |
| FR-007 | A staff member can change their own password by re-entering the current password; the Owner can reset a staff member's password from user management. Plaintext passwords are never stored, displayed after save, or written to any log. | P1 | US-02 (AC2.2) |
| FR-008 | Staff list with search by name or phone, filter by role and outlet, and pagination, showing role, outlet assignment, and active/deactivated state. | P1 | US-01 |
| FR-009 | Owner creates and edits the business's outlets and assigns staff to outlets. Each outlet carries its own settings (FR-070), and data of different outlets is never mixed on a screen or in a report. | P1 | US-02 (AC2.4), Appendix A |
| FR-010 | Product master create and edit: SKU (unique per outlet), name, cost, sell price, and unit; all money values are integer rupiah. | P0 | US-03 (AC3.1), US-16 (AC16.2) |
| FR-011 | Service master create and edit: name, price, and estimated duration in minutes. | P0 | US-03 (AC3.1) |
| FR-012 | Catalog list with text or SKU search, filter by item type (product/service), and pagination. Lookup is keyboard/text-based; no barcode or QR hardware is required (§2.3). | P1 | US-03 |
| FR-013 | Price and cost edits are audited with before/after values, actor, and timestamp, and affect only orders created afterwards; already-created orders keep their recorded figures. | P0 | US-20 (AC20.1), BR-002 |
| FR-014 | Product cost is visible and editable only to Owner and Admin. Cashier and Mechanic never see cost on any screen, receipt, or export, and no cost field is present in their UI. | P0 | US-16 (AC16.2) |
| FR-015 | Each product and each service belongs to exactly one outlet; catalog lists and lookups are outlet-scoped per BR-012. | P0 | US-16 (AC16.4) |
| FR-016 | Order lines keep a snapshot of the unit price applied at the time of sale; later catalog price edits never change the figures of an existing order. | P0 | US-03 (AC3.1–AC3.2), BR-002 |
| FR-017 | Products and services can be deactivated and reactivated. A deactivated item cannot be added to a new order but still renders correctly, with its recorded price, on historical orders and receipts. | P1 | Cross-cutting (BR-005), US-03 |
| FR-018 | Initial stock for a newly created product is entered as an opening stock-in and recorded as a ledger row; stock-on-hand is never edited directly as a field. | P1 | US-12 (AC12.1) |
| FR-019 | Low-stock threshold per product, set and edited by Owner or Admin, defaulting to none when not supplied; it feeds the low-stock list (FR-054). | P1 | US-13 |
| FR-020 | Customer profile create and edit: name and phone required; address optional; free-text notes optional and shown with a minimization warning against unnecessary personal data. | P0 | US-04 (AC4.1) |
| FR-021 | Vehicle record create and edit: normalized plate plus required brand and model; year, color, odometer, and notes optional. The normalized plate is unique within the workshop business. | P0 | US-04 (AC4.1–AC4.4) |
| FR-022 | Plate normalization — uppercase letters A–Z and digits 0–9 only, all whitespace removed — is applied on entry and on every search, and is idempotent so repeated normalization yields the same plate. | P0 | US-04 (AC4.4), US-10 (AC10.1) |
| FR-023 | Vehicle master fields are editable by permitted roles, including recording the current odometer at intake; the odometer, when supplied, must be a non-negative integer. | P1 | US-04, US-10 (AC10.1) |
| FR-024 | Vehicle history per plate: chronological orders, newest first, each with order type, line items and quantities, odometer at intake, total, payment status, and balance due, plus totals across visits. Owner and Admin see all outlets; Cashier and Mechanic see their outlet only. | P0 | US-10 (AC10.1–AC10.5) |
| FR-025 | Customer list with search by name or phone and pagination, used to attach an existing customer to an order or vehicle. | P1 | US-03, US-04 |
| FR-026 | Vehicle list with search by plate text (normalized before matching), by customer, or by brand, with pagination. | P1 | US-10 |
| FR-027 | Owner-triggered anonymization of a customer's or staff member's personal fields (name, phone, address) while financial and audit records are preserved, with the anonymization action itself audited per §7.4 (PD-04). | P1 | US-20 (AC20.1), §7.4 |
| FR-028 | A vehicle is linked to exactly one customer at a time; intake requires selecting an existing customer or creating one in the same flow. | P0 | US-04 (AC4.1) |
| FR-029 | Owner-triggered export of one customer's personal data (JSON or CSV) to answer an access request; the export is audited per §7.4 (PD-04). | P1 | US-20 (AC20.1), §7.4 |
| FR-030 | One order holds product and service lines together with a single total, a single payment set, and a single receipt; a walk-in sale is created and settled within the same screen without leaving the counter flow. | P0 | US-03 (AC3.1) |
| FR-031 | Line quantity must be a positive integer; line total = quantity × unit price. Zero, negative, or non-numeric quantities are rejected at the line and never produce a line total. | P0 | US-03 (AC3.4) |
| FR-032 | Per-line and order-level discounts as a percentage (integer 0–100) or a fixed rupiah amount; the Cashier is limited to the outlet's cashier discount cap (default 0%), and any discount above the cap requires Admin or Owner and is audited with the approver's identity and a reason. | P0 | US-03 (AC3.5), BR-003 |
| FR-033 | Tax is computed per line on the discounted line subtotal at the outlet's rate (default 11%, may be 0), rounded half-up to whole rupiah; order tax is the sum of the already-rounded line taxes. | P0 | US-03 (AC3.1), BR-002, BR-004 |
| FR-034 | Payments are recorded as one or more rows per order with method cash, bank transfer (recorded manually with a reference note), or QRIS (recorded manually); any other method string is rejected. | P0 | US-03 (AC3.1), US-07 (AC7.1, AC7.5) |
| FR-035 | Balance due = total − sum of payment rows. Non-cash rows may not exceed the balance due; cash tendered above the balance records the change explicitly and never a negative payment. | P0 | US-07 (AC7.2–AC7.4) |
| FR-036 | Service intake creates a service order bound to a vehicle, and a service line without a vehicle blocks saving; a product-only sale does not require a customer or vehicle. | P0 | US-04 (AC4.1), US-03 (AC3.2) |
| FR-037 | Issue a printable estimate for a draft service order — every line, discount, tax, and total — and record the customer's approval, moving the order `ESTIMATED → APPROVED` with the actor and timestamp retained. | P0 | US-05 (AC5.1–AC5.2) |
| FR-038 | Start and complete work on an approved order, recording the completion timestamp that triggers the single stock decrement defined in FR-051. | P0 | US-06 (AC6.1–AC6.2) |
| FR-039 | Void requires a mandatory free-text reason (default minimum 10 characters); unpaid orders may be voided by Admin or Owner, a `PAID` order only by the Owner, and a paid void records full per-method refund rows reversing every payment. | P0 | US-09 (AC9.1–AC9.5) |
| FR-040 | Produce and print one receipt per `PAID` order showing every line, discount, tax, payments, and change, on a 58 mm or 80 mm thermal printer from Android, with a browser print-formatted fallback when the printer is unreachable. | P0 | US-03 (AC3.1), US-17 (AC17.1–AC17.2) |
| FR-041 | On the mobile app with no connectivity, a completed sale is stored locally with a client-generated idempotency key, marked "Menunggu sinkron", receives a locally printed receipt, and shows stock as provisional rather than authoritative. | P0 | US-14 (AC14.1), US-03 (AC3.7) |
| FR-042 | Queued sales upload once on reconnect in a deterministic order and are validated independently; the server applies each sale and owns the resulting stock, and re-sending the same key returns the original result without creating a second order, payment, or ledger row. | P0 | US-14 (AC14.2–AC14.5) |
| FR-043 | When a synced sale cannot be applied server-side (for example insufficient stock), the sale is marked "Konflik" and requires an explicit user resolution: an authorized override with reason, or a void with reason and a recorded cash refund. It is never applied silently. | P0 | US-15 (AC15.1–AC15.5) |
| FR-044 | Lines can be added, edited, or removed while the order is in an editable status. Cashier and Mechanic cannot edit an `ESTIMATED` order; reverting to `DRAFT` to re-estimate is Admin/Owner only and audited with a reason. | P0 | US-05 (AC5.3), US-03 (AC3.4) |
| FR-045 | Assign a technician to an order or to individual lines; a mechanic's work list shows only their own assignments at their outlet. | P0 | US-06 (AC6.1, AC6.3) |
| FR-046 | Order list with search by date, status, plate, or customer and pagination, used to reopen an order for payment, receipt reprint, or void. | P1 | US-03, US-08 |
| FR-047 | Reprint a previously issued receipt of a `PAID` order with identical content; reprinting is available to permitted staff and changes no figure, stock, or status. | P1 | US-17 (AC17.3) |
| FR-048 | Correct a mis-keyed payment row (method, amount, or reference note) while the order is not yet `PAID`, by Admin or Owner, audited with before/after values; once the order is `PAID` only whole-order void applies (BR-008). | P1 | US-07, US-20 |
| FR-049 | Show the order's status timeline: each transition with its resulting status, actor, and timestamp, including estimate issuance, approval, revert to draft, and void. | P1 | US-08 (AC8.1) |
| FR-050 | Stock changes are recorded only as append-only ledger rows (stock-in, adjustment, sale decrement, sale reversal, and override-flagged variants) carrying before/after quantity, actor, reason where applicable, and a source reference. Rows cannot be edited or deleted, and stock-on-hand always recomputes exactly from them. | P0 | US-12 (AC12.4), US-19 (AC19.2) |
| FR-051 | Each order line decrements stock exactly once, at the earlier of the order reaching `COMPLETED` or `PAID`; no duplicate decrement and no compensating pair is produced for the same line. | P0 | US-11 (AC11.1), US-06 (AC6.2) |
| FR-052 | Record stock-in and stock adjustments with the actor and a mandatory reason or note for adjustments, by Owner or Admin only. | P0 | US-12 (AC12.1–AC12.3) |
| FR-053 | Stock may not go negative: a sale that would breach stock-on-hand is blocked naming the product and writes no ledger row, unless an Admin or Owner applies an override with a reason, in which case the row is flagged as an override with actor and reason. | P0 | US-11 (AC11.2–AC11.5) |
| FR-054 | Low-stock list per outlet showing every product at or below its threshold with current stock, threshold, and shortfall, plus an explicit empty state when none qualify. | P0 | US-13 (AC13.1–AC13.3) |
| FR-055 | Stock movement history per product, newest first, with filters by date range and movement type and with pagination. | P1 | US-12 |
| FR-056 | Cycle count: enter physical counts per product, review the variance against ledger stock-on-hand, and post the differences as adjustment ledger rows with the count as their source reference. | P1 | US-12, SM-07 |
| FR-057 | Stock-on-hand per product per outlet is shown on catalog lists and product detail, with a low-stock indicator when the threshold is reached. | P1 | US-11, US-13 |
| FR-058 | Every ledger row displays its source reference (order, void, stock-in, or cycle count) so any movement can be traced to the document that caused it. | P1 | US-12 (AC12.4) |
| FR-059 | A void restores exactly the previously decremented quantity once as a reversal row; an order that never decremented stock produces no reversal row. | P0 | US-09 (AC9.1–AC9.2), US-11 |
| FR-060 | Daily sales report per outlet and business date: order counts by status, gross sales, total discounts, total tax, and net sales. | P0 | US-18 (AC18.1, AC18.4) |
| FR-061 | Payment mix report per outlet and date: totals per method, with expected cash = cash payments − cash refunds, and change included within the cash row. | P0 | US-18 (AC18.1–AC18.2) |
| FR-062 | Service-versus-product revenue report for the selected period and outlet, showing revenue split by item type. | P0 | US-18 (AC18.4) |
| FR-063 | Technician productivity report: completed orders and lines per technician, with the labor value they contributed, for the selected period and outlet. | P1 | US-06, Cross-cutting |
| FR-064 | Stock valuation report per outlet: stock-on-hand × recorded product cost, in integer rupiah, with the valuation date stated. | P1 | US-12, Cross-cutting |
| FR-065 | End-of-day report per outlet and date combining counts by status, sales figures, payment mix, expected cash, and the voided orders with their reasons; a date with no orders shows zero figures and an explicit empty state. | P0 | US-18 (AC18.1–AC18.3) |
| FR-066 | CSV export of every report (FR-060–FR-064) and of the stock ledger: UTF-8 with BOM, RFC 4180 quoting, Bahasa Indonesia header row, integer money without thousand separators, ISO 8601 timestamps with the Asia/Jakarta offset, values matching the on-screen report; Owner and Admin only. | P0 | US-19 (AC19.1–AC19.4), US-16 (AC16.5) |
| FR-067 | Every report accepts a business-date range and an outlet filter; staff scoped to one outlet can select only that outlet. | P1 | US-18 (AC18.3) |
| FR-068 | Report figures are computed in integer rupiah and attributed to the Asia/Jakarta calendar day of the order's payment, and recomputation from the underlying orders and payments must match every displayed figure exactly. | P0 | US-18 (AC18.2), BR-001, BR-010 |
| FR-069 | View the audit log with filters by date range, actor, and action type; available to the Owner only, and no edit or delete operation on audit entries exists in the product. | P0 | US-20 (AC20.2–AC20.4) |
| FR-070 | Per-outlet settings: tax rate (default 11%, may be 0), cashier discount cap (default 0%), session idle timeout (default 30 minutes), receipt paper width (58 or 80 mm), minimum void-reason length (default 10 characters), and receipt numbering prefix. Changing a setting is audited and does not alter existing orders. | P0 | US-17 (AC17.4), US-02 (AC2.3), US-03 (AC3.5) |
| FR-071 | Buyer-configurable branding: product name, logo, and receipt header/footer text. The buyer may rename and rebrand the product; no third-party brand assets are included in the delivery. | P1 | US-17, Cross-cutting (PR-7, D-7) |

---

## 3. User Stories and Acceptance Criteria

Conventions used in the criteria below:

- Example master data (for QA fixtures): product `SKU BRK-001` "Kampas rem depan", cost 150000, price 250000, stock 20, low-stock threshold 5; service `SRV-001` "Ganti oli mesin", price 50000, duration 30 min; customer "Budi Santoso", phone 081234567890; plate input `b 1234 xyz` → normalized `B1234XYZ` (BR-006); tax rate 11% unless stated.
- "Denied" always means: operation refused, an explanatory message in Bahasa Indonesia shown, no state change, and the denied attempt recorded in the audit log (FR-005).

### US-01 — Owner creates a staff account and assigns a role (FR-001, FR-005)

**Story.** As an Owner, I create accounts for my staff so that every action in the system is attributable to a person.

- **AC1.1 (Happy path).** Given the Owner is logged in, When they create user "Dewi" with role Cashier, outlet "Outlet A", phone, and password, Then the user is created active with exactly that role and outlet, and an audit entry records actor, target user, and role.
- **AC1.2 (Role boundaries).** Given user "Dewi" (Cashier) is logged in, When they attempt to open user management, Then the action is denied (FR-003, Appendix A).
- **AC1.3 (Invalid input).** Given the Owner submits a user without a role or with an empty phone, When they save, Then the form is rejected with field-level messages in Bahasa Indonesia and no user is created.
- **AC1.4 (Duplicate).** Given user "Dewi" already exists, When the Owner creates another user with the same identity fields, Then creation is rejected with a duplicate-account message.
- **AC1.5 (Deactivation).** Given the Owner deactivates "Dewi", When "Dewi" attempts to log in afterwards, Then login is refused with a message; Dewi's historical orders and audit entries remain intact.

### US-02 — Login and outlet scoping (FR-002, FR-004)

- **AC2.1 (Happy path).** Given Dewi (Cashier) is assigned only to Outlet A, When she logs in, Then every list, report, and search result she sees contains only Outlet A data, and no outlet switcher is offered.
- **AC2.2 (Wrong credentials).** Given Dewi enters a wrong password 5 consecutive times, When she attempts the 5th, Then login is refused and repeated failures are rate-limited (see NFR-007) and logged without storing the attempted password.
- **AC2.3 (Idle timeout).** Given Dewi is logged in and leaves the session idle longer than the configured timeout (default 30 minutes, per-outlet configurable), When she next acts, Then she is required to re-authenticate and no write operation executes unauthenticated.
- **AC2.4 (Multi-outlet staff).** Given the Owner is assigned to Outlets A and B, When the Owner logs in, Then they can switch outlet context, and all outlet-scoped lists reflect the selected outlet.

### US-03 — Walk-in mixed sale: products + services, discount, tax, single payment (FR-030–FR-034, FR-040, FR-041; BR-001–BR-004)

**Story (JTBD-1).** As a Cashier, I ring up parts and labor in one order, apply discount and tax, take one payment, and print one receipt.

- **AC3.1 (Happy path).** Given product BRK-001 (stock 20, price 250000) and service SRV-001 (price 50000), When the Cashier creates a walk-in sale with 1×BRK-001 + 1×SRV-001, an order-level discount of 10%, and tax 11%, and pays cash 300000, Then:
  - subtotal = 300000; discount = 30000; tax = 29700 (11% of 270000, BR-002); **total = 299700**;
  - change = 300 (350000 not the case here — cash tendered 300000 exceeds 299700 by 300);
  - order status becomes `PAID` (BR-007);
  - BRK-001 stock becomes 19 and the ledger records exactly one decrement row with before/after quantities (BR-005, FR-051);
  - one receipt is available for printing with all lines, discount, tax, payments, and change.
- **AC3.2 (No vehicle required).** Given a product-only walk-in sale, When the Cashier saves without selecting a customer or vehicle, Then the sale is accepted (vehicle is mandatory only for service orders, FR-036/FR-037); a service line without a vehicle blocks saving.
- **AC3.3 (Empty state).** Given an order with zero line items, When the Cashier attempts to save/pay, Then saving is blocked with message "Tambahkan minimal satu item".
- **AC3.4 (Invalid input).** Given the Cashier enters quantity 0, −1, or a non-numeric value for a line, Then the input is rejected inline and the line total is never computed from an invalid quantity; per-line and order discounts greater than 100% or negative amounts are rejected (BR-003).
- **AC3.5 (Discount cap / permission).** Given the outlet's cashier discount cap is 0% (default, FR-070), When the Cashier attempts an order discount of 10%, Then the attempt is denied with a message directing them to an Admin/Owner; the denied attempt is audited; when the Admin applies the same 10%, it succeeds and is audited with reason (BR-003).
- **AC3.6 (Duplicate submission).** Given the Cashier taps "Simpan" twice quickly (double submission of the same client-generated transaction ID, BR-011), When both requests reach the server, Then exactly one order exists, both responses reference the same order ID, and no duplicate payment or ledger row is created.
- **AC3.7 (Offline-safe creation).** Given the device is offline, When the Cashier completes the sale per US-14, Then AC3.1's financial figures are identical when the sale is later synced (FR-042).

### US-04 — Service intake with plate, brand/model, odometer (FR-020–FR-023, FR-036, FR-037; BR-006)

**Story (JTBD-2).** As a Mechanic or Cashier, I identify the arriving vehicle by its plate and capture brand/model and current odometer.

- **AC4.1 (Happy path, new vehicle).** Given no vehicle with plate `B1234XYZ` exists, When the Cashier performs intake with plate input `b 1234 xyz`, brand "Honda", model "Beat 110", year 2021, color "Hitam", odometer 12450 km, customer "Budi Santoso", Then the vehicle is stored with normalized plate `B1234XYZ` (BR-006), linked to the customer, and a service order in status `DRAFT` is created with the intake odometer recorded.
- **AC4.2 (Existing plate).** Given vehicle `B1234XYZ` already exists for this business, When intake is performed with the same normalized plate, Then the existing vehicle is reused (no duplicate vehicle record is created) and the intake proceeds.
- **AC4.3 (Plate required & invalid).** Given intake input with an empty plate, or a plate containing characters outside A–Z/0–9 after normalization, When saved, Then creation is blocked with a Bahasa Indonesia message stating the required format; odometer, when provided, must be a non-negative integer.
- **AC4.4 (Normalization is idempotent).** Given plates `b1234xyz`, `B 1234 XYZ`, and `B1234XYZ`, When any of them is saved or searched, Then all resolve to the single vehicle `B1234XYZ` (BR-006).

### US-05 — Estimate and customer approval (FR-037, FR-005; BR-007)

**Story (JTBD-3).** As a Cashier/Admin, I issue an estimate for a service order and record the customer's approval before work starts.

- **AC5.1 (Happy path).** Given a `DRAFT` service order with parts and service lines, When the Cashier issues the estimate, Then status becomes `ESTIMATED`, an estimate document is printable showing every line, discount, tax, and total, and issuance is audited.
- **AC5.2 (Approval recorded).** Given an `ESTIMATED` order and the customer verbally approves, When the Cashier records "Disetujui", Then status becomes `APPROVED`, and the approval records actor and timestamp; the approval event is audited.
- **AC5.3 (Edit after estimate).** Given an `ESTIMATED` order, When anyone attempts to edit its lines, Then editing is blocked for Cashier/Mechanic; Admin/Owner may revert the order to `DRAFT` (re-estimate) and the reversion is audited with reason (BR-007).
- **AC5.4 (Payment before approval boundary).** Given an `ESTIMATED` order, When a payment is attempted, Then it is blocked (payments are accepted only per BR-009's allowed statuses; an estimate alone is not payable).

### US-06 — Service execution and completion (FR-038, FR-051; BR-005, BR-007)

- **AC6.1 (Happy path).** Given an `APPROVED` order with 1×BRK-001 assigned to mechanic "Agus", When Agus (or a Cashier) starts work, status becomes `IN_PROGRESS`; when work is completed, Then status becomes `COMPLETED` with completion timestamp, and BRK-001 stock decrements exactly once at this completion (20 → 19).
- **AC6.2 (Single decrement invariant).** Given an order that is paid while `IN_PROGRESS` (per BR-009) and later completed, When the lifecycle finishes, Then BRK-001 decremented exactly once (at the earlier of `COMPLETED` or `PAID`) and the ledger contains no reversal/duplicate pair for the same order line (BR-005).
- **AC6.3 (Mechanic visibility).** Given mechanic Agus is logged in, When he views his work list, Then he sees only orders assigned to him at his outlet, and he cannot record payments or void orders (Appendix A).

### US-07 — Split payment (FR-034, FR-035; BR-009)

- **AC7.1 (Happy path).** Given a `COMPLETED` order with total 299700 and no payments, When the Cashier records cash 100000 and bank transfer 199700, Then two payment rows are stored with their methods and amounts, balance due is 0, status becomes `PAID`, and the receipt lists both payments.
- **AC7.2 (Partial leaves unpaid).** Given the same order, When only cash 100000 is recorded, Then balance due remains 199700, status remains `COMPLETED` (not `PAID`), and no paid receipt is issued (§2.3: per-payment receipts are Later).
- **AC7.3 (Transfer/QBIS overpayment blocked).** Given balance due 199700, When a transfer of 200000 is recorded, Then the entry is rejected: non-cash payments may not exceed the remaining balance (BR-009).
- **AC7.4 (Cash overpayment → change).** Given balance due 299700, When cash 350000 is recorded, Then change 50300 is stored and shown, balance due is 0, and status becomes `PAID`.
- **AC7.5 (Payment method set).** Given any payment, When recorded, Then its method is one of: cash, bank transfer (recorded manually), QRIS (recorded manually); a free-form method is rejected.

### US-08 — Order status lifecycle enforcement (FR-036; BR-007)

- **AC8.1 (Allowed transitions).** Given an order in status `S`, When a transition attempt to status `T` is made, Then it succeeds if and only if `T` is permitted from `S` per the table in BR-007; all other combinations are rejected with a message naming the current status.
- **AC8.2 (No payment without eligible status).** Given a `DRAFT` service order (a walk-in sale's `DRAFT` is payable per BR-009), When a payment is attempted, Then it is blocked until the order reaches an eligible status.
- **AC8.3 (Terminal states).** Given a `VOID` order, When any mutation is attempted (lines, payments, status), Then it is rejected; the order remains visible in history and reports as voided.

### US-09 — Void with mandatory reason; refund boundaries (FR-039; BR-005, BR-007, BR-008)

- **AC9.1 (Unpaid void).** Given a `COMPLETED` (unpaid) order that already decremented stock, When an Admin voids it with reason "Salah input pelanggan" (≥ 10 characters, BR-008), Then status becomes `VOID`, the previously decremented stock is restored exactly once (19 → 20), and the audit entry contains actor, reason, and timestamp.
- **AC9.2 (Paid void = Owner only).** Given a `PAID` order, When an Admin attempts to void it, Then the attempt is denied (Appendix A); when the **Owner** voids it with a reason, Then full refund rows reversing every payment are recorded (method-per-method), status becomes `VOID`, stock is restored exactly once, and the daily report's void list includes it (US-18).
- **AC9.3 (Reason mandatory).** Given any void attempt with an empty reason (or reason shorter than the configured minimum, default 10 characters), Then the void is blocked.
- **AC9.4 (No partial refund).** Given a `PAID` order, When any user attempts to refund part of a payment or part of the order, Then no such operation exists in the product (BR-008); only whole-order void with full refund is possible.
- **AC9.5 (Reporting effect).** Given a voided order for a date D, When the daily report for D is generated, Then the order's amounts are excluded from sales totals and listed in the void section with its reason.

### US-10 — Vehicle history lookup (FR-024; BR-012)

**Story (JTBD-2).** As any staff member, I look up a plate and see everything this workshop ever did to that vehicle.

- **AC10.1 (Happy path).** Given 3 prior orders for `B1234XYZ` (each with line items, odometer at intake, payment status), When any staff member searches `b1234xyz`, Then the results show, newest first: date, order type (sale/service), line items with quantities, odometer, total, and payment status; totals across all visits are shown.
- **AC10.2 (Outstanding flag).** Given one of those orders is unpaid (`COMPLETED` not `PAID`), When the history is viewed, Then that order is visually flagged as unpaid with its balance due.
- **AC10.3 (Empty state).** Given a plate with no prior orders, When searched, Then a clear empty state is shown ("Belum ada riwayat untuk plat ini") with an option to start intake.
- **AC10.4 (Outlet scope).** Given a Cashier of Outlet A and one of the vehicle's orders belongs to Outlet B, When the Cashier searches the plate, Then only Outlet A orders are shown; when the Owner/Admin searches, Then all outlets' orders for that vehicle are shown (BR-012).
- **AC10.5 (Performance).** Given a vehicle with 1,000 historical orders, When the history is opened, Then the first page renders within the NFR-002 target.

### US-11 — Stock decrement, non-negativity, and authorized override (FR-051, FR-053; BR-005)

- **AC11.1 (Happy path decrement).** Given BRK-001 stock 20 and a paid/completed sale of 3 units, When the decrement applies, Then stock is 17 and one ledger row records type SALE_DECREMENT, quantity −3, before 20, after 17, actor, order reference, and timestamp.
- **AC11.2 (Rejected negative).** Given BRK-001 stock 1, When a sale of 2 units is submitted without override, Then the sale is blocked with a stock-insufficiency message naming the product; no ledger row is written.
- **AC11.3 (Authorized override).** Given the same situation, When an Admin/Owner confirms an override with reason "Stok fisik belum diinput", Then the sale proceeds, stock becomes −1, and the ledger row is flagged `OVERRIDE` with the reason and actor (BR-005).
- **AC11.4 (Override permission).** Given a Cashier submits a sale that would go negative and attempts to self-override, Then the override option is not available to the Cashier role (Appendix A).
- **AC11.5 (Concurrency).** Given stock 1 and two independent completions for 1 unit each submitted concurrently, When both reach the server, Then exactly one succeeds without override and the other is rejected or requires an authorized override; final stock is never negative without an override flag (BR-005).

### US-12 — Stock-in and stock adjustment (FR-052, FR-050)

- **AC12.1 (Stock-in).** Given BRK-001 stock 5, When an Admin records stock-in of 50 with note "Pembelian", Then stock is 55 and the ledger row (STOCK_IN, +50, before 5, after 55, actor, note) exists.
- **AC12.2 (Adjustment).** Given BRK-001 stock 55, When an Admin records adjustment −2 with reason "Rusak", Then stock is 53 and the ledger row (ADJUSTMENT, −2, before 55, after 53, actor, reason) exists.
- **AC12.3 (Reason mandatory & permission).** Given an adjustment with an empty reason, Then it is blocked; given the same attempt by a Cashier or Mechanic, Then it is denied (Appendix A).
- **AC12.4 (Ledger integrity).** Given any sequence of ledger rows for a product, When the stock-on-hand is recomputed from the initial stock plus all rows, Then it equals the displayed stock-on-hand exactly (append-only ledger; no edit/delete of ledger rows, FR-050).

### US-13 — Low-stock list (FR-054)

- **AC13.1.** Given BRK-001 threshold 5 and stock 3, When the Admin opens the low-stock list for the outlet, Then BRK-001 appears with stock, threshold, and shortfall.
- **AC13.2.** Given the stock is raised to 5 or above, When the list is refreshed, Then BRK-001 no longer appears.
- **AC13.3 (Empty state).** Given no product is below threshold, When the list is opened, Then an empty state is shown.

### US-14 — Offline sale queued, then synced (FR-041, FR-042; BR-011)

**Story (JTBD-5).** As a Cashier with no internet, I keep selling; sales upload safely later.

- **AC14.1 (Offline sale).** Given the mobile device has no connectivity, When the Cashier completes a walk-in cash sale of 1×BRK-001 (client generates the transaction's idempotency key), Then the sale is stored locally with status "Menunggu sinkron", a receipt prints from the device, the local stock display is marked provisional, and the sale is not yet visible in server reports.
- **AC14.2 (Sync).** Given connectivity returns, When the app syncs, Then the queued sale is uploaded once (idempotent: BR-011), the server applies it and decrements stock server-side, the sale's local status becomes "Tersinkron", and the local stock display is replaced by the server-authoritative value (PR-3).
- **AC14.3 (No duplicate on retry).** Given the same queued sale is re-sent after a timeout, When the server receives the second attempt with the same idempotency key, Then the server returns the original result and creates no second order, payment, or ledger row (BR-011).
- **AC14.4 (Offline scope).** Given the device is offline, When the Cashier attempts an action requiring the server (e.g., generating an end-of-day report), Then the action is clearly unavailable offline with a message; cached vehicle history remains viewable (US-10 read-only).
- **AC14.5 (Queued order of operations).** Given several queued sales, When syncing, Then they are applied in a deterministic order and each is validated independently; a failing sale does not block the others.

### US-15 — Sync conflict surfaced and resolved (FR-043; PR-3, BR-005)

- **AC15.1 (Conflict raised).** Given an offline sale of the last unit of BRK-001 and a concurrent online sale that already brought server stock to 0, When the offline sale syncs, Then the server does **not** silently apply it; the app displays a conflict item naming the product, the local quantity, and the current server stock, and the sale is marked "Konflik" until resolved.
- **AC15.2 (Resolution: override).** Given the resolving user holds override permission, When they apply the sale with a stock override and reason, Then the sale is applied, stock goes to −1 flagged `OVERRIDE`, and the conflict clears.
- **AC15.3 (Resolution: void).** Given no override permission, When the user chooses to void the offline sale with a reason, Then the sale becomes `VOID` (no stock change, no ledger decrement), the cash refund to the customer is recorded as a cash refund row, and the conflict clears.
- **AC15.4 (Money is local-authoritative).** Given the server's price for BRK-001 changed after the offline sale was made, When the sale syncs, Then the sale keeps the price the customer actually paid (money from the local record; stock from the server, PR-3/BR-001).
- **AC15.5 (Conflict visibility).** Given any unresolved conflict, When the Cashier opens the sync screen, Then the conflicting sale is listed with a badge and cannot be left silently unresolved without an explicit user action.

### US-16 — Role denial and cross-outlet protection (FR-003, FR-004, FR-066, FR-039; BR-012)

- **AC16.1.** Given Dewi (Cashier), When she attempts to void any order, Then the attempt is denied and logged (Appendix A).
- **AC16.2.** Given Dewi (Cashier), When she attempts to edit a product's cost, Then the attempt is denied (cost is not even editable in her UI).
- **AC16.3.** Given Agus (Mechanic), When he attempts to record a payment, Then the attempt is denied.
- **AC16.4.** Given Dewi (Cashier, Outlet A), When she requests Outlet B's daily report via the UI or any API endpoint, Then the response is denied and no Outlet B data is returned (BR-012).
- **AC16.5.** Given Dewi (Cashier), When she attempts any CSV export, Then the attempt is denied (export is Owner/Admin, FR-066).

### US-17 — Receipt print failure fallback (FR-040)

- **AC17.1 (Happy path).** Given a `PAID` order and a connected 58 mm or 80 mm thermal printer, When the Cashier taps print, Then the receipt prints within the NFR-004 target, formatted for the configured paper width.
- **AC17.2 (Printer unreachable → browser fallback).** Given the printer is unreachable, When the Cashier taps print, Then an error is shown with options "Coba lagi" and "Cetak via browser"; choosing the browser option opens a print-formatted receipt without requiring internet connectivity.
- **AC17.3 (Reprint).** Given a `PAID` order, When any permitted staff member reopens it later and taps print, Then the receipt prints again with identical content (reprint is allowed; FR-040).
- **AC17.4 (Width config).** Given the outlet's receipt width is set to 80 mm, When a receipt prints, Then the layout uses the 80 mm template; switching to 58 mm changes the template accordingly (FR-070).

### US-18 — End-of-day report (FR-060, FR-061, FR-062, FR-065)

**Story (JTBD-6).** As an Owner/Admin, at day end I reconcile the drawer and review the day.

- **AC18.1 (Happy path).** Given Outlet A on date D has: 5 paid orders (mix of cash/transfer/QRIS, one with split payment), 1 voided paid order with reason, 1 unpaid completed order, When the Admin opens the end-of-day report for D, Then it shows: order counts by status; gross sales; total discounts; total tax; net sales; payment mix totals per method; **expected cash = sum of cash payment rows − sum of cash refund rows** (including change as part of the cash row); and the voided orders with reasons.
- **AC18.2 (Reconciliation property).** Given the report's figures, When a QA engineer recomputes them from the underlying order/payment data for D and the outlet, Then every figure matches exactly (money in integer rupiah, BR-001).
- **AC18.3 (Scope & emptiness).** Given a date with no orders, When the report is opened, Then zero figures and an explicit empty state are shown; figures never include other outlets (BR-012).
- **AC18.4 (Period totals elsewhere).** Given the same data, When the daily sales, payment-mix, and service-vs-product reports are opened, Then their totals for D agree with the end-of-day report.

### US-19 — CSV export (FR-066)

- **AC19.1 (Happy path).** Given an Owner/Admin viewing the daily sales report, When they export CSV, Then the downloaded file is UTF-8 **with BOM**, comma-separated per RFC 4180 quoting, with a header row in Bahasa Indonesia, integer money (no thousand separators), and timestamps in ISO 8601 with the Asia/Jakarta offset; the values match the on-screen report exactly.
- **AC19.2 (Coverage).** Given each report in FR-060–FR-064 and the stock ledger (FR-050), When export is requested, Then each is exportable as CSV.
- **AC19.3 (Denial).** Given Dewi (Cashier), When she requests any CSV export, Then the request is denied and logged (US-16 AC16.5).
- **AC19.4 (Localization of values).** Given a CSV opened in a spreadsheet, When read, Then dates remain unambiguous (ISO 8601) and integers are not reformatted into floats.

### US-20 — Audit log of sensitive actions (FR-005, FR-013, FR-039, FR-053, FR-066)

- **AC20.1 (Coverage).** Given the following actions were performed: user/role creation or deactivation (US-01), settings change (FR-070), product price/cost edit (FR-013), order discount above cap (AC3.5), void (US-09), negative-stock override (AC11.3), CSV export (US-19), and personal-data deletion/anonymization (§7), When the Owner opens the audit log, Then each action appears with actor, action type, target, timestamp (Asia/Jakarta), and before/after detail where applicable.
- **AC20.2 (Append-only).** Given the audit log, When any user (including Owner) attempts to edit or delete an audit entry through the product, Then no such operation exists or succeeds (append-only).
- **AC20.3 (Filtering).** Given a large audit log, When the Owner filters by date range, actor, or action type, Then results are constrained accordingly.
- **AC20.4 (Denial).** Given Dewi (Cashier), When she attempts to view the audit log, Then the attempt is denied (Appendix A).

---

## 4. Business Rules

| ID | Rule |
|---|---|
| **BR-001** | **Money.** All monetary amounts are integers in Indonesian Rupiah (IDR), the smallest unit being 1 rupiah. Amounts are computed, stored, transmitted, and displayed as integers. Floating-point types must not appear anywhere in the money path. IDR only; no other currency. |
| **BR-002** | **Tax.** Tax rate is per outlet and configurable; default **11% (PPN)**, and it may be set to **0**. Tax applies to the discounted line subtotal: `tax = round_half_up(line_subtotal − line_discount, 0) × rate`. Order tax = sum of line taxes. Changing the rate affects only orders created afterwards; existing orders are immutable. |
| **BR-003** | **Discounts.** Discounts are per line and/or per order; expressed as a percentage (0–100, integer) or a fixed rupiah amount (integer ≥ 0). The sum of an order's discounts may never exceed the pre-tax subtotal (total can never become negative or zero-priced without at least one payable line). Discounts above the role cap: Cashier is limited to the outlet's cashier discount cap (default **0%**, configurable per outlet, FR-070); Admin/Owner are unlimited but audited. Every order-level discount above the cap requires the approver's identity recorded. |
| **BR-004** | **Rounding.** All monetary rounding is to the nearest whole rupiah, **half-up** (e.g., 11% of 12345 = 1357.95 → 1358). Rounding occurs only where BR-002 specifies (per-line tax); totals are sums of already-rounded integers. *(Buyer may direct a fiscal "round-down" convention — see §8 Open decision D-1.)* |
| **BR-005** | **Stock.** Stock-on-hand per product per outlet. Every stock change is an append-only ledger row (STOCK_IN, ADJUSTMENT, SALE_DECREMENT, SALE_REVERSAL, OVERRIDE-flagged variants) with before/after quantity, actor, reason where applicable, and reference. Stock may **not** go negative unless an Admin/Owner applies a flagged override with a reason (US-11). Each order line decrements stock **exactly once**, at the earlier of the order reaching `COMPLETED` or `PAID`; a void that reverses a decrement restores exactly the previously decremented quantity (SALE_REVERSAL). |
| **BR-006** | **Plate normalization & uniqueness.** A vehicle's plate is normalized to: uppercase A–Z and 0–9 only, with **all whitespace removed** (`b 1234 xyz` → `B1234XYZ`). Normalization applies on entry and on every search. The normalized plate is **unique within the workshop business** (across its outlets; see Open decision D-5). Brand and model are required alongside the plate; year, color, odometer, and notes are optional. |
| **BR-007** | **Order status lifecycle.** Statuses: `DRAFT`, `ESTIMATED`, `APPROVED`, `IN_PROGRESS`, `COMPLETED`, `PAID`, `VOID`. Allowed transitions: `DRAFT → ESTIMATED | PAID | VOID`; `ESTIMATED → APPROVED | DRAFT (revert, Admin/Owner, audited) | VOID`; `APPROVED → IN_PROGRESS | PAID | VOID`; `IN_PROGRESS → COMPLETED | PAID | VOID`; `COMPLETED → PAID | VOID`; `PAID → VOID (Owner only)`. `VOID` is terminal. Walk-in sales use `DRAFT → PAID` on full payment. |
| **BR-008** | **Void/refund boundaries.** Void requires a mandatory free-text reason (default minimum 10 characters, configurable). Unpaid orders (`DRAFT`–`COMPLETED`): void by Admin/Owner. Paid orders (`PAID`): void by **Owner only**, recording full per-method refund rows reversing every payment. There are **no partial refunds** in MVP; a paid order is voided whole or not at all. Voided orders are excluded from sales totals and listed in the day report's void section. |
| **BR-009** | **Payments.** Methods: cash; bank transfer (recorded manually with reference note); QRIS (recorded manually). Multiple payment rows per order (split payment). Balance due = total − sum(payments). Cash tendered above balance requires recording the change (change is stored, not a negative payment). Non-cash payment rows may not exceed the balance due at entry time. Payments may be recorded while status ∈ {`DRAFT` (walk-in only), `APPROVED`, `IN_PROGRESS`, `COMPLETED`}; when balance due reaches 0, status becomes `PAID`. Receipts are issued at `PAID`. |
| **BR-010** | **Time & timezone.** All timestamps are stored in UTC and rendered in **Asia/Jakarta** (WIB). Business dates (for daily reports) are determined by the Asia/Jakarta calendar day of the order's PAID timestamp. Offline sales carry both a device-captured local time and the server assignment time at sync; reports use the server time. |
| **BR-011** | **Idempotency & duplicates.** Every transaction created by a client (web or mobile) carries a client-generated unique transaction key. Retrying with the same key returns the original result and must not create a second order, payment, ledger row, or audit duplicate. Double-tap protection is a UI concern layered on top of this server-side guarantee. |
| **BR-012** | **Outlet scoping.** Every outlet-scoped record (order, catalog item, stock ledger, report) belongs to exactly one outlet. Cashier and Mechanic roles see only their assigned outlet's data. Owner and Admin see all outlets of the business. Vehicle history is per business for Owner/Admin and per outlet for Cashier/Mechanic (US-10 AC10.4). Cross-outlet API requests by scoped roles are denied and logged. |

---

## 5. Non-Functional Requirements

All numeric values in this section are **targets for acceptance testing**, not measured results.

| ID | Requirement | Target |
|---|---|---|
| **NFR-001** | **Platforms.** Responsive web back-office (modern evergreen desktop and mobile browsers) and an Android-first mobile app (phones and tablets). No other platforms in MVP. | — |
| **NFR-002** | **Web performance.** p95 server response ≤ 2 s for standard list/detail screens on a 10 Mbps connection; vehicle history first page ≤ 5 s p95 for a vehicle with ≤ 1,000 orders; report generation ≤ 10 s p95 for 12 months of data at assumed volumes (§8). | Targets |
| **NFR-003** | **Low-end Android.** Runs on Android 8.0+ with 2 GB RAM; APK size ≤ 60 MB; cold start ≤ 5 s on such a device; core sale flow usable on a 3G-class or absent connection. | Targets |
| **NFR-004** | **Receipt print latency.** p95 ≤ 5 s from tapping print to printer output (target, dependent on buyer's printer hardware). | Target |
| **NFR-005** | **Accessibility.** Web back-office conforms to **WCAG 2.2 AA**; mobile app: minimum touch target 44×44 dp, sufficient color contrast, and screen-reader labels on all interactive elements; all UI text in Bahasa Indonesia. | Requirement |
| **NFR-006** | **Locale.** All UI strings in Bahasa Indonesia; currency IDR with thousand-dot formatting for display (integers under the hood, BR-001); date display format `dd MMMM yyyy`; timezone Asia/Jakarta (BR-010). | Requirement |
| **NFR-007** | **Security.** Encrypted transport (TLS 1.2+) for all client–server traffic; passwords stored with an adaptive salted hash; session idle timeout (default 30 min, configurable); least-privilege RBAC enforced server-side (not only in UI); rate limiting on authentication failures; audit log append-only. | Requirement |
| **NFR-008** | **Availability.** Web/mobile server availability target 99.5% per calendar month (target; the mobile app must remain sale-capable offline during outages, FR-042). | Target |
| **NFR-009** | **Backup & recovery.** Automated backups with **RPO ≤ 15 minutes** and **RTO ≤ 2 hours** (targets); backups encrypted at rest; restore procedure documented and handed over; buyer's operations team runs and verifies restores per their schedule. | Targets |
| **NFR-010** | **Audit & record retention.** Audit log and transactional records retained by default **10 years**, configurable shorter by the buyer *(Counsel required: confirm retention periods against Indonesian bookkeeping/tax obligations)*; retention expiry handled by a documented cleanup/anonymization job (§7). | Requirement (duration = assumption) |
| **NFR-011** | **Self-hostability.** Deployable on a single host or small cluster using standard open-source tooling (containers/orchestration-agnostic) with **no mandatory paid SaaS** and **no runtime dependency on any internal tooling**; all dependencies under permissive licenses (MIT, Apache-2.0, ISC, BSD; no GPL/AGPL/SSPL/FSL or commercial-runtime dependencies). | Requirement |
| **NFR-012** | **Data isolation.** One installation serves exactly one workshop business; all reads/writes are filtered by business and outlet at the data layer (BR-012). | Requirement |
| **NFR-013** | **Capacity assumption.** Performance targets assume per outlet: ≤ 50 staff, ≤ 100k order lines/year, ≤ 20k vehicles. Exceeding these requires re-testing (§8 Assumptions). | Assumption |

---

## 6. Success Metrics (Targets)

These are **targets to validate after go-live**, not measured results. Baselines must be captured by the buyer during the first weeks of operation.

| ID | Metric | Target |
|---|---|---|
| **SM-01** | Time for a trained cashier to complete a 2-line mixed walk-in sale (1 product + 1 service, discount, payment, receipt) | ≤ 3 minutes (target) |
| **SM-02** | Share of service orders created with a valid normalized plate-linked vehicle | 100% (enforced by FR-036/FR-037) |
| **SM-03** | Median time to retrieve a vehicle's full history from plate entry | ≤ 10 seconds (target) |
| **SM-04** | Offline sales that sync without manual conflict resolution | ≥ 95% (target) |
| **SM-05** | Voids recorded with a reason | 100% (enforced by FR-039/BR-008) |
| **SM-06** | End-of-day cash reconciliation discrepancies (expected cash vs counted cash) that are not explainable by a recorded refund/change | 0 unexplained per month, per outlet (target) |
| **SM-07** | Cycle-count agreement between ledger stock-on-hand and physical count | ≥ 99% of SKUs per monthly count (target) |
| **SM-08** | Time for a new cashier to reach independent counter operation after training | ≤ 1 working day (target) |
| **SM-09** | Receipt prints succeeding on first attempt | ≥ 98% (target; dependent on printer hardware) |
| **SM-10** | Stock-out incidents on items flagged low-stock before reaching zero | Tracked from go-live; buyer sets the reduction goal against their own baseline (no baseline claimed in this PRD) |

---

## 7. Personal Data and Compliance (UU PDP)

> This section is an engineering/product inventory, **not legal advice**. **Counsel required**: the buyer's legal advisor must confirm lawful bases, retention periods, breach-notification timelines, and any registration obligations under Indonesia's Law No. 27 of 2022 on Personal Data Protection (UU PDP).

### 7.1 Roles

- **Data Controller:** the **buyer** (the workshop owner), from handover onward. The buyer decides purposes and means and answers to data subjects and regulators.
- **Processor(s):** whichever hosting/backup provider(s) the buyer engages. The delivered product bundles **no third-party processors**; adding any (hosting, backup, email/SMS, analytics) is a buyer decision requiring processor review (§8, Open decision D-3).

### 7.2 Personal data inventory (PD-01)

| ID | Category | Fields | Subject | Purpose | Lawful-basis candidate (counsel to confirm) |
|---|---|---|---|---|---|
| PD-01 | Staff account | Name, phone, email/username, password (hashed only — plaintext never stored or logged), role, outlet assignment | Workshop staff | Authentication, attribution, contact | Performance of employment/engagement; legitimate interest (security) |
| PD-02 | Customer | Name, phone (required), address (optional), free-text notes | Customer | Transactions, receipts, service follow-up | Performance of contract (the service transaction); legitimate interest (history) |
| PD-03 | Vehicle | Plate number (normalized), VIN/chassis or engine number if the buyer records it, brand/model/year/color, odometer, notes | Customer (indirectly — plate and vehicle identity link to a person) | Vehicle identification and service history | Performance of contract; legitimate interest |
| PD-04 | Payment records | Amounts, method, reference note (may contain bank account name/number if the buyer types it) | Customer | Financial reconciliation, dispute handling | Performance of contract; legal obligation (bookkeeping) |
| PD-05 | Audit log | Actor identity, action, target, timestamp, before/after for sensitive actions | Staff (and indirectly customers) | Accountability, security, dispute resolution | Legitimate interest; legal obligation |
| PD-06 | Service history | Orders, items, mileage per vehicle/person | Customer | Warranty-style history, diagnostics, trust | Performance of contract |
| PD-07 | Session/technical | Session tokens (stored hashed), device identifiers for the mobile app, sync queue metadata | Staff | Security, offline sync integrity | Legitimate interest |

**Minimization rules (PD-02).** Only the fields above are collected for their stated purposes; free-text notes fields carry a UI warning not to enter unnecessary personal or sensitive data. Passwords are never logged; the audit log stores actor IDs, not credentials; phone numbers are not written to application logs or error trackers.

**Sensitive/specific personal data (per UU PDP categories):** none is deliberately collected. Free-text fields could leak such data — mitigated by the minimization warning and by counsel review of the privacy notice. *(Counsel required.)*

### 7.3 Retention (PD-03)

| Data | Default retention | Notes |
|---|---|---|
| Transactional, payment, and service-history records | 10 years (configurable) | Aligned with common Indonesian bookkeeping retention expectations; **counsel to confirm** |
| Audit log | Follows the transactional record it references (default 10 years) | Append-only; cannot be shortened below transactional retention |
| Customer/staff contact data | While the relationship is active; on deletion request → anonymization (PD-04) | Financial integrity of past orders is preserved |
| Device-local sync queue | Until sync is confirmed; cache cleared on logout | FR-042 |

### 7.4 Data subject rights mechanics (PD-04)

- **Access/export:** an Owner can export a customer's or staff member's personal data held by the product (JSON or CSV).
- **Correction:** customer, vehicle, and staff fields are editable by permitted roles (Appendix A); edits to sensitive fields are audited.
- **Deletion/anonymization:** a deletion request by the Owner anonymizes the subject's personal fields (name/phone/address) while **preserving** the financial and audit record (amounts, dates, plate linkage may be retained per counsel's direction). The deletion/anonymization action is itself audited. *(Counsel required on what must be retained vs erased.)*
- **Requests:** requests from data subjects flow through the buyer (Data Controller); the product provides the tooling, not the legal response process.

### 7.5 Security controls supporting UU PDP (PD-05)

Role-based least privilege (Appendix A), outlet isolation (BR-012), hashed credentials, no sensitive values in logs (PD-02 minimization rules), encrypted transport (NFR-007), encrypted-at-rest backups (NFR-009), append-only audit (US-20).

### 7.6 Breach handling (PD-06)

- The product must support investigation: the audit log and system logs allow reconstructing what data was accessed, by whom, and when.
- If the buyer uses vendor-operated hosting (Open decision D-3), the hosting agreement must include a commitment to notify the buyer (Controller) of a confirmed personal-data breach **without undue delay and within a contractually fixed window (recommended ≤ 24 hours of confirmation)**.
- Notification obligations toward data subjects and any regulator rest with the buyer as Controller; timelines and thresholds are **counsel required** (UU PDP contains such duties; this PRD does not restate them).
- The delivered documentation must include a breach-runbook template (detect → contain → assess → notify per counsel's guidance → remediate → record).

---

## 8. Dependencies, Assumptions, and Open Buyer Decisions

### 8.1 Dependencies

| ID | Dependency | Owner |
|---|---|---|
| DEP-1 | Buyer-supplied hardware: Android device(s) (Android 8.0+, 2 GB RAM minimum) and ESC/POS-compatible 58 mm / 80 mm thermal printer(s) | Buyer |
| DEP-2 | Internet connectivity at each outlet for the web back-office and for mobile sync (intermittent connectivity is supported for mobile sales; FR-042) | Buyer |
| DEP-3 | Hosting environment meeting NFR-009 (backups, RPO/RTO) and NFR-011 (self-hostable, open tooling, permissive licenses) | Buyer |
| DEP-4 | Buyer's tax/legal counsel for PPN configuration, retention, privacy notice, and breach timelines (§7, BR-002) | Buyer |
| DEP-5 | Original visual design implementation — no third-party admin-template code, demo assets, or brand assets are included in the handover (PR-8; licensing inventory documents this) | Vendor (delivery) |
| DEP-6 | The buyer configures PPN status and rate per their own tax position (registered vs not; BR-002) | Buyer |

### 8.2 Assumptions (unverified; each must be validated during onboarding)

- AS-1. One installation = one workshop business; outlets ≤ 10; staff ≤ 50 per outlet (NFR-013 volumes).
- AS-2. Single currency (IDR), single language (Bahasa Indonesia), single timezone (Asia/Jakarta) — §2.3 excludes others from MVP.
- AS-3. Payments are recorded manually; no gateway exists in MVP (§2.3). QRIS data is typed by staff from the merchant app.
- AS-4. Prices are set by the workshop; no dynamic pricing or supplier feeds.
- AS-5. Thermal printers in use are ESC/POS-compatible; exotic printer protocols are out of scope.
- AS-6. One mobile device is assigned per cashier; devices are workshop property.
- AS-7. Receipts produced are plain thermal receipts, not fiscal/e-Faktur invoices (§2.3).
- AS-8. The buyer, not the vendor, is the Data Controller and runs retention/counsel decisions (§7.1).

### 8.3 Open buyer decisions

| ID | Decision | Options | Recommendation |
|---|---|---|---|
| D-1 | Tax rounding convention | (a) round half-up to nearest rupiah (BR-004); (b) round down, per some fiscal practices | (a); confirm with tax counsel |
| D-2 | Cashier discount cap default | 0% (requires Admin/Owner approval each time) vs a small non-zero cap | 0% default, configurable per outlet (most accountable) |
| D-3 | Hosting model & region | Self-hosted by buyer vs vendor-operated; region (Indonesian region preferred) | Decide with counsel and IT capacity; if vendor-hosted, sign a processor agreement (§7.1) |
| D-4 | Receipt numbering format | Per-outlet sequential with configurable prefix | Per-outlet sequential; buyer sets prefix |
| D-5 | Plate uniqueness scope | Unique across the whole business (BR-006 default) vs per outlet | Unique across the business (vehicles travel between outlets) |
| D-6 | Deletion semantics for personal data | Hard delete vs anonymization preserving financial records | Anonymization (PD-04), per counsel |
| D-7 | Product name/branding | Buyer renames "Workshop POS"; logo, receipt header/footer | Any buyer-owned name; FR-071 |
| D-8 | Audit/record retention duration | 10 years default (NFR-010) vs shorter/longer per counsel | 10 years until counsel confirms |
| D-9 | Printer models certified for first release | Any ESC/POS 58/80 mm vs a tested-model list | Ship protocol-generic (ESC/POS) and publish a tested-model list post-pilot |
| D-10 | Support, warranty, and update terms after handover | Contract matter between buyer and vendor | Not a product requirement; excluded from this PRD |
| D-11 | Payment correction before `PAID` | (a) Admin/Owner may correct a mis-keyed payment row with an audit trail (FR-048); (b) no payment edits at all, only whole-order void | (a), bounded to pre-`PAID` and audited |
| D-12 | Cycle count in MVP | (a) include physical count with variance posting (FR-056) to support SM-07; (b) defer and rely on stock adjustments | (a) if monthly cycle counts are a go-live expectation; otherwise (b) |

---

## Appendix A — Permission matrix (normative for FR-003)

Legend: **Y** = allowed; **N** = denied (denied attempts on sensitive actions are audited); **O** = own outlet only; **A** = all outlets of the business.

| Action | Owner | Admin | Cashier | Mechanic |
|---|---|---|---|---|
| Manage users/roles/deactivation | Y | N | N | N |
| Edit outlet settings (tax, caps, receipt, branding) | Y | N | N | N |
| View audit log | Y | N | N | N |
| Product/service create & edit (price, cost) | Y (A) | Y (A) | N | N |
| Customer/vehicle create & edit | Y (A) | Y (A) | Y (O) | N (view O) |
| Service intake | Y (A) | Y (A) | Y (O) | Y (O) |
| Issue estimate / record approval | Y (A) | Y (A) | Y (O) | N |
| Assign technician / complete work | Y (A) | Y (A) | Y (O) | Y (O, own assignments) |
| Create walk-in sale | Y (A) | Y (A) | Y (O) | N |
| Record payment | Y (A) | Y (A) | Y (O) | N |
| Discount above cap | Y | Y | N | N |
| Void unpaid order | Y | Y | N | N |
| Void paid order | Y | N | N | N |
| Stock-in / adjustment | Y (A) | Y (A) | N | N |
| Negative-stock override | Y (A) | Y (A) | N | N |
| View reports (daily, payment mix, service vs product, productivity, stock valuation, end-of-day) | Y (A) | Y (A) | Y (O) | N |
| CSV export | Y (A) | Y (A) | N | N |
| Vehicle history lookup | Y (A) | Y (A) | Y (O) | Y (O) |
| Export/anonymize personal data | Y | N | N | N |

---

## Appendix B — Requirement traceability index

| Story | Functional requirements | Business rules | NFRs |
|---|---|---|---|
| US-01 | FR-001, FR-005 | — | NFR-007 |
| US-02 | FR-002, FR-004 | BR-012 | NFR-007 |
| US-03 | FR-030–FR-034, FR-040, FR-041 | BR-001–BR-004, BR-009, BR-011 | NFR-002, NFR-004, NFR-006 |
| US-04 | FR-020–FR-023, FR-036, FR-037 | BR-006 | NFR-006 |
| US-05 | FR-037, FR-005 | BR-007 | — |
| US-06 | FR-038, FR-051 | BR-005, BR-007 | — |
| US-07 | FR-034, FR-035 | BR-009 | — |
| US-08 | FR-036 | BR-007 | — |
| US-09 | FR-039 | BR-005, BR-007, BR-008 | NFR-010 |
| US-10 | FR-024 | BR-012 | NFR-002 |
| US-11 | FR-051, FR-053 | BR-005 | — |
| US-12 | FR-050, FR-052 | BR-005 | — |
| US-13 | FR-054 | — | — |
| US-14 | FR-041, FR-042 | BR-011 | NFR-003 |
| US-15 | FR-043 | BR-005, BR-011 | — |
| US-16 | FR-003, FR-004, FR-039, FR-066 | BR-012 | NFR-007, NFR-012 |
| US-17 | FR-040, FR-070 | — | NFR-004, NFR-006 |
| US-18 | FR-060, FR-061, FR-062, FR-065 | BR-001, BR-010, BR-012 | NFR-002 |
| US-19 | FR-066 | BR-001, BR-010 | NFR-006 |
| US-20 | FR-005, FR-013, FR-039, FR-053, FR-066 | — | NFR-010 |

*End of document. Changes to this PRD follow the repository's change-review process; requirement IDs are stable once released to engineering.*
