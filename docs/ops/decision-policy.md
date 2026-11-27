# Decision Policy

| Field | Value |
| --- | --- |
| Status | **Draft** |
| Version | 0.1 |
| Date | 2026-11-26 |
| Applies to | The Workshop POS product, its data, and its operation |
| Policy owner | The buyer's product owner (named at handover) |
| Review | Review after the first 30 days, then quarterly; update the version and date rather than silently editing history |

This document is a working agreement for who decides what. It is not legal, tax, or accounting advice. Items marked as legal or personal-data decisions must be reviewed by the buyer's own counsel.

---

## 1. Purpose

A small team moves quickly when it knows which decisions it may make alone and which need a second person. This policy exists to:

- keep routine engineering work unblocked;
- prevent user-visible or irreversible changes from happening by accident inside a refactor;
- make the reasoning behind important decisions findable later;
- make sure legal, privacy, security, and spending decisions are made by the people accountable for them.

## 2. Scope

In scope:

- application code, tests, and internal tooling;
- database schema, migrations, and stored data;
- user-visible behavior, copy, and permissions;
- dependencies, licenses, and third-party assets;
- deployment, infrastructure, backups, and production access;
- personal data handling, retention, and third-party processors;
- any recurring or one-off spend.

Out of scope:

- the buyer's employment decisions, commercial pricing, and contracts with their own customers, except where the software must implement them;
- the seller's internal business after handover.

## 3. Principles

1. **Decide at the lowest tier that fully covers the impact.** A typo fix does not need a product-owner meeting; a production data deletion is not a pull-request comment.
2. **Reversible and invisible is Tier 1. Visible or persistent is Tier 2. Irreversible, legal, costly, production, or security-sensitive is Tier 3.**
3. **Silence is not approval.** A decision is approved only when the named approver records it in writing.
4. **A pull request is not an approval.** Reviewing code is not the same as accepting a user-visible behavior change or a production risk.
5. **When unsure, escalate one tier up.** The cost of a short conversation is lower than the cost of an accidental production change.
6. **Security and legal can veto.** A security or legal reviewer may stop a change regardless of tier. Resolve the objection or escalate to the owner.
7. **Record decisions, not just outcomes.** The log explains why, what was rejected, and what would reverse it.
8. **Decisions are append-only.** Do not rewrite a past decision; supersede it with a new entry and link both.
9. **Bundling is not allowed.** A Tier 2 or Tier 3 change must not ride along inside a Tier 1 refactor.
10. **Emergency changes still get a record.** Verbal approval followed by a written entry within one business day is acceptable; no record at all is not.

## 4. Decision tiers

### Tier 1 — Internal technical choices

**Decider:** the implementer.

**Consult:** whoever reviews the change; no approval required.

These choices do not change what a user sees, what data is stored, what a dependency costs, or how production behaves. The implementer may proceed and should state "Tier 1" plus a one-line reason in the pull request.

Examples for a POS:

- refactoring an internal module, renaming a private function, or moving code without changing behavior;
- adding or restructuring tests, fixtures, or test helpers;
- choosing a formatting, lint, or type-check rule within the project's existing toolchain;
- changing internal log messages, error codes, or trace fields that users do not see;
- adding documentation, comments, or a developer script;
- adding a database index in a migration that will be reviewed as Tier 2 before it runs against production (the local migration itself is Tier 1; applying it to production is not);
- a patch or minor dependency update that stays inside the approved license allowlist, keeps the lockfile strategy, and does not change a public API the product relies on;
- changing the order of steps inside CI, as long as the same checks still run and no secret or deployment behavior changes;
- adding a feature flag that defaults to off and is not exposed to users.

Tier 1 stops being Tier 1 when any of these becomes true:

- a user can see or feel the difference;
- the database stores a new kind of value, or existing values change meaning;
- a new dependency, vendor, account, or license appears;
- production needs a manual step, a restart outside the normal process, or elevated access;
- the change touches authentication, authorization, personal data, money, tax, or audit logs.

### Tier 2 — User-visible behavior or data-model changes

**Decider:** the buyer's product owner.

**Consult:** engineering lead; operations if a deployment or migration is involved; counsel if the change may affect tax, statutory receipts, or personal data (then treat it as Tier 3).

These changes alter what a cashier, workshop owner, or customer experiences, or they change the meaning or shape of stored data. They need a written proposal and a recorded approval before merge.

Examples for a POS:

- changing receipt or invoice layout, including which fields appear and in what order;
- changing rounding, discount display, or the order in which tax and discount are applied (if the result affects a statutory invoice or tax report, escalate to Tier 3);
- changing void, refund, or discount approval rules, or who can perform them;
- adding or removing a field on a customer, vehicle, product, sale, or payment record;
- a migration that backfills or rewrites existing rows;
- changing offline behavior in a way the cashier can observe, such as conflict resolution, queue order, or what happens when the connection returns;
- changing role permissions that are visible in the UI, even if the underlying authorization code is unchanged;
- changing Bahasa Indonesia UI copy, error messages, or empty states;
- adding a report, dashboard, or metric, or changing how an existing number is calculated;
- changing barcode scanning behavior, default page size, search semantics, or keyboard shortcuts;
- changing what appears in an export or printout;
- changing the retention period shown to users for their own history.

A Tier 2 proposal must include:

- the user-visible change, in one paragraph and with screenshots for UI work;
- acceptance criteria in Given/When/Then form;
- the data impact: what is read, written, migrated, or deleted;
- the migration and rollback plan, including a backup step if data is rewritten;
- the effect on offline use, printing, and existing records;
- the product owner's recorded approval and date.

### Tier 3 — Irreversible, legal, spend, production, or security changes

**Decider:** the owner (the person accountable for the business), with counsel and operations as needed.

**Never delegated to an implementer.** A Tier 3 change needs a written decision record before it happens, and for production changes a runbook and a verified backup.

Examples for a POS:

**Data and irreversibility**

- deleting production data, dropping a table or column, or truncating records;
- a destructive migration, a bulk update of live records, or a schema change that cannot be rolled back;
- deleting backups, shortening backup retention, or disabling point-in-time recovery;
- rewriting Git history, force-pushing a shared branch, deleting a repository, or deleting a release;
- transferring a domain or changing nameservers.

**Money, tax, and payments**

- changing tax calculation in a way that affects statutory invoices, tax reports, or the amount a customer pays;
- onboarding live QRIS, card acquiring, or another payment provider;
- switching payment providers or merchant accounts;
- changing refund, settlement, or reconciliation rules;
- any new recurring cost, paid tier, vendor, or cloud resource;
- changing the hosting region or a service tier that affects cost or data location.

**Personal data and legal**

- collecting a new category of personal data, or using existing data for a new purpose;
- changing the retention period, deletion procedure, or privacy notice;
- adding a subprocessor or transferring personal data outside Indonesia;
- responding to a data-subject request in a way that deletes or exports records;
- signing or changing a data processing agreement, SLA, warranty, or contract term;
- changing the product's license, or adding a dependency with a reciprocal license such as GPL, AGPL, LGPL, or SSPL;
- releasing the mobile app to a public store.

**Security and production**

- granting, changing, or revoking production access;
- changing authentication, session lifetime, password policy, or encryption;
- rotating or revoking a production key in a way that can interrupt service;
- disabling audit logging, reducing log retention, or turning off a security control;
- accepting a known security finding without a fix;
- deploying outside the documented window, or rolling back a live release;
- disclosing a security incident to customers or regulators.

A Tier 3 request must include:

- the decision, stated as a yes/no question;
- at least two options, including "do nothing";
- the blast radius: users, records, money, legal exposure, and security exposure;
- reversibility, and the exact rollback or compensating action;
- the cost, including recurring cost and who pays;
- the effective window and the person who will execute it;
- the approver's name and the approval date;
- counsel sign-off where the item is legal, tax, or personal-data related;
- a second reviewer for security-sensitive changes;
- the review date for any temporary exception. An exception without an expiry date is not approved.

## 5. Roles

| Role | Tier 1 | Tier 2 | Tier 3 |
| --- | --- | --- | --- |
| Implementer / engineer | Decides | Proposes; implements after approval | May prepare the change; never approves it |
| Reviewer | Reviews for correctness | Reviews; may reclassify upward | Reviews technical safety |
| Product owner | Informed if relevant | **Decides** | Co-approves with the owner when user behavior is affected |
| Owner / founder | Informed | Informed | **Accountable approver** for spend, legal, and business risk |
| Operations / SRE | Informed | Consulted on deploy and migration | Approves production execution, backup, and rollback readiness |
| Counsel | — | Consulted if tax, statutory, or personal data is touched | **Sign-off required** for legal, tax, and personal-data items |
| Security reviewer | May review | Consulted if auth or data is touched | Can veto; approval required for security exceptions |

One person may hold more than one role in a small team. The roles still have to be exercised separately: the person who writes the change should not be the only person who approves a Tier 3 production action.

## 6. Escalation format

Use this format for any Tier 2 or Tier 3 request. One decision per request. Keep it short enough to read on a phone.

```text
DECISION REQUEST
ID:                 DEC-<number>
Date:
Requester:
Tier:               2 | 3
Decision needed by:          (date and time, with timezone)
Summary:            (one paragraph, plain language)
Options considered:
  1. <option> — cost, risk, reversibility
  2. <option> — cost, risk, reversibility
  3. Do nothing — consequence
Recommended option and why:
Affected users:
Affected data:
Money impact:                (one-off, recurring, who pays)
Legal / tax / privacy impact: (counsel required? yes/no)
Security impact:
Rollback or undo plan:
Approver(s):
Decision:
Decision date:
Rationale:
Follow-ups and owners:
Links:              (pull request, ADR, ticket, runbook)
```

Guidance:

- State the deadline. "As soon as possible" is not a deadline.
- If the request is urgent and the full decision cannot wait, propose the smallest reversible mitigation, get the on-call owner's approval, and record the full decision afterward. Do not make the irreversible part of the change during the emergency.
- If the requester cannot name the rollback, the request is not ready for Tier 3 approval.
- If the approver is unavailable, escalate to the owner or wait. Do not self-approve a Tier 3 change.

## 7. Decision log

Keep the log with the project, in this file or in the buyer's tracker. Every approved Tier 2 and Tier 3 decision gets an entry. Tier 1 decisions do not need a log entry unless they later turn out to be more consequential than expected.

Summary table:

| ID | Date | Tier | Decision | Context | Decider | Approver | Status | Link |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| DEC-0001 | 2026-11-26 | 3 | Lock an identifier for 15 minutes after 5 consecutive failed logins | WP3 auth rate limiting (PRD AC2.2, NFR-007) | Founder | Founder | implemented | WP3 brief; WP3 implementation |
| DEC-0002 | 2026-11-26 | 3 | Passwords are at least 8 characters and contain a letter and a digit | WP3 credential policy (NFR-007) | Founder | Founder | implemented | WP3 brief; WP3 implementation |
| DEC-0003 | 2026-11-26 | 3 | The Owner role is provisioned only; the staff API cannot create or grant it | Prevent privilege escalation from the users screen (FR-001, FR-003) | Founder | Founder | implemented | WP3 brief; WP3 implementation |
| DEC-0004 | 2026-11-26 | 3 | Web sessions have a 12-hour absolute lifetime, in addition to the per-outlet idle timeout | Session lifetime is a Tier 3 security parameter (NFR-007, FR-070) | Founder | Founder | implemented | WP3 implementation |
| DEC-0005 | 2026-11-26 | 3 | Mobile bearer tokens expire after 30 days and can be revoked per device | Token lifetime is a Tier 3 security parameter (ADR-0001 §3.4) | Founder | Founder | implemented | WP3 implementation |
| DEC-0006 | 2026-11-26 | 2 | Outlet create/edit is Owner-only (`manage_outlets`), an explicit extension of Appendix A under FR-009 | Appendix A has no outlet CRUD row; FR-009 assigns it to the Owner | Product owner (reference-matching) | decision-reviewer | implemented | WP3 implementation |
| DEC-0007 | 2026-11-26 | 2 | Add an Owner-only "Buka kunci" action (audited) to clear a staff account's login lockout | A 5-request lockout DoS had no in-product recovery; an audited Owner action restores operations without changing any other role's permissions | Product owner | Founder | implemented | WP3 repair round |
| DEC-0008 | 2026-11-26 | 3 | The outlet idle timeout applies to the mobile bearer surface as well as the web cookie surface | FR-002/NFR-007 are not surface-scoped; the 30-day token TTL remains a separate absolute cap | Founder | Founder | implemented | WP3 repair round |
| DEC-0009 | 2026-11-26 | 3 | Login-attempt identifiers are retained for 30 days and then pruned | Identifier rows are personal data (PD-01) and grow from an unauthenticated path; 30 days supports abuse investigation | Founder | Founder | implemented | WP3 repair round |
| DEC-0010 | 2026-11-26 | 2 | Any role assigned to more than one active outlet may switch the active outlet | FR-001/FR-004 are normative and not role-limited; WP4+ must filter outlet-scoped reads by the session's active outlet | Product owner | Founder | implemented | WP3 repair round |
| DEC-0011 | 2026-11-26 | 3 | A bounded in-process per-IP throttle blocks 30 failed logins per 15 minutes; edge/IP throttling remains WP8 | The founder-approved unlock option also required an IP throttle; NAT-aware 30/15 keeps a shared office working | Founder | Founder | implemented | WP3 repair round 2 |
| DEC-0012 | 2026-11-27 | 2 | A payment row stores the money applied to the balance (not the cash tendered); change is `change_amount`; paid-total reads use `sum(amount)` | BR-009 defines balance due as total − sum(payments); the merged WP2 refund trigger requires refund amount = payment amount; WP5's `sum(amount − change)` was written before any payment existed | Product owner (reference-matching) | decision-reviewer | implemented | WP6 implementation; `vehicle-service.ts`, `customer-service.ts` read-site correction |
| DEC-0013 | 2026-11-27 | 2 | `PAID` is terminal except `VOID` per BR-007 (AC6.2's later completion is rejected); partially paid voids refund every tender; a pre-`PAID` correction that covers the total reaches `PAID`; edits may not drop the total below collected money | BR-007/AC8.1, BR-009, BR-008, and D-11 settle these; AC6.2's narrative conflicts with the transition table | Product owner (reference-matching) | decision-reviewer | implemented | WP6 implementation |
| DEC-0014 | 2026-11-27 | 2 | Keep an audited pre-`PAID` payment-row delete for Admin/Owner (beyond FR-048's method/amount/reference correction) and treat `SALINAN` as a print *attempt* | Duplicate or mis-keyed tenders need removal without voiding the sale; the browser cannot confirm paper output | Founder | Founder | implemented | WP6 design review; founder decision 2026-11-27 |

Status values: `proposed`, `approved`, `rejected`, `implemented`, `reverted`, `superseded`.

Entry template:

```text
### DEC-<number> — <short title>

- Date:
- Tier:               2 | 3
- Status:             proposed | approved | rejected | implemented | reverted | superseded
- Requester:
- Decider:
- Approver(s):
- Context:            what problem or trigger led to this decision
- Options:            the options that were seriously considered
- Decision:           what was decided, in one or two sentences
- Rationale:          why this option, and why not the others
- Consequences:       what becomes easier or harder, and what is now forbidden
- Rollback:           how to undo it, or "not reversible"
- Follow-ups:         owner and date for each open action
- Links:              pull request, ADR, runbook, evidence
- Supersedes:         DEC-<number>, if any
```

### DEC-0001 — Lockout after five failed logins

- Date: 2026-11-26
- Tier: 3
- Status: implemented
- Requester: engineering (WP3)
- Decider: Founder
- Approver(s): Founder
- Context: PRD AC2.2 requires rate limiting after five consecutive failures; the duration was not specified.
- Options: 5 minutes (faster recovery, weaker resistance); 15 minutes (chosen); 30 minutes (stronger, more counter friction).
- Decision: Five consecutive failures lock the identifier for 15 minutes; a success or expiry resets the streak.
- Rationale: Slows guessing without blocking a full shift; the Owner can restore a staff account.
- Consequences: Locked staff wait or ask the Owner; attempts are recorded without the password.
- Rollback: Change the policy constant and its tests; no data migration.
- Follow-ups: Keep the lockout copy in Bahasa Indonesia in sync.
- Links: WP3 brief, `packages/auth/src/rbac.ts`, `packages/auth/src/login-attempts.ts`.
- Supersedes: none

### DEC-0002 — Password composition policy

- Date: 2026-11-26
- Tier: 3
- Status: implemented
- Requester: engineering (WP3)
- Decider: Founder
- Approver(s): Founder
- Context: Better Auth defaults to a minimum length; the product needed an explicit staff-credential policy.
- Options: 8 characters only (upstream default); 8 characters with a letter and a digit (chosen); 12 characters with composition.
- Decision: Minimum 8 characters, at least one letter and one digit, maximum 256. Hashing stays with Better Auth's adaptive salted default.
- Rationale: Blocks the weakest passwords without inventing a proprietary hashing path.
- Consequences: Provisioning and staff creation reject non-conforming temporary passwords.
- Rollback: Change the contract schema and tests; existing hashes remain valid.
- Follow-ups: None.
- Links: WP3 brief, `packages/contracts/src/auth.ts`, `packages/contracts/src/users.ts`.
- Supersedes: none

### DEC-0003 — Owner role is provisioned only

- Date: 2026-11-26
- Tier: 3
- Status: implemented
- Requester: engineering (WP3)
- Decider: Founder
- Approver(s): Founder
- Context: FR-001 lists Owner as a role, and FR-009 gives staff management to the Owner; granting Owner from the staff API would allow accidental or malicious escalation.
- Options: Allow Owner creation with audit; restrict the Owner role to the provisioning path (chosen).
- Decision: The users API/UI can create and assign Admin, Cashier, and Mechanic only. Owner accounts come from the provisioning path; Owner rows cannot be deactivated or re-roled through staff management.
- Rationale: Keeps the highest privilege out of routine UI flows; provisioning remains a deliberate operator action.
- Consequences: A second owner requires the provisioning path; support must document that step.
- Rollback: Add the Owner role to the assignable set with an explicit approval; no schema change.
- Follow-ups: Document the Owner provisioning step for the buyer.
- Links: WP3 brief, `packages/contracts/src/users.ts`, `packages/auth/src/users.ts`.
- Supersedes: none

### DEC-0004 — Absolute web-session lifetime

- Date: 2026-11-26
- Tier: 3
- Status: implemented
- Requester: engineering (WP3)
- Decider: Founder
- Approver(s): Founder
- Context: FR-070 configures an idle timeout per outlet (default 30 minutes). A stolen or shared browser session also needs an absolute cap independent of activity.
- Options: 8 hours (one shift); 12 hours (chosen); 24 hours (more convenience, higher shared-device risk).
- Decision: A web session can live at most 12 hours from creation even with continuous activity; inactivity still ends it at the outlet's configured timeout.
- Rationale: Covers a long shift plus overtime while forcing a daily re-authentication.
- Consequences: Staff sign in again after 12 hours; no data migration.
- Rollback: Change `POLICY.absoluteSessionHours` and its tests.
- Follow-ups: Keep the CMS/ops note aligned if the shift model changes.
- Links: WP3 implementation, ADR-0001 §3.8, PRD NFR-007.
- Supersedes: none

### DEC-0005 — Mobile bearer token lifetime

- Date: 2026-11-26
- Tier: 3
- Status: implemented
- Requester: engineering (WP3)
- Decider: Founder
- Approver(s): Founder
- Context: The Android app needs a bearer token that survives offline periods but can be revoked; ADR-0001 fixes the hashed-at-rest design but not the lifetime.
- Options: 7 days; 30 days (chosen); 90 days.
- Decision: Device tokens expire after 30 days. Only the SHA-256 digest is stored; Owner/Admin and the user can revoke a device; logout revokes immediately.
- Rationale: Balances counter reliability with a bounded misuse window.
- Consequences: Devices re-authenticate monthly; revocation takes effect on the next request.
- Rollback: Change the token TTL constant; existing tokens keep their stored expiry.
- Follow-ups: WP7 must handle expiry by prompting an online re-login and clearing its outbox state safely.
- Links: WP3 implementation, ADR-0001 §3.4, PRD NFR-007.
- Supersedes: none

### DEC-0006 — Outlet management permission

- Date: 2026-11-26
- Tier: 2
- Status: implemented
- Requester: engineering (WP3)
- Decider: Product owner (reference-matching)
- Approver(s): decision-reviewer
- Context: PRD Appendix A is the normative permission matrix, but it has no row for outlet creation or editing. FR-009 says the Owner creates and edits outlets.
- Options: Reuse the Owner-only settings row; add an explicit Owner-only `manage_outlets` action (chosen).
- Decision: `manage_outlets` is Owner-only. Admin, Cashier, and Mechanic cannot list, create, or edit outlets through management APIs; the session still carries outlet names for display and switching.
- Rationale: Keeps Appendix A unchanged while making FR-009 testable and explicit.
- Consequences: Outlet CRUD is audited and Owner-only; a future matrix change requires a new decision.
- Rollback: Remove the action and map outlet CRUD to `manage_settings`; no data change.
- Follow-ups: Add the row to Appendix A at the next PRD revision.
- Links: WP3 implementation, PRD FR-009, `packages/auth/src/rbac.ts`.
- Supersedes: none

### DEC-0007 — Owner unlock for a locked staff account

- Date: 2026-11-26
- Tier: 2
- Status: implemented
- Requester: engineering (WP3)
- Decider: Product owner
- Approver(s): Founder
- Context: A known identifier can be locked with five wrong passwords, and there was no in-product recovery short of waiting or direct database access.
- Options: Owner-only audited unlock; per-IP throttle only; accept with a manual SQL runbook.
- Decision: The Owner can clear a staff account's login-attempt rows from the users screen. The action is audited with actor, target, and reason; no other role gains it.
- Rationale: Restores operations quickly while keeping the 5-failure lock and leaving the permission matrix otherwise unchanged.
- Consequences: A new Owner-only action appears in the staff screen; it cannot unlock the Owner account if the Owner is themselves locked (wait for expiry or use the documented recovery path).
- Rollback: Remove the route/UI and the audit action; login attempts remain.
- Follow-ups: Add the action to the next PRD Appendix A revision.
- Links: WP3 repair round, `packages/auth/src/users.ts`, `apps/web/app/api/v1/users/[id]/unlock`.
- Supersedes: none

### DEC-0008 — Mobile bearer idle timeout

- Date: 2026-11-26
- Tier: 3
- Status: implemented
- Requester: architecture review (WP3)
- Decider: Founder
- Approver(s): Founder
- Context: The web session enforced the outlet idle timeout, but the bearer path only had a 30-day TTL; FR-002 and NFR-007 are not surface-scoped.
- Options: Enforce the idle timeout on bearer requests (chosen); exempt mobile and record the exemption.
- Decision: A bearer request whose last use exceeds the active outlet's idle timeout is rejected and the device token is revoked. The 30-day TTL remains.
- Rationale: Closes the silent gap; the offline outbox is unaffected because sync is an online write and can prompt re-authentication.
- Consequences: WP7 must handle an idle-revoked token by prompting an online re-login and keeping queued data safe.
- Rollback: Remove the idle comparison from the bearer path; the TTL remains.
- Follow-ups: WP7 re-auth UX; keep the idle copy in Bahasa Indonesia.
- Links: WP3 repair round, PRD FR-002/NFR-007, ADR-0001 §3.4.
- Supersedes: none

### DEC-0009 — Login-attempt retention

- Date: 2026-11-26
- Tier: 3
- Status: implemented
- Requester: security/architecture review (WP3)
- Decider: Founder
- Approver(s): Founder
- Context: `login_attempts` stores attacker-supplied email/username/phone identifiers and had no retention or cap.
- Options: 24 hours; 30 days (chosen); 90 days.
- Decision: Keep attempt rows for 30 days, prune touched keys on each login, and run a bounded global prune of rows older than 30 days.
- Rationale: Enough history for abuse investigation while bounding personal-data retention and table growth.
- Consequences: Older attack patterns are no longer queryable; the lock window itself is only 15 minutes.
- Rollback: Change the retention constant and the prune helper.
- Follow-ups: WP8 adds an edge/IP throttle for cross-identifier floods.
- Links: WP3 repair round, PD-01, `packages/auth/src/login-attempts.ts`.
- Supersedes: none

### DEC-0010 — Multi-outlet scoped staff may switch outlets

- Date: 2026-11-26
- Tier: 2
- Status: implemented
- Requester: architecture review (WP3)
- Decider: Product owner
- Approver(s): Founder
- Context: FR-001 and FR-004 allow any staff member to have multiple outlet assignments and to switch the active outlet; the WP3 brief only required the Owner case, and the guard initially denied scoped roles.
- Options: Allow switching for any role with more than one assigned active outlet (chosen); restrict scoped roles to exactly one outlet.
- Decision: The active-outlet switch is available to any authenticated role with more than one active outlet. A single-outlet user gets no switcher; an out-of-scope target is denied and audited.
- Rationale: Follows the normative PRD without changing the permission matrix.
- Consequences: WP4+ outlet-scoped reads must filter by the session's active outlet, not the full assigned list.
- Rollback: Restrict switching to Owner/Admin and enforce single-outlet assignment for scoped roles.
- Follow-ups: WP4 query helpers must consume `activeOutletId` for `O`-scoped actions.
- Links: WP3 repair round, PRD FR-001/FR-004, `packages/auth/src/guard.ts`.
- Supersedes: none

### DEC-0011 — Bounded per-IP login throttle

- Date: 2026-11-26
- Tier: 3
- Status: implemented
- Requester: security review (WP3)
- Decider: Founder
- Approver(s): Founder
- Context: The Founder's lockout-recovery choice bundled an Owner unlock with a per-IP attempt limit. The account-keyed lockout still allowed a caller rotating identifiers to spend the whole credential budget from one address.
- Options: In-process NAT-aware 30 failures / 15 minutes (chosen); 20 or 50 per 15 minutes; defer to an edge/reverse-proxy throttle.
- Decision: The public login route checks a bounded in-process per-IP counter before account resolution. The 30th failure blocks that address for 15 minutes with `RATE_LIMITED` and a countdown; successes do not reset it; the map is capped and time-pruned and never stores an IP in the database or logs. Edge/IP throttling across multiple app replicas remains WP8.
- Rationale: Closes the rotating-identifier half of the founder-approved control without penalising a normal shared office NAT.
- Consequences: A single aggressive client address is blocked for 15 minutes; a multi-process deployment needs the WP8 edge throttle for cross-replica coverage.
- Rollback: Remove the throttle module and its route wiring; the account lockout remains.
- Follow-ups: WP8 edge/IP throttle and monitoring; keep the Bahasa countdown copy.
- Links: WP3 repair round 2, `packages/auth/src/ip-rate-limit.ts`, `apps/web/lib/auth/http.ts`.
- Supersedes: none

Log rules:

- Append only. Correct a mistake by adding a new entry that supersedes the old one and explains the correction.
- A Tier 3 entry records the rollback and the review date. A temporary exception records its expiry.
- Link evidence, not secrets. Never paste a credential, token, or personal record into the log.
- The log is part of the handover. The buyer's team should be able to read it without asking the seller what happened.

Illustrative entry (not a real decision):

```text
### DEC-9999 (illustrative, not a real decision) — Keep tax rounding at the line level

- Date: 2026-11-26
- Tier: 2
- Status: approved
- Requester: engineering
- Decider: product owner
- Approver(s): product owner
- Context: receipts showed a one-rupiah difference from the workshop's manual calculation.
- Options: round per line; round at invoice total; keep the current per-line behavior and document it.
- Decision: keep per-line rounding and add a printed note explaining the total.
- Rationale: matches the existing tax report and avoids changing historical totals.
- Consequences: the printed total can differ by one rupiah from a manual sum.
- Rollback: revert the receipt template change; no data migration involved.
- Follow-ups: update the cashier guide (owner: product owner).
- Links: pull request and screenshots in the handover evidence.
- Supersedes: none
```


### DEC-0012 — Payment rows carry applied money

- Date: 2026-11-27
- Tier: 2
- Status: implemented
- Requester: engineering (WP6)
- Decider: product owner (reference-matching)
- Approver(s): decision-reviewer
- Context: WP6 must record split payments, cash change, and whole-order refunds. BR-009 defines balance due as `total − sum(payments)` and AC7.4 stores change separately; the merged WP2 refund trigger requires a refund amount to equal its payment amount.
- Options: (a) store the tendered cash and subtract change in every read; (b) store applied money and keep change in `change_amount`.
- Decision: option (b). A cash tender above the balance is stored as the applied amount plus the returned change; receipts print the tendered figure (`amount + change`); refunds reverse `amount`.
- Rationale: only (b) keeps `sum(payments) = total` at `PAID` and makes a whole-order refund return exactly the retained money. Option (a) over-refunds by the change amount and needs every caller to remember the subtraction.
- Consequences: paid-total aggregates read `sum(payments.amount)`. The two WP5 read sites that subtracted change (`vehicle-service.ts`, `customer-service.ts`) were corrected to `sum(amount)` — a cross-ownership change ratified by this entry. New code must not reintroduce `amount − change`.
- Rollback: revert the two read sites and the WP6 payment/receipt writers together; stored payment rows would need a data migration, so the convention is effectively one-way once real sales exist.
- Follow-ups: WP8 reports and CSV exports must use `sum(amount)` and subtract refunds; WP7's offline sink must send applied money (owner: WP8/WP7 leads).
- Links: WP6 brief; AGENTS.md "Payment rows carry applied money"; WP6 integration tests for cash change, split payment, and paid void refunds.
- Supersedes: none

### DEC-0013 — Settlement, void, and correction invariants for orders

- Date: 2026-11-27
- Tier: 2
- Status: implemented
- Requester: engineering (WP6)
- Decider: product owner (reference-matching)
- Approver(s): decision-reviewer
- Context: AC6.2 describes an order paid while in progress and "later completed", but BR-007's transition table has no `PAID → COMPLETED` and AC8.1 requires rejecting every pair outside the table. Partially paid orders can also be voided, and payment correction (D-11) can bring an order to a zero balance.
- Options: (a) allow `PAID → COMPLETED` as a benign extra edge; (b) keep BR-007 literal and prove exactly-once settlement by rejecting the later completion; (c) block voiding until payments are removed.
- Decision: option (b). `PAID` is terminal except `VOID`; stock settles at the earlier of `COMPLETED`/`PAID` through WP4's idempotent ledger write inside the order's transaction. A void refunds every recorded tender, including a partially paid order. A pre-`PAID` correction that covers the total sets `PAID`, `paid_at`, the timeline event, and stock. Line/header edits are rejected when the new total would fall below money already collected.
- Rationale: BR-007 and AC8.1 are the normative table and the rejection rule; AC6.2's exactly-once invariant is satisfied at the earlier settlement point. Refunding every tender is the only way a voided, partially paid sale leaves the drawer and the report honest. Rejecting an under-total edit is the only option without partial refunds (BR-008).
- Consequences: no partial refunds exist; a mis-keyed cash amount is corrected before `PAID`, never after. A PRD errata at the next revision should align AC6.2's wording with BR-007.
- Rollback: revert the relevant service paths and tests; no schema change is involved, but a migrated dataset with settled `PAID` orders must not be reopened casually.
- Follow-ups: PM adds the AC6.2 errata note (owner: product manager); WP8 excludes `VOID` orders from sales totals and uses refund rows for expected cash (owner: WP8 lead).
- Links: WP6 brief; PRD BR-005/BR-007/BR-008/BR-009; WP6 integration tests for partial void, correction-to-PAID, rollback, and under-total edits.
- Supersedes: none

### DEC-0014 — Pre-`PAID` tender deletion and `SALINAN` semantics

- Date: 2026-11-27
- Tier: 2
- Status: implemented
- Requester: engineering (WP6)
- Decider: Founder
- Approver(s): Founder
- Context: FR-048 lists method/amount/reference correction but not row deletion, yet a duplicate tender is a real counter mistake. Separately, the browser print path cannot prove that paper was produced, so the reprint stamp's meaning had to be chosen.
- Options: (a) restrict pre-`PAID` fixes to correction only; (b) keep an audited delete for Admin/Owner. For the stamp: (c) mark the next print attempt; (d) require a manual "printed" confirmation.
- Decision: option (b) and (c). Admin/Owner may delete a pre-`PAID` payment row with a reason and a before/after audit entry; the order lock keeps the balance consistent. `SALINAN` marks a repeat print attempt, and the first attempt of a document is the original.
- Rationale: (b) handles duplicate tenders without voiding the whole sale and keeps the audit trail; (c) is the only honest signal a browser can produce, and it never changes a figure.
- Consequences: post-`PAID` tenders stay immutable (the DB trigger and the service refuse); deletion is whole-row only, never a partial refund. A cashier who cancels the print dialog still consumes one attempt.
- Rollback: remove the DELETE route/handler and the dialog action; the stored audit rows remain append-only.
- Follow-ups: WP8 may add a "sudah tercetak" confirmation if the buyer wants confirmed-print tracking (owner: WP8 lead).
- Links: WP6 brief; founder decision 2026-11-27; WP6 payment tests.
- Supersedes: none

## 8. Suggested turnaround

These are defaults for a small team; the buyer may replace them.

| Tier | Target |
| --- | --- |
| Tier 1 | No wait; decide while working |
| Tier 2 | Decision within 2 business days; urgent user-facing regressions can be mitigated first and approved the same day |
| Tier 3 | Planned with enough lead time for counsel and operations; emergencies use the on-call owner and a written record within 1 business day |

If a decision will miss its target, say so before the deadline and state the interim behavior. Silence past a deadline does not authorize the change.

## 9. Anti-patterns

- Approving a production migration in a pull-request comment that only discusses code style.
- Calling a change "just a refactor" when it changes a receipt, a total, a permission, or a stored field.
- Bundling a vendor switch, a license change, or a data deletion into an unrelated feature branch.
- Treating a security exception as permanent because nobody set an expiry date.
- Recording the decision after the deployment, with the rationale reverse-engineered to match what happened.
- Editing an old log entry instead of superseding it.
- Using a personal account for a shared service, then calling that "ownership transfer".
- Relying on chat memory as the only record of a Tier 3 approval.

## 10. Conflicts and reclassification

- If two people disagree about the tier, the higher tier applies until the disagreement is resolved.
- Any reviewer may reclassify a change upward. The implementer may ask the product owner or owner to confirm, but the change waits until the correct approver decides.
- A security or legal objection stops the change regardless of who approved it. The owner resolves the conflict and records the resolution.
- If the policy does not cover a situation, apply the principles in section 3 and escalate one tier up. Then propose an update to this document.

## 11. Review

This policy is a Draft until the buyer's product owner adopts it. After adoption:

- review it after the first 30 days of operation;
- review it quarterly, and after any incident that exposed a missing or unclear decision;
- record changes as a new version with a date and a short changelog entry;
- do not delete past versions from the decision log.
