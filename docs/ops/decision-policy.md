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
| DEC-0001 |  |  |  |  |  |  |  |  |

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

Log rules:

- Append only. Correct a mistake by adding a new entry that supersedes the old one and explains the correction.
- A Tier 3 entry records the rollback and the review date. A temporary exception records its expiry.
- Link evidence, not secrets. Never paste a credential, token, or personal record into the log.
- The log is part of the handover. The buyer's team should be able to read it without asking the seller what happened.

Illustrative entry (not a real decision):

```text
### DEC-0007 — Keep tax rounding at the line level

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
