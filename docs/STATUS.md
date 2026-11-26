# Delivery Status — Workshop POS

| Field | Value |
|---|---|
| Product | Workshop POS (working name; buyer may rebrand) |
| Phase | Kickoff — planning artifacts only |
| Date | 2026-11-26 |
| Code status | No application code, CI pipeline, or git hook exists yet |
| Next gate | Buyer approval of the open decisions below, then WP1 |
| Source of truth | `docs/product/PRD.md`, `docs/adr/0001-stack-and-architecture.md`, `docs/plan/work-packages.md` |

> **Honesty rule.** This page reports what exists and what has been verified. Documents are not proof that the product works. No build, test, migration, deployment, printer, or browser check has been run because there is no application code yet.

---

## 1. Milestones

| Milestone | Scope | Exit criteria | Status |
|---|---|---|---|
| **M1 — Walking skeleton** | WP1: npm-workspaces monorepo, pinned Node, `.env.example`, Compose dev/prod, Postgres, Dockerfiles, `scripts/check.sh`, license report, health endpoint, minimal page/API | A fresh clone reaches a healthy web + database stack with standard Docker/Node tooling; `scripts/check.sh` exits 0; license report has no blocker | **Not started** |
| **M2 — MVP** | WP2–WP8: schema/seed, auth/RBAC/outlets, catalog + stock ledger, customers/vehicles/history, mixed orders + payments + receipts, offline mobile POS + sync, reports/audit/export/settings, hardening gate | Every PRD story US-01–US-20 passes its acceptance criteria; offline/conflict, money, stock, and RBAC tests are green; no license blocker; WCAG 2.2 AA checks pass on agreed screens | **Not started** |
| **M3 — Handover-ready** | WP9: accessibility sign-off, backup/restore drill, fresh-clone deployment rehearsal, license re-audit, documentation and credential handover | `docs/ops/handover-checklist.md` is fully checked with captured evidence; restore drill meets RPO/RTO targets; buyer accepts the signed manifest | **Not started** |

---

## 2. Artifact status

| Artifact | Purpose | Status |
|---|---|---|
| `docs/product/PRD.md` | Buyer-facing requirements, 20 testable stories, business rules, NFRs, personal-data inventory | Draft for buyer review |
| `docs/ui/research/kickoff-2026-11-26.md` | Desk research, task flows, heuristics, accessibility risks | Draft; evidence and assumptions separated |
| `docs/marketing/competitors.md` | Cited Indonesian workshop POS landscape and positioning | Draft; vendor claims labeled, gaps marked `NOT VERIFIED` |
| `docs/adr/0001-stack-and-architecture.md` | Stack, data, auth, offline sync, deployment, cost range, rejected alternatives | Proposed |
| `docs/ops/license-inventory.md` | Dependency/license/transferability evidence | Draft; one condition remains (`REVIEW`) |
| `docs/product/personal-data.md` | Buyer-as-Controller obligations and engineering controls | Draft; counsel review required |
| `docs/ui/DESIGN.md`, `state-matrix.md`, `tokens.json` | Original clean-room design system shared by web and mobile | Draft for review |
| `docs/plan/work-packages.md` | WP1–WP9, owned paths, dependencies, acceptance gates, PRD traceability | Proposed |
| `docs/ops/handover-checklist.md` | Seller pre-delivery verification and evidence checklist | Draft; **not executed** |
| `docs/ops/decision-policy.md` | Tier 1/2/3 decision authority for the buyer's team | Draft |
| `README.md`, `AGENTS.md` | Buyer setup guide and engineering rules | Draft; commands are WP1 deliverables |
| `.omp/`, `orca.yaml`, `.worktreeinclude` | Optional development aids | Present; may be stripped at handover |

---

## 3. License and transferability status

| Item | Status | Action |
|---|---|---|
| Original product code | MIT (repository `LICENSE`) | Keep copyright notice; confirm seller identity at handover |
| Runtime dependencies | MIT / Apache-2.0 / ISC / BSD / PostgreSQL License only | Re-run lockfile license report in WP1 and WP9 |
| Ecme Next template (ThemeForest) | **Not transferable for this package** | Excluded; clean-room visual language only. Do not copy source, demo assets, or brand assets |
| Epson ePOS SDK (via thermal printer wrapper) | **REVIEW — legal decision** | Buyer counsel confirms redistribution terms before the native sink ships; otherwise ship the PDF/browser fallback |
| Docker Desktop | Informational | Production hosts should use Docker Engine on Linux; Desktop licensing is separate |
| Maestro Studio / Cloud | Not included | CLI only, if adopted; do not add commercial tiers to cost assumptions |
| shadcn/ui (web components) | MIT, copied source | Retain the MIT notice in `THIRD_PARTY_NOTICES.md`; listed in the license inventory |
| Inter font | OFL-1.1 | Self-host with the license text; do not imply endorsement |
| IBM Plex Mono font | OFL-1.1 | Self-host with the license text; used only for plates and receipt numerals |
| Illustrations, logo, sample data | Must be original or licensed | No template or stock assets without an inventory entry |

**Rule:** a new dependency or asset is not accepted until it has a verified SPDX license and a transferability status in `docs/ops/license-inventory.md`.

---

## 4. Privacy status

- The **buyer is the Data Controller** after handover; the implementer is a processor during the build.
- Personal data includes staff accounts, customer contact data, plate/VIN linked to a person, payment references, service history, and audit records.
- Engineering controls are specified: server-side RBAC, outlet isolation, hashed credentials, no PII in logs, encrypted transport, encrypted backups, append-only audit, export/anonymization tooling.
- **Counsel required:** lawful basis, privacy notice, retention duration, deletion-vs-bookkeeping conflict, breach notification timelines, cross-border transfer, and any registration duty.
- If the buyer chooses managed hosting or any third-party processor, a processor agreement and transfer assessment are required before go-live.

---

## 5. Open decisions

### Buyer/product decisions (from PRD §8.3)

| ID | Decision | Recommendation |
|---|---|---|
| D-1 | Tax rounding convention | Half-up to the nearest rupiah; confirm with tax counsel |
| D-2 | Cashier discount cap default | 0%; Admin/Owner approval is audited |
| D-3 | Hosting model and region | Buyer-hosted in Indonesia if ops capacity exists; otherwise managed with a DPA |
| D-4 | Receipt numbering | Per-outlet sequential with buyer-set prefix |
| D-5 | Plate uniqueness scope | Whole business, across outlets |
| D-6 | Deletion semantics | Anonymize personal fields, preserve financial/audit records per counsel |
| D-7 | Product name and branding | Buyer-owned; keep the working name until rebrand |
| D-8 | Retention duration | 10 years until counsel confirms |
| D-9 | Certified printer models | Protocol-generic ESC/POS first; publish a tested-model list after pilot |
| D-10 | Support/warranty terms | Commercial contract, not a product requirement |
| D-11 | Payment correction before `PAID` | Allow audited Admin/Owner correction; post-`PAID` remains whole-order void only |
| D-12 | Cycle count in MVP | Include if monthly counts are expected; otherwise defer and use stock adjustments |

### Commercial and handover decisions

| Topic | Why it is open |
|---|---|
| Commercial structure | Outright source sale, source license, or license plus support retainer changes the license and support obligations |
| Target buyer | Single-outlet owner-operator versus multi-outlet group changes onboarding and deployment assumptions |
| Template treatment | Confirm clean-room exclusion, or obtain written permission from the template author for the intended transfer; the default is exclusion |
| Managed hosting | Adds a processor relationship, recurring cost, and a DPA; self-hosting avoids it but requires buyer ops capacity |
| Publishable claims | Competitor comparison claims must be re-checked against the delivered build before publication |
| Keep or strip `.omp/`, `orca.yaml`, `.worktreeinclude` | Buyer preference at final handover; the product must run without them |

---

## 6. Risks

| Risk | Impact | Mitigation | Owner |
|---|---|---|---|
| Template licensing mistaken for transferable | Legal claim, forced rework, delivery delay | Clean-room design; license inventory blocker; written buyer acknowledgement | Seller + buyer counsel |
| Offline sync loses or double-books a sale | Wrong stock and money; trust loss | Durable outbox, idempotency keys, server-authoritative stock, conflict UI, fault-injection tests | Engineering |
| Printer SDK terms or hardware incompatibility | Receipts fail at the counter | Sink interface with PDF/browser fallback; pilot a tested printer list | Engineering + buyer |
| Scope grows beyond MVP | Delay and quality dilution | PRD out-of-scope list; change control via decision policy | Buyer product owner |
| Personal-data obligations are underestimated | Regulatory exposure | Data inventory, counsel review, DPA, retention/anonymization tooling | Buyer as Controller |
| Buyer lacks ops capacity for self-hosting | Outages, poor backups | Compose runbook, backup drill, optional managed hosting with DPA | Buyer |
| Dependency license drift | Handover blocker | Lockfile license report in WP1 and WP9; inventory update per dependency | Engineering |

---

## 7. Verification performed in this kickoff

| Check | Result |
|---|---|
| Repository state | Clean before kickoff; only `LICENSE` tracked; branch `main` |
| Git hooks path | Unset; no hooks installed by this kickoff |
| Application gates | **Not run** — no application code exists |
| Secret scan | **PASS on the current tree.** `gitleaks dir .` and `gitleaks git` on 2026-11-26 found no leaks. Re-run both on the frozen handover candidate per the checklist. |
| License verification | Each planned dependency checked against npm registry or upstream license on 2026-11-26 |
| Document neutrality | **PASS on the current tree** — no local paths, internal names, private registries, or credentials. Re-scan the final commit before delivery. |
| Structural checks | 0 broken Markdown links; `orca.yaml` and `.omp/config.yml` parse as YAML; `tokens.json` parses as JSON; 71/71 FR defined |
| Design contrast | 39 token pairs verified from hex values with 0 mismatches; rendered UI and device checks belong to WP8/WP9 |

---

## 8. Approved kickoff decisions

Recorded 2026-11-26 from the product owner. These close the corresponding open questions for implementation; they do not replace legal or tax counsel.

| Topic | Decision | Consequence |
|---|---|---|
| Template treatment | **Clean-room only.** No Ecme source, demo asset, or brand asset is included. Web UI starts from **shadcn/ui (MIT)** components copied into the repo and styled with project tokens | UI follows the documented visual language; no Envato transfer is required |
| Web UI basis | **shadcn/ui (MIT)** + Radix + Tailwind, restyled to the Ecme-inspired tokens | Fast shell without a commercial-template licence; buyer owns the copied component source |
| Buyer model | **Single workshop**, internal use | No multi-tenant SaaS build; one installation serves one business |
| Hosting | **Buyer-operated VPS with Docker Compose** | Buyer owns the database and backups; no vendor processor by default |
| Stack | **Next.js + Expo/React Native + PostgreSQL** | Follow ADR-0001; no Laravel/Flutter rewrite |
| Printer | **Interface plus pilot**: native ESC/POS only after legal confirmation, with PDF/browser fallback | Epson SDK remains `REVIEW`; fallback ships regardless |
| Retention | **10 years, anonymize personal fields on deletion request** | Preserve financial/audit records; counsel still confirms duration |
| Branding | **“Workshop POS” placeholder** until the buyer supplies name/logo | No invented brand assets |
| P1 scope | **Include audited pre-`PAID` payment correction and cycle count** | FR-048 and FR-056 are MVP; QA must map them to their stories |

**Still open before production:** Epson SDK redistribution terms, tax rounding confirmation, privacy notice and retention counsel, and the buyer's support/warranty contract.

## 9. Next actions

1. Obtain buyer counsel review for the Epson SDK redistribution terms, the privacy notice, retention duration, and tax rounding; record the signed outcomes.
2. Approve WP1 scope and its acceptance criteria in `docs/plan/work-packages.md`.
3. Open WP1: walking skeleton, `.env.example`, Compose, `scripts/check.sh`, license report, health endpoint. No CI or hooks until WP8.
4. After WP1 is green, start file-disjoint WPs per `docs/plan/work-packages.md`; shared contracts and database schema land before consumers.
