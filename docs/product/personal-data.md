# Personal Data — Inventory & UU PDP Note for the Buyer

| | |
|---|---|
| Product | Workshop POS (source-code handover to the buyer) |
| Audience | The purchasing workshop (bengkel) owner and their advisors |
| Date | 2026-11-26 |
| Companion documents | `docs/product/PRD.md` §7 (PD-01–PD-07), `docs/adr/0001-stack-and-architecture.md`, `docs/ops/license-inventory.md` |
| Legal disclaimer | **This document is an engineering inventory, not legal advice.** Indonesia's Law No. 27 of 2022 on Personal Data Protection (UU PDP) has obligations whose exact thresholds, timelines, and registration duties must be confirmed by the buyer's own legal counsel (all such items are marked **Counsel required**). The buyer, not the implementer, is responsible for compliance. |

---

## 1. Controller / Processor roles

- **Before handover:** the implementer (vendor) is a **processor/inner operator** for the buyer's seed and QA data; the buyer (workshop owner) is the intended Data Controller for any data that will be loaded at go-live.
- **From handover onward:** the **buyer is the Data Controller** under UU PDP. The buyer decides purposes and means; the buyer answers to data subjects and to regulators. The delivered product bundles **no third-party processors**; hosting and backup are buyer-supplied (PRD DEP-3), and any later vendor-hosted option is a buyer decision requiring a Data Processing Agreement (PRD §8 D-3).
- **DPO / privacy contact:** UU PDP requires controllers processing personal data at scale to appoint a Data Protection Officer (exact applicability thresholds are **Counsel required**). Recommendation: the workshop Owner designates a named person (often themselves in a ≤ 10-outlet business) and publishes contact details in the privacy notice. The delivered product stores the name/contact in Settings; a dedicated staff role is *not* required — the DPO function can be held by an existing Owner account.

## 2. Data inventory (PD-01)

Complete inventory mirrors `docs/product/PRD.md` §7.2. Summary here for the buyer's review; each row's lawful basis is a **candidate** to be confirmed by counsel.

| Ref | Category | Fields | Data subject | Purpose | Lawful-basis candidate | Where stored |
|---|---|---|---|---|---|---|
| PD-01 | Staff account | name, phone, email/username, role, outlet assignment; password (hashed only, never plaintext/logged) | Staff | Authentication, attribution, contact | Employment/engagement; legitimate interest (security) | PostgreSQL `users`, Better Auth tables; sessions hashed |
| PD-02 | Customer | name, phone (required), address (optional), notes | Customer | Transactions, receipts, follow-up | Contract performance; legitimate interest | PostgreSQL `customers` |
| PD-03 | Vehicle | plate number (normalized), VIN/engine number (optional), brand/model/year/color, odometer, notes | Customer (indirectly — plate + vehicle identity link to a person) | Vehicle identification, service history | Contract performance; legitimate interest | PostgreSQL `vehicles` |
| PD-04 | Payment records | amount, method, reference note (may contain account name/number if typed by staff) | Customer | Financial reconciliation, disputes | Contract performance; legal obligation (bookkeeping) | PostgreSQL `orders`, `payments`, `refunds` |
| PD-05 | Audit log | actor ID, action, target, timestamp, before/after detail | Staff (and indirectly customers) | Accountability, security | Legitimate interest; legal obligation | PostgreSQL `audit_log` (append-only) |
| PD-06 | Service history | orders, line items, mileage per vehicle/person | Customer | Warranty-style history, diagnostics, trust | Contract performance | PostgreSQL `orders`, `order_lines` |
| PD-07 | Session/technical | session tokens (stored hashed), mobile device identifiers, sync-queue metadata | Staff | Security, offline-sync integrity | Legitimate interest | PostgreSQL `sessions`, `devices`, `idempotency_keys`; on-device `expo-sqlite` outbox |

**Minimization rules (PRD PD-02).** Only these fields are collected for these stated purposes. UI carries a Bahasa-Indonesia warning on free-text note fields not to enter unnecessary personal or sensitive data. Passwords are never logged or stored in plaintext; audit entries store actor IDs, not credentials; phone numbers are never written to application logs, error output, or CSV exports beyond the minimum columns the report requires (AC19.x). Device-local outbox holds only what is needed to sync a queued sale and is cleared on confirmed sync and on logout (PD-03 in PRD §7.3).

**Sensitive/specific personal data (UU PDP categories).** None is deliberately collected. Free-text fields could leak such data — mitigated by the minimization warning; **Counsel required** to confirm the privacy-notice wording covers this residual risk.

## 3. Lawful bases — candidate mapping (Counsel required)

| Data category | Likely basis (to be confirmed) | Notes |
|---|---|---|
| Staff accounts, sessions, audit | Performance of employment/engagement + legitimate interest (security) | Consent is *not* the primary basis for staff records — avoid relying on consent where withdrawal would imply job consequences |
| Customer transactions, payments, service history | Performance of a contract (the service transaction) | Explicit consent not required if contract performance is confirmed |
| Marketing/follow-up contacts, if ever added | Consent (separate, later, revocable) | Out of MVP scope (PRD §2.3); adding this is a buyer decision with a fresh lawful basis |
| Vehicle plate (indirect personal data) | Contract performance + legitimate interest | Plate is not by itself "sensitive", but plate-to-person linkage is personal data |

## 4. UU PDP obligations mapped to the architecture

| Obligation | Architecture support | Owner |
|---|---|---|
| Notice & transparency | Delivered privacy-notice template in Bahasa Indonesia (fill-in-the-blank; counsel finalizes); shown at first staff login and at the counter if the buyer chooses to publish it | Buyer (content), vendor (template) |
| Consent management | Not implemented in MVP because the candidate bases above are contract/employment/legitimate-interest, not consent. If counsel requires consent for any flow, add a Settings flag + consent record table (audited). **Counsel required** | Buyer/counsel |
| Access / correction | Owner can export a subject's data (JSON/CSV, AC20.1 audit entry, PD-04 in PRD §7.4); permitted roles can edit customer/vehicle/staff fields; edits audited | Vendor (tooling), Buyer (process) |
| Deletion / anonymization | Owner-only anonymize action (Appendix A: "Export/anonymize personal data" is Owner only) — sets name/phone/address/notes to null/placeholder while **preserving** financial and audit rows; the action itself is audited (AC20.1) | Vendor (tooling), Buyer (process) |
| Retention schedule | Defaults in §5; enforced by a documented cleanup/anonymization job in `packages/db` (NFR-010) | Vendor (job), Buyer (schedule) |
| Breach detection & response | Audit log + system logs allow reconstructing what was accessed, by whom, when (PRD §7.6); delivered breach-runbook template (detect → contain → assess → notify per counsel → remediate → record) | Buyer |
| Breach notification timelines | **Counsel required.** UU PDP requires notifying affected parties and the authority; PRD §7.6 requires vendor-operated hosting (if any) to commit to ≤ 24 h notification of the Controller. Exact regulator thresholds must be confirmed by counsel | Buyer + counsel |
| DPO appointment & contact | See §1 | Buyer |
| Processor agreements | If the buyer uses any vendor-operated hosting, backup provider, or (post-MVP) SMS/email provider, a DPA is required (PRD §8 D-3; **Tier 3 founder decision** per ADR-0001 §3.11) | Buyer |
| Cross-border transfer | Preferred hosting: Indonesian region (e.g., Jakarta VPS, PRD D-3). If the buyer chooses any provider whose infrastructure leaves Indonesia, a cross-border transfer assessment under UU PDP is required (**Counsel required**, Tier 3 founder decision) | Buyer + counsel |

## 5. Retention schedule (PD-03; NFR-010)

| Data | Default retention | Notes |
|---|---|---|
| Orders, payments, refunds, service history | **10 years** (configurable by buyer) | Aligned with common Indonesian bookkeeping retention expectations; **Counsel required** to confirm exact period |
| Audit log | Follows the transactional record it references (default 10 years) | Append-only; cannot be shortened below the transactional record |
| Customer / staff contact data | While the relationship is active; on deletion request → anonymization (§4) | Financial integrity of past orders is preserved |
| Device-local outbox | Until sync confirmed; cleared on logout | PRD PD-03 |
| Session / device tokens | Until expiry or revocation | Hashed at rest |

**Deletion vs financial-record conflict (explicit rule).** A data subject's right to erasure **collides with bookkeeping/tax retention** for orders, payments, and audit entries. The delivered mechanism is **anonymization, not deletion** (PRD D-6, PD-04): personal identifiers on the *subject* are removed; the *financial rows* remain (amounts, dates, line items, plate linkage retained only to the extent counsel directs). This is an irreversible action, audited, Owner-only. **Counsel required** to confirm exactly which fields must be erased vs retained, and whether plate linkage may survive anonymization of the person.

## 6. Security controls mapped to the architecture

| Control | Where implemented | UU PDP relevance |
|---|---|---|
| RBAC + outlet scoping | Server-side role/outlet guard per endpoint (Appendix A); cross-outlet denial audited (AC16.4) | Least privilege; limits who can read personal data |
| Audit log | Append-only, DB-trigger protected; Owner-only view | Accountability, breach investigation |
| Encryption in transit | TLS 1.2+ via Caddy for all client–server traffic (NFR-007) | Confidentiality/integrity |
| Encryption at rest | Backups encrypted (NFR-009); DB volume encryption depends on buyer host — recommended LUKS/disk-level encryption on the VPS; **not enabled by default in Compose** — buyer/host decision | Confidentiality of stored personal data |
| Backups | `pg_dump` every 15 min to an encrypted off-host copy (NFR-009 targets RPO ≤ 15 min, RTO ≤ 2 h); pgBackRest optional | Availability/resilience; encryption of the personal data in backups |
| Key management | Backup encryption keys generated once at install, stored **off the same host** as the backups they unlock (e.g., buyer's password manager or a separate disk); rotation procedure documented in the ops runbook | Prevents a single host compromise from unlocking both data and backups |
| Password storage | Better Auth adaptive salted hashing (scrypt by default; configured to strongest available); plaintext never stored or logged | Confidentiality of credentials |
| Session & device revocation | Web httpOnly cookies (SameSite=Lax, Secure); mobile bearer tokens hashed at rest; per-device revocation by Owner/Admin and by the user themselves | Limits blast radius of a stolen device |
| Rate limiting | Login-failure counters in Postgres (5 failures → lockout + backoff, AC2.2); failures logged without the attempted password | Brute-force mitigation |
| Logs & PII hygiene | No passwords, tokens, OTPs, emails, or phone numbers in application logs or error output (PD-02) | Data minimization in operational telemetry |
| Staff accounts & offboarding | Owner creates/deactivates staff (US-01); deactivation blocks login immediately; historical orders and audit entries remain intact (AC1.5) | Access revocation on role change or departure |

## 7. Data subject request (DSR) workflow

Who receives the request → who acts → what the tooling provides:

1. **Intake:** a data subject (customer, staff member) contacts the workshop directly (walk-in, phone, WhatsApp). Requests are **not** digital-first in MVP — the product does not provide a public request portal (out of scope §2.3).
2. **Identity verification:** the Owner verifies identity in person or via known contact details — process step, not product code.
3. **Action via the product:**
   - *Access/export:* Owner runs the per-subject export (JSON/CSV). Audited.
   - *Correction:* permitted roles edit the fields directly (Appendix A). Audited.
   - *Deletion/anonymization:* Owner runs the anonymize action (§5, §6). Audited. If any **retained** financial row must stay per counsel, the anonymize action leaves it intact and explains the retention on screen.
4. **Response:** the Owner responds to the subject within the timeline counsel advises (**Counsel required** — UU PDP specifies a statutory window; not restated here as it is not an engineering fact).
5. **Record:** the DSR itself (who asked, when, what was done) is recorded via the audit log entries generated by steps 3a/3c, so the buyer can evidence compliance later.

**Buyer duty the tooling cannot cover:** deciding whether a request is *manifestly unfounded or excessive* under UU PDP, and any refusal decision — those are counsel-guided, not engineering decisions.

## 8. Handover duties (personal-data specific)

The implementer transfers the system **clean of live personal data**:

| # | Duty | Evidence at handover |
|---|---|---|
| H1 | **No real personal data in the delivered repository or images** — only synthetic seed/QA fixtures (§4 asset table in the license inventory) | Seed files visible in `packages/db` |
| H2 | **Deletion of development copies** — all vendor-side databases, backups, test devices, and screenshots containing any real data (if pilot-phase testing ever used real customer data) are destroyed; documented with a signed deletion note | Handover checklist |
| H3 | **Subprocessor disclosure** — delivered product bundles no subprocessors; any vendor-hosted pilot used during implementation is disclosed, and the buyer decides whether to keep or exit it (Tier 3 founder decision, DPA required if kept) | Handover checklist |
| H4 | **Incident contacts** — vendor post-handover security-contact endpoint (or explicit statement that none exists, per the support contract PRD D-10) and buyer's own breach-runbook contacts | `docs/ops/runbook` (WP9 deliverable) |
| H5 | **Restore rehearsal** — one documented restore from backup to a scratch host, timed against RTO ≤ 2 h (NFR-009), witnessed by the buyer | Ops runbook (WP9 acceptance) |
| H6 | **Privacy-notice template + DSR worksheet** — delivered as fill-in documents the buyer's counsel finalizes | Handover docs |

## 9. Open counsel-review items (explicit, not exhaustive)

| # | Item | Why open |
|---|---|---|
| C1 | Lawful bases for each data category (§3) | PRD §7.2 candidates are assumptions, not counsel conclusions |
| C2 | Retention period for transactional/payment records (§5, NFR-010) | 10 years is a default assumption; Indonesian bookkeeping/tax law exactness must be confirmed |
| C3 | Breach-notification timelines and regulator thresholds (§4, PRD §7.6) | Statutory specifics not restated in engineering docs |
| C4 | DPO applicability for a small workshop business (§1) | Threshold for mandatory DPO under UU PDP |
| C5 | Deletion vs financial-record retention (§5, D-6) | Which fields must be erased vs preserved; whether plate linkage survives |
| C6 | Privacy-notice content in Bahasa Indonesia (§4) | Template delivered; counsel finalizes wording |
| C7 | Any cross-border transfer if the buyer chooses non-Indonesian hosting (§4, D-3) | UU PDP transfer assessment required |
| C8 | Whether any post-MVP feature (e.g., WhatsApp follow-up) would change lawful bases or require consent (out of MVP scope) | Only relevant if buyer adds such features later |

---

*No application code, CI pipelines, or git hooks are created by this document. Version/license evidence lives in `docs/ops/license-inventory.md`; architecture rationale lives in `docs/adr/0001-stack-and-architecture.md`.*
