# Competitive Landscape — Workshop POS in Indonesia

| Field | Value |
|---|---|
| Document | Competitive landscape for a source-code handover sale |
| Research date | 2026-11-26 |
| Method | Desk research of vendor-owned public pages (pricing, product/feature, help centre) |
| Products reviewed | 8 (4 general POS, 4 workshop-specific) |
| Evidence standard | Every factual cell cites a public URL or is marked `NOT VERIFIED` |
| Prepared for | Buyer-facing positioning, not an independent product audit |

**How to read this document.** Vendor pages are treated as claims a vendor makes about its own product, not as independently tested facts. `NOT VERIFIED` means *no public evidence was found in the pages reviewed*. It does **not** prove the capability is absent. Prices are as displayed on 2026-11-26 and can change; taxes are noted only where the vendor states them.

---

## 1. Method, date, and inclusion criteria

### 1.1 What was done

- Reviewed the official pricing page and at least one official product/feature or help-centre page for each included product.
- Captured only what the vendor publishes: segments served, surfaces (web/mobile), stated capabilities, public price, and billing model.
- Cross-checked pricing against the vendor's own feature page where both exist (for example, Kasir Pintar's pricing page and its bengkel page).
- Did not run trials, request demos, sign contracts, interview customers, or inspect any competitor's source code.
- Did not use review sites, affiliate listicles, or vendor-published customer counts as evidence of capability or quality.

### 1.2 Inclusion criteria

A product was included only if **all** of the following held on 2026-11-26:

1. It is marketed to Indonesian businesses, and either (a) explicitly markets a workshop/bengkel offering, or (b) is a general Indonesian POS whose published feature set is directly comparable on at least three of the comparison axes.
2. A public pricing page or an explicit public pricing model exists.
3. At least one public page documents product capabilities beyond a hero headline.
4. The page was live and readable on the research date.

### 1.3 Exclusions and why

| Product | Reason not included |
|---|---|
| KelolaBengkel | Public pricing section loads dynamically and did not render in the captured page; per-branch price could not be verified. Feature evidence exists, price does not. [S17] |
| PaYou | Search surfaced a public service page, but no public price was captured on the pages reviewed. [S18] |
| My Garage | Search surfaced a landing page, but no public price was captured on the pages reviewed. [S19] |
| Omegasoft, Turboly, Bengkel Motor Indonesia | Mentioned in search results; public pricing not captured within this review window, so they are not scored. |
| Pawoon | No current public pricing page was captured during this review. Not scored rather than scored on possibly stale data. |

Excluding a product is not a negative judgment of it. It means this document could not verify the required cells from public sources on the research date.

### 1.4 Limits

- A vendor may ship a capability without documenting it publicly. Absence of a claim is recorded as `NOT VERIFIED`, not as "no".
- Feature names differ across vendors. The comparison uses the buyer's four tests: mixed parts + labor on one transaction, plate-centric vehicle history, offline selling, and inventory control.
- No claim is made about market share, revenue, customer counts, churn, or satisfaction. Vendor-published counts are deliberately excluded from the analysis.

---

## 2. Comparison table

Legend: **Yes** = vendor publicly states the capability. **Partial** = vendor states a limited or conditional version. **NOT VERIFIED** = no public evidence found in reviewed pages. Every row's final column lists the exact sources.

| Product | Segment served | Web / mobile surfaces | Mixed products + services | Plate / vehicle history | Offline capability | Inventory | Public pricing model | Sources |
|---|---|---|---|---|---|---|---|---|
| **Majoo** | General POS for UMKM; publishes a bengkel & spare-parts vertical under "Prime Jasa" | Android, iOS, Windows hardware (vendor FAQ); browser back office not stated | **Partial** — "Produk Jasa" is listed only in the Prime tier; a single receipt mixing parts and labor is not documented | **NOT VERIFIED** — "Service Record" and "Treatment Record" appear as *coming soon* under Prime+ | **Partial** — only Prime lists a "Local Server" option "tanpa koneksi internet"; lower tiers are online | **Yes** — inventory management; stock transfer, production, batch/serial in higher tiers | Subscription per outlet/month: Starter Rp249,000; Advance Rp499,000; Prime Rp999,000; Prime+ quote-only; prices exclude PPN | [S1] [S2] |
| **Moka POS** | General POS; F&B/retail SMB, multi-outlet | Android and iOS apps; web back office login | **NOT VERIFIED** — no parts-plus-labor transaction flow on reviewed pages | **NOT VERIFIED** — no vehicle or plate record on reviewed pages | **Partial** — offline transactions are recorded, but the vendor's own help article documents backup and manual refresh when offline data fails to sync | **Yes** — stock management; advanced inventory and ingredients | Subscription per outlet/month: Basic Rp299,000; Pro Rp499,000; Enterprise Rp799,000; PPN treatment not stated | [S3] [S4] |
| **Olsera** | General POS; retail, F&B, and a separate service vertical ("Zenwel by Olsera") | Android, iOS, Windows POS apps; owner app; cloud back office | **NOT VERIFIED** — service businesses are routed to a separate product; a mixed parts + labor receipt is not documented | **NOT VERIFIED** — no plate/vehicle history feature found on reviewed pages | **Yes** — vendor states the POS keeps selling offline and syncs on reconnect | **Yes** — inventory management, transfers, waste, low-stock alerts | Annual subscription: Basic Rp1,288,000/yr (list Rp1,888,000); Premium Rp1,988,000/yr; Pro Rp2,688,000/yr; excludes PPN | [S5] [S6] [S7] [S8] |
| **Kasir Pintar** | General POS with a dedicated bengkel/carwash offer | Android, iOS, Huawei/Samsung stores; Windows desktop plugin; web back office | **Yes** — separates spare-part and service categories; add-on services within one service transaction; service + spare-part bundles via Business plugin | **Yes** — vendor states plate and vehicle data are recorded and service history is stored | **Yes, paid add-on** — separate POS Offline plugin; requires Pro + plugin subscription; login and at least daily server connectivity still required | **Yes** — stock, stock opname, low-stock; stock separated from service revenue | Pro Rp666,000/yr; bengkel page advertises "from Rp56,000/month"; offline plugin billed separately (price not published on reviewed pages) | [S9] [S10] [S11] |
| **Tuneup** | Workshop-specific SaaS: motorcycle, car, AC/accessories, spare-part retail | Browser on phone or laptop; native app not stated | **Yes** — service and spare-part detail per transaction | **Yes** — vendor states history by plate, phone, or owner name, including parts replaced and mechanic notes | **No** — vendor states "100% Online" | **Yes** — automatic stock deduction, low-stock alert, purchase orders, stock cards | Pay-as-you-go: Rp200 per service transaction; Rp100 per retail transaction; no monthly fee | [S12] |
| **Kasgo Bengkel** | Workshop-specific Android app: motorcycle, car, spare parts | Android APK only (Android 10+), one device; no web back office | **Yes** — service and spare parts on one nota/work order | **Yes** — service history per plate number | **Yes** — vendor states 100% offline operation, data stored on the phone | **Yes** — stock auto-decrement, stock card, backup/restore | One-time Rp165,000 promotional (list Rp250,000); one Android device; one year of updates | [S13] |
| **Bee (Beeaccounting Bengkel)** | Workshop plus spare-part retail; desktop accounting suite | Windows desktop (vendor demo is Windows); mobile for this edition not stated | **Yes** — work order/PKB contains services and parts; revenue split between service and parts | **Yes** — vehicle service history recorded | **NOT VERIFIED** — desktop install, but offline/licensing behaviour is not documented on the reviewed page | **Yes** — auto-deduct per transaction, minimum stock, stock reports | Licence fee per computer (renewal terms not stated): Silver Rp5.5m; Gold Rp7m; Platinum Rp10m; additional computer Rp2.1m; mechanic commission add-on Rp1m | [S14] |
| **BengkelPro** | Workshop-specific cloud SaaS: motorcycle and car workshops | Browser (cloud); native mobile not stated | **Yes** — invoice automatically combines service labour and spare parts | **Yes** — history per plate/nopol, odometer, and oil-change record | **NOT VERIFIED** — cloud system; no offline mode stated | **Yes** — automatic deduction, low-stock alerts, inter-branch transfers | Subscription per month: Starter Rp299,000; Professional Rp699,000; Enterprise Rp1,999,000; 7-day trial | [S15] |

---

## 3. What the market already covers

These observations matter because they prevent an indefensible pitch.

1. **Plate-centric history is not an empty category.** Kasir Pintar, Tuneup, Kasgo, Bee, and BengkelPro all publicly claim vehicle service history, and four of them explicitly key it to the plate number. [S10] [S12] [S13] [S14] [S15]
2. **Mixed parts + labor is table stakes in the workshop segment.** Kasir Pintar, Tuneup, Kasgo, Bee, and BengkelPro all claim it in some form. [S10] [S12] [S13] [S14] [S15]
3. **Offline is real but uneven.** Olsera and Kasgo claim it directly; Kasir Pintar sells it as a separate plugin; Majoo limits it to its top tier with local-server hardware; Moka documents offline data plus a manual recovery procedure. [S1] [S4] [S6] [S11] [S13]
4. **Three of the four general POS vendors do not treat the workshop as a first-class data model.** Majoo's vehicle "Service Record" is listed as coming soon; Olsera routes service businesses to a separate product; Moka's reviewed pages show no vehicle/plate concept. Kasir Pintar is the exception, with a dedicated bengkel page. [S1] [S3] [S8] [S10]
5. **Pricing is anchored to a unit of consumption or ownership, not to source.** Per outlet per month (Majoo, Moka), per year (Olsera, Kasir Pintar), per transaction (Tuneup), per device (Kasgo), or per computer (Bee). No reviewed vendor publishes a source-code or self-hosted option. [S1] [S3] [S5] [S9] [S12] [S13] [S14]

---

## 4. The gap this product fills

### 4.1 The honest gap statement

The gap is **not** "workshop software without vehicle history". The gap is **ownership and architectural control at a workshop-specific feature level**:

> Every reviewed vendor sells access to a vendor-controlled cloud product, a device-bound app, or a per-computer licence, charged by outlet, year, transaction, device, or computer. No reviewed vendor offers the combination of transferable source code, buyer-hosted deployment, and a model with no per-transaction or per-outlet fee. [S1] [S3] [S5] [S9] [S12] [S13] [S14]

This is a statement about the eight reviewed vendors' public material, not a claim about the entire Indonesian market.

### 4.2 Positioning statement

> **For the workshop owner who wants the system to be an asset, not a subscription:** a plate-centric workshop POS delivered as transferable TypeScript source, self-hostable on the buyer's own PostgreSQL and Docker Compose infrastructure, covering mixed parts-and-labor sales, server-authoritative stock, and offline-tolerant Android selling — with no per-outlet, per-transaction, or per-device fee after handover.

### 4.3 The three defensible pillars

| Pillar | What the buyer actually gets | Why the reviewed incumbents do not match it publicly |
|---|---|---|
| **Source ownership** | The TypeScript monorepo, database schema, migrations, and deployment files transfer to the buyer; the buyer can rename, rebrand, and extend without a vendor roadmap | Reviewed vendors sell subscriptions, device licences, or computer licences; no source transfer is published [S1] [S5] [S13] [S14] |
| **Self-hosting** | One installation on the buyer's infrastructure serves one workshop business; PostgreSQL and Docker Compose; no mandatory paid SaaS runtime | Reviewed products are vendor-hosted cloud services, vendor-licensed desktop binaries, or a device-bound APK; none is buyer-hosted source [S3] [S6] [S12] [S13] [S15] |
| **Unmetered operation** | No per-outlet, per-transaction, per-device, or per-computer fee after handover; internal cost is infrastructure and support, not a vendor meter | Reviewed pricing is unit-priced: outlet/month, year, transaction, device, or computer [S1] [S3] [S5] [S9] [S12] [S13] [S14] |

**Supporting product truth (from the PRD, not from competitor inference):** one order holds products and services with one total, one payment set, and one receipt; plate is normalized and unique per business; stock is server-authoritative with offline queueing and surfaced conflicts; voids, overrides, price edits, and exports are audited; money is integer IDR. [S16]

---

## 5. Buyer-facing differentiation bullets

These are written to be defensible in a sales conversation. Each bullet states what is delivered, not an adjective.

- **The vehicle is the record, not a note field.** Plate input `b 1234 xyz`, `B 1234 XYZ`, and `B1234XYZ` resolve to one vehicle, unique per workshop; the vehicle carries chronological orders, items, mileage, and payment status across visits and outlets of the same business. This normalisation rule is specified and testable, not left to free-text search. [S16 §1.4, FR-024, BR-006]
- **One transaction, one total, one receipt — even when the job mixes parts and labor.** A single order accepts product and service lines, an order-level discount, tax, and split payment across cash, bank transfer, and QRIS (recorded manually), then produces one receipt. [S16 §2.2 C4]
- **Offline selling does not become a separate product or a top-tier upgrade.** The Android counter queues sales locally, syncs idempotently, and surfaces stock conflicts for explicit resolution; server stock remains authoritative. [S16 §2.2 C8, BR-011]
- **Stock has a ledger, not just a number.** Every decrement, stock-in, adjustment, and override writes an append-only row with before/after quantity, actor, and reason; below-zero stock requires an authorised override. [S16 §2.2 C6, BR-005]
- **Sensitive actions leave a trail.** Voids require a reason and a permitted role; paid voids are Owner-only with full reversal; price/cost edits, overrides, and CSV exports are audited. [S16 §3 US-09, US-20]
- **The buyer owns the deployment and the brand.** Product name, logo, receipt branding, tax settings, and data location are buyer-configurable; the delivery is an original implementation with no third-party admin-template code or assets. [S16 PR-7, PR-8]
- **No metered bill after handover.** The commercial model is a handover, not a subscription; the buyer's recurring cost is their own infrastructure and support, not a per-outlet or per-transaction fee. [S16 §1.4, NFR-011]
- **Built on boring, portable infrastructure.** TypeScript monorepo, Next.js web, Expo/React Native Android, PostgreSQL, Docker Compose, permissive licences only, and no mandatory paid SaaS runtime. [S16 fixed constraints]

> **Claim discipline:** bullets 1–6 describe specified product behaviour; bullet 8 describes specified delivery constraints. They must be re-checked against the delivered build before being published as "available now". This document is not a code audit. See §8 decision D3.

---

## 6. Risks

### 6.1 Incumbent distribution

| Risk | Evidence | Consequence |
|---|---|---|
| Established vendors own the search and sales channel | Majoo, Moka, and Olsera all run demo/sales funnels and publish 24-hour or call-centre support; Majoo and Olsera publish workshop-adjacent vertical pages [S1] [S3] [S5] | A source-code offer will not win on inbound discovery. It must be sold directly to owners who already know they want ownership. |
| Hardware and payment bundling | Majoo sells device + subscription bundles; Moka lists QRIS/e-wallet acceptance; Olsera integrates QRIS, marketplaces, couriers, and financing [S1] [S3] [S5] | Buyers comparing "what is in the box" will see more in an incumbent bundle. The handover must be sold on control, not breadth. |
| Category trust | Olsera publishes ISO 27001/27701 certification and scale claims; Majoo publishes customer-scale claims [S1] [S5] | A one-off codebase has no comparable certification or operating history. Expect procurement friction. |

### 6.2 Switching costs

- **Data gravity.** Customer, vehicle, and stock history sit inside the incumbent's cloud. No data importer is specified in the MVP; only CSV export is in scope. A buyer switching from an incumbent therefore needs a paid migration service or manual re-entry. [S16 §2.2 C7]
- **Annual prepayment.** Olsera bills annually; Majoo and Moka sell per-outlet subscriptions. A buyer mid-term has already paid, which delays switching. [S1] [S3] [S5]
- **Retraining.** Cashiers and mechanics have habits in the incumbent UI. The delivered product is Bahasa Indonesia and Android-first, but it is still a new flow. Budget for supervised pilot days, not a same-day cutover. [S16 §1.2]
- **Adjacent features left behind.** Buyers using loyalty, payroll, accounting, marketplace, or online ordering lose those in the MVP because they are explicitly out of scope. [S16 §2.3]

### 6.3 Support expectations

- Reviewed incumbents advertise 24-hour support, live chat/WhatsApp, onboarding, and in some cases on-site or dedicated support. [S1] [S3] [S5]
- After handover, the buyer's team is the support organisation. Without a written warranty window, runbook, and escalation path, the first production incident becomes a trust crisis.
- The product handles personal data (owner name, phone, plate linked to a person, service and payment history). Under the handover premise the buyer becomes the Data Controller for UU PDP purposes; have the buyer's counsel confirm this and cover support staff access with the buyer's own retention rules.
- **Do not imply vendor-grade SLAs.** State plainly: source handover includes a defined defect-fix window and documentation, not 24/7 operations.

### 6.4 Feature-breadth and price-anchoring risk

| Anchor | Public number | Effect on the handover conversation |
|---|---|---|
| Kasgo Bengkel | Rp165,000 one-time, one Android device [S13] | Sets a very low "one-time workshop app" anchor. The handover must be differentiated by source, web back office, roles, and server-side stock — not by "also one-time". |
| Bee Bengkel | Rp5.5m licence fee per computer (renewal terms not stated) [S14] | A realistic one-time-feeling anchor for a desktop workshop suite, but still vendor-controlled and per-machine. |
| Kasir Pintar | Rp666,000/year Pro; bengkel page advertises from Rp56,000/month [S9] [S10] | A low annual SaaS anchor with plate history and an offline add-on. Feature parity alone will not justify a handover price. |
| Tuneup | Rp200 per service transaction [S12] | Aligns the buyer's mental model with "pay when you sell", which is the opposite of ownership. |
| Majoo / Moka / Olsera | Rp249k–Rp999k per outlet/month; Rp1.288m–Rp2.688m per year [S1] [S3] [S5] | The buyer may compare a one-time handover fee with 3–5 years of subscription. Frame the comparison over the ownership horizon, with support and infrastructure costs included. |

### 6.5 Product and delivery risks to disclose

- **No accounting, payroll, AP/PO, payment gateway, loyalty, CRM, e-commerce, or multi-tenant SaaS.** These are explicit exclusions, and several incumbents bundle them. [S16 §2.3]
- **QRIS is recorded, not generated.** No payment-gateway integration means no automatic settlement or reconciliation against an acquirer. [S16 §2.3]
- **Offline conflict handling is a workflow, not magic.** The product surfaces conflicts; a human must resolve them. Cashiers must be trained on the conflict inbox.
- **Hardware coverage is not field-verified in this document.** 58/80 mm thermal printing from Android and low-end device performance are specified targets, not results observed across a device fleet. [S16 §2.2 C9]
- **No independent security audit or licence scan is cited here.** The permissive-licence constraint is a delivery requirement; verify the actual dependency tree and licence inventory at acceptance.

---

## 7. Claims and sources

### 7.1 Competitor claims used in this document

| Claim | Source | Status |
|---|---|---|
| Majoo Starter/Advance/Prime are Rp249k/499k/999k per outlet/month, excluding PPN | [S1] | Verified on vendor pricing page, 2026-11-26 |
| Majoo offers a bengkel/spare-parts "Prime Jasa" vertical | [S2] | Verified on vendor page |
| Majoo lists "Produk Jasa" only in the Prime tier | [S1] | Verified on vendor pricing page |
| Majoo lists "Service Record"/"Treatment Record" as coming soon under Prime+ | [S1] | Verified on vendor pricing page |
| Majoo's "Local Server" offline option is listed under Prime | [S1] | Verified on vendor pricing page |
| Moka Basic/Pro/Enterprise are Rp299k/499k/799k per outlet/month | [S3] | Verified on vendor pricing page |
| Moka supports Android and iOS apps plus web back office | [S3] | Verified via app-store and back-office links on pricing page |
| Moka records offline transaction data and documents manual backup/refresh when sync fails | [S4] | Verified in vendor help centre |
| Olsera Basic/Premium/Pro are Rp1.288m/1.988m/2.688m per year (promotional), excluding PPN | [S5] | Verified on vendor pricing page |
| Olsera keeps selling offline and syncs on reconnect | [S6] [S7] | Verified on vendor pages |
| Olsera routes service businesses to "Zenwel by Olsera" | [S8] | Verified on vendor site |
| Kasir Pintar Pro is Rp666,000/year; bengkel page advertises from Rp56,000/month | [S9] [S10] | Verified on vendor pages |
| Kasir Pintar records plate/vehicle data and service history; separates spare parts and services | [S10] | Vendor claim on product page |
| Kasir Pintar's offline mode is a separate plugin requiring Pro plus plugin subscription; login and daily server connectivity still required | [S11] | Verified in vendor product/help page |
| Tuneup charges Rp200 per service transaction and Rp100 per retail transaction, with no monthly fee | [S12] | Verified on vendor pricing section |
| Tuneup states "100% Online" | [S12] | Vendor claim on product page |
| Tuneup stores history by plate, phone, or owner, including KM | [S12] | Vendor claim in FAQ |
| Kasgo Bengkel is one-time Rp165,000 (promo, list Rp250,000), one Android device, one year of updates | [S13] | Vendor claim on product page |
| Kasgo works 100% offline with data stored on the phone | [S13] | Vendor claim on product page |
| Kasgo stores service history per plate and puts service + spare parts on one nota | [S13] | Vendor claim on product page |
| Bee Bengkel is Rp5.5m/7m/10m for Silver/Gold/Platinum per computer; extra computer Rp2.1m; renewal/perpetuity terms not stated | [S14] | Verified on vendor pricing section |
| Bee records vehicle service history and includes services + parts in PKB | [S14] | Vendor claim on product page |
| BengkelPro is Rp299k/699k/1.999m per month for Starter/Professional/Enterprise | [S15] | Verified on vendor pricing section |
| BengkelPro combines service and parts on one invoice and keeps history per nopol | [S15] | Vendor claim on product page |
| No reviewed vendor publishes source-code transfer or self-hosting | [S1] [S3] [S5] [S9] [S12] [S13] [S14] [S15] | **Reviewed-page finding**, not a market-wide proof |

### 7.2 Product claims used in this document

| Claim | Source | Status |
|---|---|---|
| One order mixes products and services with one total, one payment set, one receipt | [S16] §1.4, §2.2 C4 | Specified in PRD v1.0-draft |
| Plate is normalized (uppercase, separators stripped), unique per workshop, with history across visits | [S16] §1.4, FR-024, BR-006 | Specified in PRD |
| Offline queue, idempotent sync, surfaced conflicts, server-authoritative stock | [S16] §2.2 C8, BR-011 | Specified in PRD |
| Append-only stock ledger, authorized negative-stock override | [S16] §2.2 C6, BR-005 | Specified in PRD |
| Void with reason; paid void Owner-only; audit log for sensitive actions | [S16] §3 US-09, US-20 | Specified in PRD |
| Buyer-configurable name, logo, receipt branding, tax settings; original UI implementation | [S16] PR-7, PR-8 | Specified in PRD |
| TypeScript monorepo, Next.js, Expo/React Native, PostgreSQL, Docker Compose, permissive licences only | [S16] fixed delivery constraints | Specified, not independently audited in this document |
| Accounting, payroll, supplier AP/PO, payment gateway, loyalty, CRM, e-commerce, multi-tenant SaaS are out of MVP scope | [S16] §2.3 | Specified in PRD |

### 7.3 Assumptions (explicitly not facts)

- **Assumption:** a buyer who requests source-code ownership values modification and vendor independence more than bundled accounting, loyalty, or marketplace integrations. No buyer interviews were conducted for this document.
- **Assumption:** the buyer's workshop has intermittent connectivity and Android devices at the counter. The PRD treats this as a design premise; no field measurement exists.
- **Assumption:** buyers compare a one-time handover fee against several years of subscription, not against a single month. No price-elasticity evidence exists.

---

## 8. Open founder decisions

| ID | Decision | Why it is open |
|---|---|---|
| D1 | Handover price and commercial structure: outright sale, source licence, or licence plus support retainer | Public anchors range from Rp165k one-time (single-device app) to Rp10m per computer (desktop suite) to Rp999k per outlet per month (full SaaS). The handover is a different category, so no direct anchor exists. |
| D2 | Primary buyer: single-outlet owner-operator, or multi-outlet group that needs customisation | Single-outlet buyers are price-sensitive and closest to Kasgo/Kasir Pintar. Multi-outlet groups justify source ownership but demand more features (accounting, payroll) that are out of scope. |
| D3 | Which claims may be published as "available now" versus "in delivery" | This document describes the specified MVP. Publishing feature claims before acceptance testing would violate the evidence standard. |
| D4 | Support and warranty scope after handover | Incumbents advertise 24-hour support. The handover needs an explicit, narrower promise (for example, a defect-fix window and documentation) rather than an implied SLA. |
| D5 | Data migration offer | The MVP exports CSV but has no importer. Decide whether migration is manual, a paid service, or out of scope. |
| D6 | Language and channel | UI is Bahasa Indonesia; this strategy document is English. Decide whether the public sales page is Indonesian-first and whether technical docs remain English. |
| D7 | Whether to publish pricing publicly | Incumbents publish list prices (Majoo, Moka, Olsera, Kasir Pintar, Tuneup, Kasgo, Bee, BengkelPro). A quote-only handover is defensible but reduces comparability. |
| D8 | Legal review of comparative claims | Statements such as "no per-transaction fee" are factual about this product, but comparative advertising should be reviewed before publication. |

---

## 9. Sources

All URLs accessed 2026-11-26.

| ID | Source | URL |
|---|---|---|
| S1 | Majoo — pricing and tier features | https://majoo.id/harga |
| S2 | Majoo — bengkel & spare-parts / Prime Jasa page | https://majoo.id/bisnis/aplikasi-kasir-dan-point-of-sale-bengkel-spare-parts |
| S3 | Moka POS — pricing and feature comparison | https://www.mokapos.com/harga |
| S4 | Moka POS Help Centre — offline data, backup, refresh | https://help.mokapos.com/cara-selesaikan-offline-data-cegah-data-transaksi-tidak-sinkron-di-aplikasi |
| S5 | Olsera — pricing | https://www.olsera.com/id/pricing |
| S6 | Olsera — offline/online cashier | https://www.olsera.com/id/kasiroffline |
| S7 | Olsera — complete features | https://www.olsera.com/en/pos/features |
| S8 | Olsera — service vertical (Zenwel) shown on the vertical page | https://www.olsera.com/en/pos/bengkel |
| S9 | Kasir Pintar — pricing | https://kasirpintar.co.id/harga |
| S10 | Kasir Pintar — bengkel/carwash solution | https://kasirpintar.co.id/bengkel |
| S11 | Kasir Pintar — POS Offline plugin requirements | https://kasirpintar.co.id/pos_offline |
| S12 | Tuneup — workshop POS, features, PAYG pricing | https://www.tuneup.id/ |
| S13 | Kasgo Bengkel — work order, plate history, offline, pricing | https://kasgo.id/bengkel |
| S14 | Bee — software bengkel features and pricing | https://www.bee.id/fitur/software-bengkel |
| S15 | BengkelPro — features, pricing, FAQ | https://bengkelpro.net/ |
| S16 | Product Requirements Document v1.0-draft (internal product truth) | PRD §1.4, §2.2, §2.3, §3, PR-7, PR-8, BR-005, BR-006, BR-011 |
| S17 | KelolaBengkel — feature and pricing page (price did not render) | https://kelolabengkel.id/ |
| S18 | PaYou — service/bengkel page (no public price captured) | https://payou.asia/service |
| S19 | My Garage — landing page (no public price) | https://my-garage-landing.vercel.app/ |

---

## 10. Bottom line

The workshop category already sells plate history, mixed parts-and-labor tickets, and inventory. Offline is available, but usually as an add-on, a top-tier local server, or a desktop plugin. **The unoccupied position is not a feature — it is ownership:** transferable source, buyer-hosted PostgreSQL, no metered fee after handover, and a workshop-specific data model that a general POS treats as a vertical landing page rather than a schema.

Sell against Kasir Pintar on source ownership and unmetered operation (not on web back-office presence — it has one), against Tuneup on metering, against Kasgo on multi-user server architecture and web surface, and against Majoo/Moka/Olsera on workshop data depth and self-hosting. Do not claim to be the only product with plate history; that claim is false on the public record.
