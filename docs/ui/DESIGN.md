# Workshop POS — Design System

**Design language name:** Lembar (the job-card language)
**Status:** Baseline for implementation and design QA
**Version:** 1.0.0
**Date:** 2026-11-26
**Applies to:** Web back-office (Next.js) and Android-first mobile app (Expo/React Native)
**Normative companions:** `docs/ui/tokens.json` (values), `docs/ui/state-matrix.md` (states and recovery)
**Product constraints:** `docs/product/PRD.md`, `docs/adr/0001-stack-and-architecture.md`
**Research input:** `docs/ui/research/kickoff-2026-11-26.md`

UI copy is Bahasa Indonesia. Documentation and code identifiers are English. All UI strings are product strings, not browser or library defaults.

---

## 0. How to use this document

1. **`tokens.json` is the single source of truth for values.** This document defines intent, usage rules, and composition. If a value here disagrees with `tokens.json`, the token file wins and this document is corrected.
2. **Both renderers consume the same semantic tokens.** Web maps them to CSS custom properties; mobile maps the same names to a React Native theme object. A component may not introduce a private color, spacing value, or type size outside the token set.
3. **Every screen must satisfy `docs/ui/state-matrix.md`.** A screen is not complete when the happy path renders; it is complete when loading, empty, error, permission-denied, offline, syncing, sync-conflict, destructive-confirmation, and success states are designed and implemented where applicable.
4. **No template assets or template code enter the product.** See §11.
5. **This system is original work.** Structural resemblance to the general category of admin dashboards (sidebar, top bar, cards, dense tables, CSS-variable theming) is a functional convention, not a copied expression.

---

## 1. Direction

### 1.1 The product in one sentence

A workshop counter tool where one transaction mixes spare parts and labor, every vehicle is found by its plate, and the day's money and stock stay explainable.

### 1.2 What the work environment requires

The design is shaped by the conditions in the kickoff research, not by a mood board:

- **Noisy, bright, sometimes gloved.** Feedback is visual and haptic, never sound alone. Primary mobile targets are large and generously spaced.
- **Time pressure at the counter.** The default path to a mixed sale and a receipt is the shortest path. Navigation is task-named, not module-named.
- **Intermittent connectivity.** Offline is a persistent, visible state with a queue and a conflict inbox — not a toast.
- **Money and stock are the trust surface.** Numbers are tabular, right-aligned, and never replaced by a plausible-looking zero when a fetch fails.
- **Shared, buyer-owned devices.** Identity is a fast PIN switch on mobile, a password session on web; the app must be safe to hand over between shifts.
- **Two surfaces, one product.** Web is a dense management console. Mobile is a one-handed selling and bay tool. They share tokens, components, typography, status language, and copy, but not navigation density.

### 1.3 The design idea: Lembar

The visual language borrows its structure from the **workshop job card and the stock ledger**, not from a marketing site:

- **A sheet with rules.** Tables, dividers, and aligned columns carry hierarchy. Cards are surfaces, not decorative containers.
- **A status rail.** Every order, job, and queued transaction carries a 3 px left rail whose color matches its lifecycle status, always paired with a text label. This is the one recurring signature element.
- **A document layer.** Plate numbers, receipt numbers, and timestamps sit in a monospaced layer that reads like a printed document and survives a photograph of a screen. Totals stay in tabular sans so they remain compact and legible.
- **Squared, practical geometry.** Small radii, visible 1 px rules, no floating pill-shaped everything, no glassmorphism, no decorative gradients.
- **Paper-white receipt preview.** The receipt is shown as paper inside the app, even in dark theme, because it represents a physical object that will be printed in black on thermal paper.

The result should feel like a well-run workshop's record book: calm, exact, slightly industrial, and trustworthy. Not playful, not luxurious, not "startup dashboard".

### 1.4 Principles

| # | Principle | Consequence |
|---|---|---|
| P1 | **Honest before polished** | A failed fetch shows `—` and an error with a retry, never `Rp 0`. Offline success says "Tersimpan di perangkat", never "Tersimpan". |
| P2 | **Money is legible, not loud** | Totals use weight and alignment, not giant gradients or colored cards. One number may be large per screen; the rest stay quiet. |
| P3 | **Status is text plus rail, never color alone** | Color is a second signal. Every lifecycle state has a Bahasa Indonesia label and, where repeated in lists, a stable position. |
| P4 | **Dense where scanning, generous where deciding** | Tables are compact (44 px rows); payment, void, and conflict decisions get full-width space and large targets. |
| P5 | **Touch first on mobile, keyboard first on web** | No hover-only information, no drag-only cart actions, no long-press-only commands. |
| P6 | **One product, two shells** | Shared tokens and components; web uses persistent navigation, mobile uses four task tabs and a bottom action bar. |
| P7 | **Low glare, high contrast** | Off-white canvas instead of pure white; charcoal canvas instead of pure black; body text at 5.5:1 or better. |
| P8 | **Nothing sensitive without a reason and a record** | Permission-denied copy names who can act. Destructive actions preview their financial and stock effect and require a reason where the domain requires one. |

### 1.5 Signature elements

Use these consistently; do not invent additional decorative motifs.

1. **Status rail** — 3 px vertical bar on the leading edge of order rows, job cards, queue items, and detail headers. The rail color follows the lifecycle mapping in §2.4; the adjacent label is mandatory.
2. **Document header** — order/receipt number, canonical plate, and timestamp in the mono layer, separated by rules rather than chips.
3. **Ruled table** — 1 px row dividers, a sunken header row, no zebra stripes by default, numeric columns right-aligned with tabular figures.
4. **Squared surfaces** — 4 px controls, 6 px cards, 8 px popovers; 16 px top corners only on mobile sheets.
5. **Paper receipt** — a white 35- or 48-column preview inside a neutral frame; no dark-mode inversion of the paper itself.

### 1.6 Anti-goals

- No mascots, cartoons, stock photography, or decorative illustrations.
- No gradients used as decoration; no glass/blur surfaces; no large soft shadows on cards.
- No all-caps labels, tracked-out eyebrow labels above headings, or "01 / 02 / 03" markers outside a real sequence.
- No pill-shaped status chips, pill buttons, or pill inputs. Pills are reserved for avatars only.
- No color-only stock deltas, payment status, sync state, or role warnings.
- No hidden gesture as the only path to a cart action, a void, or a sync decision.
- No fake metrics, sample names, or template demo content in product screens. Seed data is synthetic and authored separately.
- No browser-default dialogs, alerts, or validation bubbles.

---

## 2. Color

### 2.1 Palette concept

The palette is named for the materials of the environment: **paper, ink, steel, petrol, stamp, and signal**. It is deliberately brand-neutral so the buyer can substitute a brand accent without redesigning components.

- **Paper / canvas:** a low-glare off-white with a faint green-grey cast, not cream and not pure white.
- **Ink:** near-black with a slight cool cast, 17.7:1 on white.
- **Steel:** the border and secondary-control family, strong enough for 3:1 component boundaries.
- **Petrol:** the original brand accent, a deep blue-green teal. It is not the blue used by the referenced demo template, and it is used sparingly.
- **Stamp / signal:** semantic red, amber, green, and slate for status, always with text.

### 2.2 Core colors — light theme

| Token | Hex | Role |
|---|---|---|
| `bg.canvas` | `#F4F5F2` | Page background; reduces glare against pure white surfaces |
| `bg.surface` | `#FFFFFF` | Cards, tables, sheets, inputs |
| `bg.surfaceRaised` | `#FFFFFF` | Popovers and modals, separated by elevation and border |
| `bg.surfaceSunken` | `#EDF0ED` | Table headers, inset wells, disabled zones |
| `bg.hover` | `#F0F2EF` | Row and control hover |
| `bg.selected` | `#E3F1EE` | Selected nav item, selected row, chosen payment method |
| `bg.disabled` | `#ECEFEC` | Disabled control fill |
| `text.primary` | `#14191B` | Body, headings, table cells |
| `text.secondary` | `#4A5559` | Supporting copy, table headers, labels |
| `text.muted` | `#5F6B66` | Metadata, placeholders, captions |
| `text.inverse` | `#FFFFFF` | Text on solid dark surfaces such as toasts and stamps |
| `text.disabled` | `#5A6560` | Disabled labels (still readable; 5.23:1 on disabled fill) |
| `border.subtle` | `#E1E5E1` | Row dividers, decorative separators only |
| `border.default` | `#C9D0CB` | Card outlines, table container |
| `border.strong` | `#7C8A83` | Input boundaries, checkbox borders, 3:1 UI boundaries |
| `accent.default` | `#0E6E66` | Primary button fill, active nav rail, key focus |
| `accent.hover` | `#0A5B54` | Hover/pressed primary |
| `accent.active` | `#084B46` | Pressed state, dark emphasis |
| `accent.subtle` | `#E3F1EE` | Selected surfaces, subtle accent backgrounds |
| `accent.onAccent` | `#FFFFFF` | Text/icon on accent fills |
| `accent.text` | `#0A5B54` | Inline links and accent text on light surfaces |
| `focus.ring` | `#0E6E66` | Focus ring on light surfaces |
| `focus.offset` | `#FFFFFF` | Gap between control and ring |
| `overlay.scrim` | `rgba(20, 25, 27, 0.72)` | Modal and drawer backdrop |

### 2.3 Core colors — dark theme

| Token | Hex | Role |
|---|---|---|
| `bg.canvas` | `#0F1416` | Page background; charcoal, not black |
| `bg.surface` | `#171D1F` | Cards, tables, sheets |
| `bg.surfaceRaised` | `#1E2628` | Popovers, modals |
| `bg.surfaceSunken` | `#0B1011` | Table headers, wells |
| `bg.hover` | `#20292B` | Hover |
| `bg.selected` | `#10201E` | Selection |
| `bg.disabled` | `#232B2D` | Disabled fill |
| `text.primary` | `#E8EDEA` | Body, headings |
| `text.secondary` | `#A9B5B0` | Supporting copy |
| `text.muted` | `#8C9994` | Metadata, placeholders |
| `text.inverse` | `#0F1416` | Text on solid light surfaces such as accent fills and light toasts |
| `text.disabled` | `#95A19C` | Disabled labels |
| `border.subtle` | `#2A3432` | Row dividers |
| `border.default` | `#3B4744` | Card outlines |
| `border.strong` | `#667873` | Input boundaries, 3:1 UI boundaries |
| `accent.default` | `#66D6C4` | Primary button fill, active nav rail |
| `accent.hover` | `#7FE0D1` | Hover/pressed primary |
| `accent.active` | `#4FC2B0` | Pressed state |
| `accent.subtle` | `#10201E` | Selected surfaces |
| `accent.onAccent` | `#0B1213` | Text/icon on light accent fills |
| `accent.text` | `#7FE0D1` | Inline links and accent text |
| `focus.ring` | `#7FE0D1` | Focus ring on dark surfaces |
| `focus.offset` | `#0F1416` | Gap between control and ring |
| `overlay.scrim` | `rgba(0, 0, 0, 0.70)` | Backdrop |

### 2.4 Status colors

Status is a three-part token: foreground text, background tint, and border. Foreground-on-background is always at least 4.5:1. Status labels are mandatory; the color never carries meaning alone.

| Status | Light foreground / background / border | Dark foreground / background / border |
|---|---|---|
| Success — paid, synced, confirmed | `#17603A` / `#E6F2EA` / `#9ACFAE` | `#7ADFA4` / `#122A1D` / `#2E6B45` |
| Warning — offline, pending, low stock | `#7A4A00` / `#FDF0DA` / `#D8A94F` | `#F2C06B` / `#2E2211` / `#6B4E1F` |
| Danger — failed, conflict, void, negative stock | `#A3231B` / `#FBE9E7` / `#D98A83` | `#FF9A90` / `#331816` / `#6B2D27` |
| Info — neutral system guidance | `#33474D` / `#EAF0F1` / `#9FB8BD` | `#B9D2D8` / `#16262A` / `#2E4A50` |
| Neutral — draft, archived, not applicable | `#3C4843` / `#EDF0ED` / `#C9D0CB` | `#C7D2CD` / `#232B2D` / `#3B4744` |

Status usage:

- **Success** is for confirmed server facts and for a locally durable offline save only when the copy says it is local.
- **Warning** is for conditions that need attention but do not block work: offline with a queue, low stock, unverified non-cash tender.
- **Danger** is for failed operations, unresolved conflicts, voided records, and negative stock. It is never used for decorative emphasis.
- **Info** is for neutral explanations, cached-data notices, and reconciliation hints.
- **Neutral** is for draft and terminal-inactive states.

#### Lifecycle status mapping

The rail color is a secondary signal; the label is mandatory. This mapping is the contract for order rows, job cards, detail headers, and queue items.

| Lifecycle state | Rail family | Label shown |
|---|---|---|
| Draft | Neutral | `Draft` |
| Estimate issued | Info | `Estimasi` |
| Customer approved | Info | `Disetujui` |
| Work in progress | Accent | `Dikerjakan` |
| Work complete, unpaid | Warning | `Selesai` |
| Paid | Success | `Dibayar` |
| Voided / cancelled | Danger | `Dibatalkan` |

Queue states reuse the same families: `Menunggu sinkron` = neutral, `Mengirim` = info, `Gagal sinkron` = danger, `Perlu tinjauan` = danger. `Tersinkron` = success. A conflicted order keeps the danger rail until resolution, even if its payment rail would otherwise be success; the label states the conflict.

### 2.5 Accent budget and color rules

- At most **one filled accent primary action per view**. Everything else is a secondary (outline) or tertiary (text) action.
- Accent is used for: primary buttons, active navigation, links, selected controls, focus rings, the active state of segmented controls, and the 3 px in-progress status rail. The rail is the only non-interactive accent use; accent never fills a large status surface. Accent is not used for chart decoration, large backgrounds, or headings.
- Never use color as the only difference between two states. Pair with text, icon, position, or a rail.
- No decorative gradients. The only permitted gradient is a functional fade that indicates horizontally scrollable table content, and it must have a visible scrollbar alternative.
- No pure `#000000` text or `#FFFFFF` page canvas. White is permitted for surfaces and receipt paper.
- Semantic colors are not re-tinted per component. Use the token, not a local `opacity` or mix.
- Charts use the categorical palette below; each series also has a direct label or legend with a shape/text marker, and the data table alternative is always available.

### 2.6 Data visualization palette

| Slot | Light | Dark | Use |
|---|---|---|---|
| 1 | `#0E6E66` | `#66D6C4` | Primary series (sales, product revenue) |
| 2 | `#A15C00` | `#F2C06B` | Secondary series (service revenue) |
| 3 | `#3F5C8A` | `#9DB4E8` | Third series (payment mix) |
| 4 | `#7B4A6B` | `#E3A6CC` | Fourth series |
| 5 | `#4F6B3A` | `#A9C98D` | Fifth series (technician) |
| 6 | `#8A3B36` | `#FF9A90` | Negative/void comparison |

All categorical colors are at least 5.19:1 against the light surface and 8.22:1 against the dark surface. Charts also require: a title that states the measure and period, direct value labels or a data table, a zero baseline for bars, and no 3D or animated transitions.

### 2.7 Contrast evidence

Ratios are computed from the sRGB hex values with the WCAG 2.2 relative-luminance formula and rounded to two decimals. Body text requires 4.5:1; large text (≥ 24 px, or ≥ 18.66 px bold) and UI boundaries require 3:1.

| Pair | Ratio | Requirement | Result |
|---|---|---|---|
| Light: primary text on surface | 17.73:1 | 4.5:1 | Pass |
| Light: primary text on canvas | 16.20:1 | 4.5:1 | Pass |
| Light: secondary text on surface | 7.68:1 | 4.5:1 | Pass |
| Light: muted text on surface | 5.55:1 | 4.5:1 | Pass |
| Light: `accent.default` on surface (fill and focus ring) | 6.10:1 | 4.5:1 | Pass |
| Light: `accent.text` on surface (links) | 7.96:1 | 4.5:1 | Pass |
| Light: on-accent on accent fill | 6.10:1 | 4.5:1 | Pass |
| Light: `accent.default` on canvas | 5.58:1 | 4.5:1 | Pass |
| Light: `accent.text` on canvas | 7.28:1 | 4.5:1 | Pass |
| Light: border strong on surface | 3.61:1 | 3:1 | Pass |
| Light: border strong on canvas | 3.30:1 | 3:1 | Pass |
| Light: border strong on sunken | 3.14:1 | 3:1 | Pass |
| Light: focus ring on surface | 6.10:1 | 3:1 | Pass |
| Light: focus ring on canvas | 5.58:1 | 3:1 | Pass |
| Light: disabled text on disabled fill | 5.23:1 | 3:1 (exempt, still passes 4.5:1) | Pass |
| Light: success pair | 6.59:1 | 4.5:1 | Pass |
| Light: warning pair | 6.65:1 | 4.5:1 | Pass |
| Light: danger pair | 6.37:1 | 4.5:1 | Pass |
| Light: info pair | 8.48:1 | 4.5:1 | Pass |
| Light: neutral pair | 8.31:1 | 4.5:1 | Pass |
| Light: accent-subtle pair | 6.86:1 | 4.5:1 | Pass |
| Dark: primary text on surface | 14.39:1 | 4.5:1 | Pass |
| Dark: primary text on canvas | 15.67:1 | 4.5:1 | Pass |
| Dark: secondary text on surface | 8.06:1 | 4.5:1 | Pass |
| Dark: muted text on surface | 5.76:1 | 4.5:1 | Pass |
| Dark: muted text on raised surface | 5.21:1 | 4.5:1 | Pass |
| Dark: `accent.default` on surface (fill) | 9.72:1 | 4.5:1 | Pass |
| Dark: `accent.text` on surface (links and focus ring) | 10.95:1 | 4.5:1 | Pass |
| Dark: on-accent on accent fill | 10.79:1 | 4.5:1 | Pass |
| Dark: `accent.default` on canvas | 10.58:1 | 4.5:1 | Pass |
| Dark: `accent.text` on canvas | 11.91:1 | 4.5:1 | Pass |
| Dark: border strong on surface | 3.65:1 | 3:1 | Pass |
| Dark: border strong on raised surface | 3.30:1 | 3:1 | Pass |
| Dark: focus ring on surface | 10.95:1 | 3:1 | Pass |
| Dark: success pair | 9.40:1 | 4.5:1 | Pass |
| Dark: warning pair | 9.26:1 | 4.5:1 | Pass |
| Dark: danger pair | 8.01:1 | 4.5:1 | Pass |
| Dark: info pair | 9.87:1 | 4.5:1 | Pass |
| Dark: neutral pair | 9.30:1 | 4.5:1 | Pass |
| Dark: accent-subtle pair | 10.81:1 | 4.5:1 | Pass |

White on `accent.active` is 9.98:1; dark ink on `accent.active` is 8.72:1. Any new brand accent must be re-verified against every pair above before it ships.

---

## 3. Typography

### 3.1 Families

| Role | Family | License | Why |
|---|---|---|---|
| UI, body, headings, money | **Inter** (variable, self-hosted) | SIL OFL 1.1 | Already approved in the license inventory; Indonesian Latin coverage; excellent small-size legibility on low-end Android; true tabular figures. |
| Plates, document/receipt numbers, receipt preview | **IBM Plex Mono** | SIL OFL 1.1 | An industrial, document-like mono with a clear 0/O and 1/l distinction; makes plates and receipt columns scannable; supports a truthful 35-column preview. |

Both licenses were verified on 2026-11-26. Fonts are self-hosted as WOFF2 on web and bundled files on mobile; no runtime font CDN. OFL notices ship with the source. IBM Plex Mono is listed in `docs/ops/license-inventory.md`; keep the OFL notice with the bundled files.

Fallback stacks are only a safety net, never the design: `Inter, "Segoe UI", system-ui, sans-serif` and `"IBM Plex Mono", ui-monospace, "SFMono-Regular", monospace`. Receipt preview must use the bundled mono, not the fallback, or its column count is not trustworthy.

### 3.2 Type scale

Sizes are CSS px on web and dp on mobile. Line heights are stored as px/dp values in `tokens.json` (shown here as px for clarity).

| Token | Size | Line height | Weight | Letter spacing | Use |
|---|---|---|---|---|---|
| `display` | 30 | 38 | 600 | −0.3 px | Payment total on tablet, full-page empty-state number (rare) |
| `title.lg` | 24 | 32 | 600 | −0.2 px | Page title |
| `title.md` | 20 | 28 | 600 | −0.1 px | Section title, sheet title |
| `title.sm` | 18 | 26 | 600 | 0 | Card title, dialog title |
| `body.lg` | 16 | 24 | 400 | 0 | Form inputs, mobile body, long-form guidance |
| `body` | 14 | 20 | 400 | 0 | Default body on web |
| `body.strong` | 14 | 20 | 600 | 0 | Emphasis, table total row |
| `label` | 13 | 18 | 500 | 0 | Field labels, compact buttons |
| `table` | 13 | 18 | 400 | 0 | Table cells |
| `table.header` | 12 | 16 | 600 | 0.1 px | Column headers, sentence case |
| `caption` | 12 | 16 | 400 | 0 | Metadata, helper text, timestamps |
| `numeric.xl` | 28 | 34 | 600 | −0.2 px | Payment amount, total due |
| `numeric.lg` | 20 | 26 | 600 | 0 | Summary totals |
| `mono` | 13 | 18 | 400 | 0 | Plate, document number, technical reference |
| `receipt` | 12 | 16 | 400 | 0 | 35/48-column receipt preview only |

Rules:

- Body copy never goes below 12 px; 12 px is reserved for captions and table headers, never for primary instructions.
- Page titles are 24 px, not 30 px. The 30 px display size is reserved for one number or one moment per screen.
- Headings are sentence case. Do not use all caps except the functional receipt stamps `DIBATALKAN` and `SALINAN`, which must survive thermal printing and photocopying.
- Maximum line length: 68 characters for prose, 52 for form help, 72 for the login explanation. Tables wrap at cell boundaries, not at arbitrary character counts.
- No typographic eyebrow labels above headings. A page header is title plus optional one-line description.
- Do not accent a single word inside a heading with color or italics. Hierarchy comes from size and weight.

### 3.3 Numeric treatment

- All monetary and quantity figures use **tabular numerals** (`"tnum" 1, "lnum" 1`) and are right-aligned in tables, summaries, and receipts.
- Money uses the sans family in app UI, not mono, at the same size as its context; totals increase weight, not color. Plates and document numbers use mono. Receipt preview money uses the receipt mono because it must match the 35/48-column printer output.
- The largest number on a screen is the amount the user must act on: total due on payment, change after cash, variance at close. Do not make every metric 28 px.
- Never abbreviate money in a financial context. `Rp 1.234.567` is correct; `Rp 1,2 jt` is not permitted in tables, receipts, reports, or reconciliation.
- Use the Unicode minus `−` (U+2212), not a hyphen, for negative values and refunds. Use `+` for positive deltas where the sign is meaningful.
- A delta shown in a table carries both a sign and a word in its accessible label: `+3` with `aria-label="Bertambah 3"`. Color is supplementary.

### 3.4 Plate treatment

- **Input:** one field. Uppercase live, strip spaces, hyphens, and dots, accept only A–Z and 0–9. Show the canonical result below the field as the user types.
- **Canonical display:** the normalized value, e.g. `B1234XYZ`, in IBM Plex Mono 500, uppercase, letter spacing 0.04em. Do not insert separators: Indonesian plate segmentation varies and auto-grouping can invent a different plate. Do not zero-pad.
- **Search:** accepts any separator format, case, and suffix-only queries. Results show canonical plate plus brand/model and owner; ambiguous results show the distinguishing owner and outlet, not just the plate.
- **Never** display a plate in a proportional font with tight tracking; `I`, `1`, `O`, and `0` must remain distinguishable at a glance.

### 3.5 Receipt typography

- Design at **35 columns** first (58 mm paper, Font A), then expand to **48 columns** (80 mm). Never shrink a desktop layout into a receipt.
- Preview in `receipt` mono at 12/16 on a white paper surface. The preview keeps 35 or 48 character cells and uses a horizontal scroll container on narrow screens rather than reflowing the paper.
- Item name may wrap to a second line. Quantity and unit price sit on one line; the line amount sits on its own line when the name is long. Amounts are never truncated.
- Tender lines use two lines: method and amount on one, reference on the next. Totals are bold or double-height in the printer profile, with a rule above the grand total.
- Receipt stamps: `SALINAN` for reprints, `DIBATALKAN` for voided orders, `SALINAN LOKAL — BELUM TERSINKRON` for offline receipts. These are the only permitted all-caps strings.

### 3.6 Long content and text fitting

- Names wrap to a maximum of two lines in list rows and tables, then truncate with an accessible full value (tooltip or detail view), never with a clipped amount.
- Product and service names can be long; the category badge and quantity remain visible, and the line total is never pushed out of the row.
- Money, plate, and document number cells are `white-space: nowrap`; the container scrolls if needed. They never wrap mid-number.
- Buttons size to their label and may wrap to two lines only on mobile when the label is a full verb phrase. Primary buttons do not truncate.
- Empty and error copy is capped at 52 characters per line on mobile and 68 on web. No lorem ipsum.

---

## 4. Space, shape, depth

### 4.1 Spacing

A 4 px base with an 8 px rhythm. The full scale is in `tokens.json`:

`0, 2, 4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80` px/dp.

| Context | Value |
|---|---|
| Icon-to-label gap | 8 |
| Inside a compact control | 12 horizontal |
| Inside a primary button | 16–20 horizontal |
| Between related form fields | 16 |
| Between form sections | 32 |
| Card padding (web) | 20 |
| Card padding (mobile) | 16 |
| Table cell padding | 12 horizontal, 12 vertical |
| Page gutter, ≥ 1024 px | 32 |
| Page gutter, 768–1023 px | 24 |
| Page gutter, < 768 px | 16 |
| Mobile screen edge | 16 |
| Mobile bottom action bar padding | 16 horizontal, 12 vertical + safe area |

Do not use arbitrary values such as 13, 18, or 30. If a layout needs a new step, add it to `tokens.json` and document why.

### 4.2 Layout and alignment

- **Left-aligned** is the default for text, headings, forms, empty states, and page headers. Do not center body copy.
- **Numbers align right**; their headers align right too. Currency prefixes sit inside the cell, not as a separate column.
- **Actions align right** on web page headers. On mobile, the primary action sits at the trailing edge of a full-width bottom bar or fills the bar when it is the only action. One primary action per screen.
- Web content max width is 1440 px inside the shell; reading prose is capped at 68ch even on wide screens.
- Forms use one column up to 768 px and at most two columns above; a field's label, control, help, and error stay grouped.
- The 12-column grid is used for dashboards and detail layouts, not forced onto forms. Tables are their own scroll container.

### 4.3 Radius

| Token | Value | Use |
|---|---|---|
| `radius.none` | 0 | Table cells, receipt paper, rules |
| `radius.xs` | 2 | Status rail ends, tiny badges, checkbox tick container |
| `radius.sm` | 4 | Buttons, inputs, selects, status chips, tabs |
| `radius.md` | 6 | Cards, tables, panels, toasts |
| `radius.lg` | 8 | Popovers, dropdowns, tooltips |
| `radius.xl` | 16 | Mobile sheet top corners only |
| `radius.full` | 999 | Avatars and the PIN dots only |

No other radii. Buttons are not pills. Status chips are rectangles with a 4 px radius, not capsules.

### 4.4 Borders

| Token | Value | Use |
|---|---|---|
| `border.width.hairline` | 1 px | Row dividers, table header rule, receipt rules |
| `border.width.default` | 1 px | Card and table container outlines |
| `border.width.strong` | 1 px | Input, select, checkbox, segmented control boundaries; uses `border.strong` color for 3:1 |
| `border.width.rail` | 3 px | Status rail |
| `border.width.focus` | 2 px | Focus ring, with a 2 px offset |

Borders carry hierarchy; shadows do not. Cards use a 1 px `border.default` on `bg.surface`; a card with a shadow is a mistake unless it is an overlay.

### 4.5 Elevation

| Token | Light | Dark | Use |
|---|---|---|---|
| `elevation.0` | none | none | Page, cards, tables, inputs |
| `elevation.1` | `0 1px 2px rgba(20,25,27,0.06)` | `inset 0 0 0 1px #2A3432` | Sticky headers, bottom action bars |
| `elevation.2` | `0 8px 24px -12px rgba(20,25,27,0.28)` | `0 8px 24px -12px rgba(0,0,0,0.60)` | Dropdowns, popovers, toasts |
| `elevation.3` | `0 24px 64px -24px rgba(20,25,27,0.36)` | `0 24px 64px -24px rgba(0,0,0,0.72)` | Modals, mobile sheets |

Dark theme uses borders and a scrim more than shadows. Do not add a colored glow. The table shows the web rendering; `tokens.json` stores each level as platform-neutral shadow layers (offset, blur, spread, color, inset), which mobile maps to its native shadow/elevation API.

### 4.6 Layering

| Token | Value | Use |
|---|---|---|
| `zIndex.base` | 0 | Page content |
| `zIndex.sticky` | 10 | Sticky table headers, bottom action bars |
| `zIndex.dropdown` | 20 | Select menus, popovers, filter panels |
| `zIndex.overlay` | 30 | Scrim behind drawers and modals |
| `zIndex.drawer` | 40 | Web drawer |
| `zIndex.modal` | 50 | Confirmation and destructive dialogs |
| `zIndex.toast` | 60 | Toasts above dialogs, never inside a focus trap |
| `zIndex.tooltip` | 70 | Tooltips above all overlays |
| `zIndex.skipLink` | 80 | Skip link when focused |

A toast is not focus-trapped and does not sit inside a modal's focus scope. Tooltips are supplemental and never contain the only copy of an action label.

### 4.7 Density

| Surface | Row height | Control height | Notes |
|---|---|---|---|
| Web tables, default | 44 px | 36 px visual / 44 px hit area | Dense but touch-safe |
| Web tables, compact (opt-in, mouse-first) | 40 px | 32 px visual / 44 px hit area | Never use below 40 px |
| Web forms | — | 44 px visual / 44 px hit area | 16 px input text |
| Web navigation items | 44 px | 44 px hit area | Full-width row |
| Mobile lists | 56 dp minimum | 48 dp minimum | 8 dp minimum gap |
| Mobile primary actions | — | 56 dp | Bottom bar, full width |
| Mobile keypad keys | — | 56 dp | 8 dp gap, 3 × 4 grid |

The 32 px visual size is permitted only inside a 44 px interactive target on web. Mobile has no 32 px controls.

### 4.8 Focus ring

- Web and mobile focus: 2 px `focus.ring`, a 2 px gap (`border.width.focusOffset`) in the `focus.offset` color, and a 4 px radius on the ring.
- The ring must remain visible on `bg.canvas`, `bg.surface`, `bg.surfaceSunken`, `accent.subtle`, and status tints. If a control sits on an accent fill, use a white inner ring plus the accent ring.
- `:focus-visible` only; mouse clicks do not leave a ring. Keyboard focus always shows one.
- Sticky headers, bottom bars, and sheets must not obscure the focused element. Scroll padding of 96 px (`size.scrollPaddingBottom`) at the bottom of forms accounts for action bars (WCAG 2.4.11).
- Dialogs trap focus only while open and return focus to the trigger on close. Escape closes non-destructive overlays; destructive dialogs require an explicit cancel or confirm.

### 4.9 Iconography

- **Lucide** (ISC), 1.75 px stroke at 20 px and 2 px at 24 px. Sizes: 16 px inline, 20 px default, 24 px navigation and toolbar, 32 px empty-state glyph inside a 40 px tinted square.
- Icons are never the only label for an action. Icon-only buttons require a Bahasa Indonesia `aria-label` and a visible tooltip on hover/focus on web. Mobile icon-only buttons are limited to back, close, and overflow, each with an accessible name.
- Decorative icons use `aria-hidden="true"`. Icons inside status chips reinforce the label but do not replace it.
- Do not mix icon families or use emoji as icons. Do not draw custom SVGs for concepts Lucide already covers.
- Directional icons mirror only for RTL, which is out of scope; Indonesian is left-to-right.

### 4.10 Motion

| Token | Duration | Use |
|---|---|---|
| `motion.duration.instant` | 80 ms | Hover/pressed color change, checkbox tick |
| `motion.duration.fast` | 120 ms | Dropdown open, tab underline, toast enter |
| `motion.duration.base` | 180 ms | Drawer/sheet enter, inline error reveal |
| `motion.duration.slow` | 240 ms | Modal enter, conflict sheet |
| `motion.duration.highlight` | 600 ms | New-row highlight after an add or sync |
| `motion.duration.reduced` | 0 ms | All of the above when reduced motion is requested |

Easing: standard `cubic-bezier(0.2, 0, 0, 1)`; exit `cubic-bezier(0.4, 0, 1, 1)`. No bounce, no spring overshoot, no parallax, no page-load choreography.

Motion is allowed only to explain a state change the user caused: a sheet opening, a row entering after a save, a toast appearing. Offline/sync status changes use a color/text transition, not a looping pulse. A spinner is permitted only for an unknown-duration action; otherwise use a determinate progress bar or a skeleton. Honor `prefers-reduced-motion` and the OS reduce-motion setting.

---

## 5. Theming

- Web tokens are exposed as CSS custom properties under a single prefix, e.g. `--wpos-color-bg-canvas`, `--wpos-space-4`, `--wpos-radius-sm`, `--wpos-font-body`. The theme attribute is `data-theme="light"` or `data-theme="dark"` on the document root; a `data-theme` value always resolves all semantic tokens, never a partial override.
- The default follows the OS `prefers-color-scheme`. A user toggle persists per device (web: local storage; mobile: secure local preference). The resolved theme is applied before first paint on web so there is no flash; the document root always carries the resolved `data-theme` value.
- Components reference semantic tokens only. A component may not know whether it is in light or dark mode; status colors, borders, and focus rings are resolved by the theme.
- Mobile maps the same semantic names to its theme object. No mobile-only palette. Platform-native surfaces (status bar, navigation bar, keyboard) follow the app theme.
- **Receipt paper is always white** with black text in both themes. Dark mode dims the surrounding frame, not the paper.
- Charts use the theme's categorical palette; grid lines use `border.subtle`; labels use `text.secondary`. Do not rely on chart color alone; provide direct labels and a table view.
- The buyer's brand accent is a token substitution, not a redesign. Any replacement accent must pass the contrast table in §2.7, especially white text on the fill and the accent as link text.

---

## 6. Web shell

### 6.1 Composition

```
┌──────────────────┬───────────────────────────────────────────────────────────┐
│ Wordmark         │ Global search: plate / customer / nota      [status] [me]  │ 56
│                  │                                                           │
├──────────────────┼───────────────────────────────────────────────────────────┤
│ Dashboard        │ Page title                                  [Primary]     │ 72
│ Transaksi        │ One-line description (optional)                           │
│ Nota servis      ├───────────────────────────────────────────────────────────┤
│ Kendaraan        │ Filters: [search] [date] [outlet] [status]   [Reset]     │ 56
│ Pelanggan        ├───────────────────────────────────────────────────────────┤
│                  │                                                           │
│ Produk           │ Table / form / detail content                             │
│ Jasa             │                                                           │
│ Stok             │                                                           │
│                  │                                                           │
│ Laporan          │                                                           │
│ Pengaturan       │                                                           │
│                  │                                                           │
│ [outlet] [user]  │                                                           │
└──────────────────┴───────────────────────────────────────────────────────────┘
  264 / 72 collapsed
```

### 6.2 Dimensions

| Region | Size |
|---|---|
| Sidebar expanded | 264 px |
| Sidebar collapsed (icon rail) | 72 px |
| Top bar | 56 px |
| Page header | 72 px minimum |
| Filter bar | 56 px |
| Content max width | 1440 px |
| Page gutter | 32 / 24 / 16 px at ≥1024 / 768–1023 / <768 |
| Detail drawer | 480 px (max 92vw); full screen below 768 |
| Modal | 560 px max (480 px for destructive confirmations) |
| Toast | 360 px max |
| Sticky table header | 44 px |
| Table row | 44 px default, 40 px compact |
| Icon button hit area | 44 × 44 px minimum |

### 6.3 Sidebar

- One level of visible destinations, grouped by task area with a plain 12 px group label. No nested collapsible submenus; a module either has a page or is not in navigation.
- Order: Dashboard; Transaksi; Nota servis; Kendaraan; Pelanggan; Produk; Jasa; Stok; Laporan; Pengaturan.
- Navigation omits modules the signed-in role can never use. It never shows a disabled destination as a placeholder. Owner/Admin see all; Cashier sees selling, customers, vehicles, and own-outlet records; Mechanic sees assigned work and vehicle lookup.
- Navigation item: 44 px high, 20 px icon, 14 px label, 8 px icon-label gap, 12 px horizontal padding, 4 px radius. Active state: `bg.selected`, `accent.text`, and a 3 px left rail. Hover is `bg.hover`; focus uses the standard ring.
- Badges are small neutral counts, not colored dots. Low-stock and pending-sync counts appear as text badges with accessible labels, e.g. "Stok menipis, 4 item".
- Bottom of sidebar: outlet switcher (multi-outlet roles only), current user with role, and a "Bantuan" link. A role that is assigned one outlet sees the outlet name, not a disabled switcher.
- Collapse state persists per device. Collapsed mode keeps tooltips and accessible names; the active item still shows its rail.
- Below 1024 px the sidebar becomes a 280 px off-canvas drawer with a visible menu button in the top bar. Focus is trapped while open and returns to the trigger on close. The web drawer is not the mobile app's navigation model.

### 6.4 Top bar

- Global search is always visible on ≥768 px, with placeholder "Cari nomor polisi, pelanggan, atau nota". It searches plates, customer names, phone numbers, and invoice numbers. Plate queries are normalized with the same rules as intake; results show canonical plate, vehicle, owner, and last service.
- On <768 px search moves to its own full-width row beneath the top bar; it is never hidden behind an icon.
- Connection and sync status sit next to search as a text chip: "Online", "Offline: 3 menunggu", "Menyinkronkan…", "2 perlu tinjauan". The chip is a button that opens the sync queue when there is pending work.
- Outlet switcher appears only for Owner/Admin with more than one outlet; switching refreshes all outlet-scoped data and is announced.
- Theme toggle, help, and user menu. The user menu contains role, outlet, "Ganti pengguna", and "Keluar".
- No notification bell in MVP. Pending work is surfaced by the sync chip and dashboard exceptions, not by an empty notification center.

### 6.5 Page header

- Title 24/32, optional one-line description 14/20 secondary. No eyebrow label.
- Primary action at the right, one per page. Secondary actions in a text/overflow menu. Destructive actions never sit next to the primary action.
- Detail pages show a back link "Kembali ke daftar" and the record identity (number, plate) in the mono layer. Long titles wrap rather than truncate; the action area stays aligned to the first line.
- On <768 px the primary action moves to a sticky bottom bar for forms and to a full-width button under the title for lists. It never covers the focused field or the last row of content.

### 6.6 Filters

- Inline controls directly above the table: search, date range, outlet (if permitted), status, and a "Filter lain" popover for secondary filters.
- Applied filters appear as removable chips with text. "Hapus semua" is a text button. Chips do not use color to encode category.
- Filter changes apply on explicit action or after a 250 ms debounce for text search. Do not re-fetch on every keystroke without announcing the result count.
- Result count is stated in text: "24 transaksi" or "Tidak ada hasil". Do not use only a number badge.
- Filter state is reflected in the URL so a report or list can be shared and reloaded. Reloading preserves filters.

### 6.7 Data tables

- Use the shared `DataTable` built on TanStack Table. Every table has an accessible caption (may be visually hidden), `scope="col"` headers, and a sort button in each sortable header with `aria-sort`.
- Header row: `bg.surfaceSunken`, 12/16 semibold secondary text, sentence case. No all-caps.
- Body: 13/18, 1 px `border.subtle` row dividers, no zebra by default. Hover uses `bg.hover`; selected uses `bg.selected`.
- Numeric columns are right-aligned with tabular figures. Status columns use `StatusChip` with text plus rail/icon.
- Row actions: at most two visible icon buttons (view, edit) plus an overflow menu. Every icon button has a specific accessible label ("Ubah produk Kampas rem depan"), not "Edit".
- Sticky header inside the table container; the first column may be sticky on horizontal scroll. The row-action column is sticky at the right edge with a 1 px separator and a surface background.
- Pagination: page size selector (25/50/100), "1–25 dari 240", previous/next with labels. Infinite scroll is not used in back-office tables; reports and vehicle history use explicit pagination so the user can reason about completeness.
- Bulk selection adds a sticky action bar above the table with the count, permitted bulk actions, and "Bersihkan pilihan". Bulk actions that change money or stock require confirmation.
- Empty, loading, and error states render inside the table container so the header and filters stay stable.

### 6.8 Forms

- Label above control; 13/18 medium. Required fields are marked with the word "Wajib" next to the label, not only an asterisk. Optional fields say "(opsional)" where omission is meaningful.
- Helper text below the label/control in 12/16 muted. Error text replaces helper text and uses `status.danger` plus an alert icon; the control border becomes danger and `aria-invalid="true"` with `aria-describedby`.
- Inputs are 44 px visual on web, 16 px text, 1 px `border.strong`, 4 px radius. Focus adds the ring; it does not remove the border.
- Money inputs use a "Rp" prefix inside the field, accept digits only, format thousands live, and never show decimals. The raw digit count is shown when the field is focused if space allows ("7 digit").
- Plate inputs use the mono family, uppercase live, and show "Bentuk tersimpan: B1234XYZ" below the field. Validation on blur, not per keystroke, except the normalization preview.
- Validation summary on submit: a `role="alert"` summary at the top with links to each invalid field, plus inline messages. Never a toast-only validation.
- Unsaved changes: leaving a dirty form opens a confirmation "Perubahan belum disimpan. Tinggalkan halaman?" with "Tetap di sini" and "Buang perubahan". The destructive option is not the default focus.
- Save: primary button label states the object ("Simpan produk"), becomes "Menyimpan…" with width preserved, and cannot be double-submitted. Success is confirmed inline and by a polite live-region announcement.

### 6.9 Drawers and modals

- **Drawer** for create/edit of a record, filters on tablet, and detail previews. 480 px right side, full screen below 768, sticky header with title and close, sticky footer with cancel + primary. Drawer opening does not discard the underlying table state.
- **Modal** only for short decisions and destructive confirmations, max 560 px. It states the action, the object, and the consequence; the confirm button repeats the verb ("Batalkan transaksi"), never "OK"/"Ya".
- One overlay at a time, with one exception: a confirmation may open over a drawer. Never stack three layers.
- Focus moves to the first meaningful control or the dialog container, is trapped, and returns to the trigger on close. Background scroll is locked. Escape closes non-destructive overlays only.
- Destructive dialogs: consequence, scope, required reason, and the resulting financial/stock effect. For a paid void, require Owner re-authentication (PIN/password) and show refund lines. The cancel button receives initial focus; the confirm action is not adjacent to the primary action of the underlying screen.

### 6.10 Toasts, banners, and inline notices

- **Toast** is a secondary confirmation, never the only surface for an error or validation. Bottom-right on desktop, above the bottom bar on mobile, 360 px max, 6 s for success, 8 s for informational, persistent until dismissed for errors that are not already inline. Maximum three stacked.
- Success toasts use `role="status"`/polite; errors use `role="alert"`/assertive. Every toast has a dismiss button and an accessible name.
- **Banner** is persistent and appears at the top of content: offline, pending sync, cached data, read-only role, or locked business date. It states the condition, the consequence, and one action. It is not dismissible if the condition is still true.
- **Inline notice** sits next to the affected field or record for validation, permission, or a stock warning. It is the primary surface for errors.

### 6.11 Empty, error, and permission states

- Use the shared `StateBlock`: 40 px tinted icon square, 16/24 title, 14/20 body capped at 68ch, one primary action, optional secondary text link. Left-aligned inside a 1 px bordered panel; centered only on the full-page auth screen.
- Empty copy distinguishes **true zero** ("Belum ada penjualan hari ini"), **no results** ("Tidak ada hasil untuk 'oli'"), and **not yet configured** ("Tambahkan produk pertama"). Each has a different action.
- Error copy states what failed, what it affects, and how to recover. Numeric cells show `—`, not `0`. A cached-data notice may show the last successful timestamp.
- Permission-denied pages are honest and specific: what the role cannot do, which role can, and how to ask. Do not render an empty table for an unauthorized route.
- Loading skeletons match final geometry (same row height, column widths, card heights) so there is no layout shift. A skeleton is used for initial loads; a thin top progress bar plus stale data is used for refreshes.

### 6.12 Web responsive behavior

| Token | Min width | Use |
|---|---|---|
| `breakpoints.sm` | 480 px | Large phone / small tablet web |
| `breakpoints.md` | 768 px | Tablet; two-column form maximum begins |
| `breakpoints.lg` | 1024 px | Persistent sidebar begins |
| `breakpoints.xl` | 1280 px | Full desktop density and dashboard grid |
| `breakpoints.2xl` | 1536 px | Wide desktop; content max still 1440 px |

| Width | Behavior |
|---|---|
| ≥ 1280 px | Sidebar 264, full page header, 12-column dashboard grid, two-column forms allowed |
| 1024–1279 px | Sidebar 264 or collapsed 72, content gutters 24, dashboard cards 2-up |
| 768–1023 px | Sidebar off-canvas 280, top bar with menu, tables scroll inside container, forms single column |
| < 768 px | Single column, off-canvas nav, tables become stacked record cards or scroll inside a labeled container, primary form action sticky at bottom |
| 320 CSS px / 400% zoom | No page-level horizontal scroll; `scrollWidth <= innerWidth`; table containers scroll internally; actions wrap, never clip |

At every width, the page must satisfy WCAG 2.2 Reflow: content is available in one direction, and data tables may scroll inside their own container. Zoom to 200% text and 400% page zoom must not hide the focused field behind a sticky bar.

### 6.13 Keyboard model

- Tab order follows visual order. Skip link "Lewati ke konten utama" is the first focusable element.
- Global search: `/` focuses it when focus is not in an input; Escape clears the query.
- Tables: arrow keys move between cells only if the table is implemented as a grid; otherwise native table navigation and header sort buttons are used. Do not invent a keyboard mode the component cannot support.
- Dialogs trap focus; drawers do the same. Escape closes; focus returns.
- Cart and list reordering are not drag-only. Quantity has visible −/+ buttons and a numeric input; removal is a visible button with confirmation or undo.
- Every action reachable by hover is reachable by focus and by tap. Tooltips appear on focus as well as hover.

---

## 7. Mobile shell

### 7.1 Navigation model

Four root destinations, always visible on root screens, task-named:

| Tab | Icon | Purpose |
|---|---|---|
| **Jual** | ShoppingCart | Start and complete a sale |
| **Pesanan** | ClipboardList | Service orders, assigned jobs, queue status |
| **Stok** | Boxes | Stock lookup, low stock, adjustments for permitted roles |
| **Lainnya** | Menu | Vehicles, customers, reports, sync queue, settings, shift switch |

- Bottom tab bar: 64 dp plus safe area, 4 equal items for Owner/Admin/Cashier, icon 24 + label 12, active state uses accent plus a 3 px top rail and a bold label. Labels are always visible; no icon-only tabs.
- Tabs are role-aware. A Mechanic sees **Pesanan**, **Stok** (read-only lookup), and **Lainnya**; **Jual** is absent rather than a dead tab. A Cashier sees **Jual**, **Pesanan**, **Stok** (lookup, no adjustment), and **Lainnya**. Owner/Admin see all four with full stock actions. No role sees a tab it cannot use.
- A pushed screen (cart, payment, vehicle detail, conflict sheet) hides the tab bar and uses a 64 dp bottom action bar or a sheet. Back is a labeled header button, not a gesture-only path.
- Maximum browsing depth is two levels: tab → detail. A detail may open a sheet, not a third page chain. A sequential task flow (cart → payment → receipt) is not browsing depth; each step has one back action and one primary action.
- The header is 56 dp: back or title, outlet name, sync chip, user avatar. Long outlet names truncate with the full value on the profile sheet; the sync chip collapses to icon plus count when space is tight and always keeps an accessible label.
- The app never shows the web sidebar or a hamburger drawer for primary navigation.

```
Root screen                          Pushed screen
┌──────────────────────────┐         ┌──────────────────────────┐
│ Outlet A     [sync] [me] │ 56      │ ← Pembayaran             │ 56
├──────────────────────────┤         ├──────────────────────────┤
│ Offline: 3 menunggu      │ 40      │ Total        Rp 299.700  │
├──────────────────────────┤         │                          │
│                          │         │ [payment content]        │
│ content                  │         │                          │
│                          │         │                          │
├──────────────────────────┤         ├──────────────────────────┤
│ Total Rp 299.700 [Bayar] │ 64      │ [Batal]      [Bayar]     │ 64
├──────────────────────────┤         └──────────────────────────┘
│ Jual Pesanan Stok Lain   │ 64+safe
└──────────────────────────┘
```

On the Jual root, the total/“Bayar” bar sits above the tab bar as a compact 56 dp summary. On the pushed cart/payment screen, the tab bar is hidden and the 64 dp action bar is the only bottom bar. Two stacked bars on one screen are not permitted.

### 7.2 Sale screen (Jual)

- Header: outlet + sync chip.
- Add row: a search field "Cari spare part atau jasa" and a category segmented control "Spare part | Jasa". The segment is a filter for adding, not a separate cart. The cart is always mixed.
- Cart: reverse order of addition, each line a card with a category label ("Spare part" or "Jasa") and icon, product/service name (2 lines max), quantity stepper, unit price, line total, and a visible "Hapus" action. Category subtotals appear above the total: "Subtotal spare part", "Subtotal jasa".
- The summary bar shows subtotal, discount if any, tax if configured, and total. The total is `numeric.lg` on mobile, not 28 px, to leave room for the "Bayar" button at 360 dp.
- Adding a line announces "Kampas rem depan ditambahkan. Total Rp 299.700" in a polite live region and highlights the new row for 600 ms. No toast per line.
- Empty cart: "Keranjang masih kosong. Tambah spare part atau jasa." with one primary action and one secondary action, each starting the respective add flow.
- Price editing and line discounts are not available to a Cashier. If the role cannot discount, the control is absent; if a discount exceeds the cap, the action is disabled with an inline reason and an "Minta persetujuan Admin" path.
- Leaving a non-empty cart without saving opens a confirmation. Clearing the cart requires "Kosongkan keranjang?" with the line count; a single line removal is immediate with a 5 s undo action and a live-region announcement.

### 7.3 Numeric keypad

Used for payment amounts, cash received, quantity, odometer, and stock quantities. Never rely on the system keyboard for money.

```
┌─────┬─────┬─────┐
│  1  │  2  │  3  │
├─────┼─────┼─────┤
│  4  │  5  │  6  │
├─────┼─────┼─────┤
│  7  │  8  │  9  │
├─────┼─────┼─────┤
│ 000 │  0  │  ⌫  │
└─────┴─────┴─────┘
```

- Keys are 56 dp minimum with 8 dp gaps; the grid is thumb-reachable in the lower half of the screen. No precision gestures.
- The amount is shown twice: the raw digits being typed and the formatted rupiah value. A missing zero must be visible before commit.
- `000` appends three zeros; `⌫` removes one digit; a visible "Hapus semua" button clears the field so long-press is not required.
- Input is integer rupiah only. No decimal key. The maximum is 12 digits (`Rp 999.999.999.999`); further input is ignored with a brief inline message, not a toast.
- Validation is on blur/confirm, not on every keypress. The confirm button remains enabled for valid non-empty input and shows the exact resulting state ("Kembalian Rp 300").
- Haptics confirm key presses and errors when the OS allows; haptics never replace visible feedback.
- Quantity uses the same keypad in a compact sheet, with −/+ stepping as an alternative for small changes.

### 7.4 Payment sheet

- Shows total due, payment method rows (Tunai, Transfer bank, QRIS), and the outstanding balance at all times. Methods are 56 dp selectable rows with a check mark and a border, not color alone.
- Cash: keypad, quick amounts ("Uang pas", "Rp 50.000", "Rp 100.000"), "Uang diterima", and "Kembalian" in `numeric.xl`. Change is calculated from the cash portion only, even in a split payment.
- Non-cash: reference field (bank name, last digits, approval code, or QRIS reference) and a "Belum terverifikasi" label until reconciled. The app records the payment; it never implies the money moved.
- Split payment: after a partial tender, "Sisa tagihan" remains visible and the method list stays open. Non-cash amounts may not exceed the remaining balance; cash overpayment produces change.
- Confirm button states "Bayar Rp 299.700". While processing it becomes "Menyimpan…" with preserved width and is disabled. The local commit must acknowledge within 1 s; the network sync happens afterward.
- Success: show the change, the resulting status "Dibayar", and "Cetak struk" / "Bagikan struk". Announce "Pembayaran berhasil. Kembalian Rp 300."
- Failure before commit: inline error, nothing recorded. Failure after local commit: "Pembayaran tersimpan di perangkat. Menunggu sinkron." Do not ask the cashier to pay again.

### 7.5 Offline, sync, and conflict

- **Persistent status:** the sync chip in the header reads "Online", "Offline: 3 menunggu", "Mengirim 2 dari 3", "Gagal sinkron", or "2 perlu tinjauan". Icon plus text, never color alone.
- **Offline banner** under the header when offline: "Anda offline. Transaksi tetap bisa dibuat dan akan disinkronkan otomatis." It is not dismissible while offline.
- **Provisional stock:** any stock figure from the local cache is labeled "Stok sementara" and shows the cache time. Server stock replaces it after sync.
- **Queue screen:** lists each queued item with state "Menunggu sinkron", "Mengirim", "Gagal sinkron", or "Perlu tinjauan"; per-item retry, "Sinkronkan sekarang", and next retry time. The queue survives app kill and restart (platform persistent work).
- **Conflict sheet:** full-screen, not dismissible without a decision or an explicit "Tinjau nanti" that leaves a persistent badge. It shows the product, the local quantity, the server quantity, the money already taken, and the allowed resolutions:
  - "Setujui dengan override" — Admin/Owner only; requires a reason; stock may go negative with an `OVERRIDE` ledger flag.
  - "Batalkan transaksi" — available to the cashier holding the queued sale; requires a reason; records a cash refund if money was taken; stock is not decremented. This is a conflict resolution for an unsynced sale, not the normal order-void permission.
  - "Tinjau nanti" — leaves the conflict in the inbox; the order remains blocked from final reporting.
- **Money is local-authoritative; stock is server-authoritative.** Copy must say so in shop language, not with status codes.
- **Receipts while offline:** "SALINAN LOKAL — BELUM TERSINKRON" plus a human-readable local reference. After sync, reprints show the final invoice number.
- **No silent resolution.** A conflict never disappears because the app retried. The user's explicit decision is recorded in the audit trail.

### 7.6 Receipt preview, print, and share

- Preview is paper-white even in dark mode, 35 columns by default, 48 for an 80 mm outlet. It scrolls horizontally if the phone is narrower than the paper, rather than reflowing the columns.
- Primary action "Cetak struk"; secondary "Bagikan struk" and "Simpan PDF". Print discovery and printing show a determinate state; the p95 target is 5 s.
- Printer failure opens a sheet: "Printer tidak terhubung." with "Coba lagi", plus "Cetak via browser" on web and "Simpan PDF" / "Bagikan PDF" on mobile. The fallback never requires internet.
- Reprints are stamped "SALINAN" and increment the reprint count. A voided order's reprint is stamped "DIBATALKAN" with the original timestamp and is never reissued with a new number.
- The receipt footer, header, tax label, and paper width are outlet settings; the preview always reflects the current outlet settings, not a hardcoded template.

### 7.7 Auth and shift change

- **First sign-in / owner setup:** online, email or username plus password (or the buyer's chosen Owner credential).
- **PIN enrollment:** after a successful online sign-in on a device, the app asks the user to set a 6-digit device PIN (entered twice). The PIN is local to that device and unlocks the cached session; it is not the account password and is never sent to the server as a password replacement.
- **Day-to-day shared device:** a user list with initials and role, then the 6-digit PIN on a large keypad. "Ganti pengguna" returns to the user list. No email typing between customers.
- **Forgotten PIN:** the user signs in online with the full credential, or an Owner/Admin revokes the device. There is no server-side PIN recovery. Device revocation removes the PIN and the local cache.
- Failed PIN attempts add a delay and then require the full credential or an Admin unlock; the message states the wait.
- Auto-lock defaults to the outlet's idle timeout; the lock screen shows the current user and the pending-sync count. Unlocking offline is allowed only for the previously signed-in user with a cached session; otherwise the screen says "Sambungkan ke internet untuk masuk."
- Logout with an unsynced queue is a destructive confirmation: "3 transaksi belum tersinkron. Keluar dan hapus data lokal?" with "Sinkronkan dulu", "Tetap di sini", and a last-resort "Keluar" that requires a reason. Never silently discard the queue.
- A revoked device or deactivated user gets a clear terminal screen: what happened, who can help, and no access to cached customer data.

### 7.8 Tablet

- 768–1024 dp uses a 72 dp navigation rail with labels beneath icons, not a bottom tab bar, and a two-pane sale screen: cart on the left, summary/payment on the right.
- The same components and tokens are used; only the layout changes. Tablet is not a separate brand or a scaled phone.
- Touch targets remain 48 dp minimum; primary actions 56 dp. No hover-dependent controls.

### 7.9 Mobile accessibility and performance

- Minimum target 48 × 48 dp; primary actions 56 dp; 8 dp minimum spacing. No drag-only or long-press-only actions.
- Font scale follows the OS up to the maximum; layouts wrap, totals never clip, and the bottom bar grows rather than covering content. Test at maximum font and display size on a 360 dp device.
- TalkBack labels every control in Bahasa Indonesia; icon-only buttons have explicit names; live regions announce cart totals, payment success, sync state, and conflicts.
- Status bar and navigation bar follow the theme; the screen is usable one-handed with the primary action in the bottom third.
- No blur, heavy shadows, large image assets, or looping animations. Lists are virtualized; the sale flow must remain usable on a 2 GB RAM Android 8.0 device with a cold start ≤ 5 s.
- Haptics are supplementary. In a noisy bay, visual confirmation is mandatory.

### 7.10 Web and mobile parity

The two shells are one product. They differ in density and navigation, not in language, status meanings, money formatting, or component behavior.

| Concern | Web back-office | Mobile app | Shared contract |
|---|---|---|---|
| Primary navigation | 264 px sidebar, 72 px collapsed rail, off-canvas below 1024 | Four bottom tabs, 72 dp rail on tablet | Same task names, same icons, same active treatment |
| Primary action | Page-header button or sticky form bar | 56–64 dp bottom action bar; full-width on phones | One filled accent action; same verb in confirm and success |
| Record list | Dense `DataTable`, 44 px rows, pagination | 56 dp list cards, explicit pagination | Same status chips, plate treatment, and money formatting |
| Create/edit | Right drawer 480 px | Full-screen sheet or pushed screen | Same fields, validation, and unsaved-change confirmation |
| Money entry | Text input with live grouping and numeric keypad support | In-app numeric keypad with `000`, backspace, and formatted value | Integer rupiah, dot grouping, `—` for unknown |
| Offline | Banner and disabled server-bound actions; web is not the offline sale surface | Persistent sync chip, offline banner, queue, conflict sheet | Same words: `Offline`, `Menunggu sinkron`, `Perlu tinjauan` |
| Receipt | Browser print / PDF fallback | Thermal print, PDF, and Android share sheet | Same 35/48-column content model and stamps |
| Feedback | Inline notices, toast, live region | Inline notices, toast/snackbar, live region, haptics | Visual feedback always; haptics supplementary |
| Theming | CSS custom properties | Theme object from the same token names | Identical semantic color, type, radius, spacing, motion |

A component may change layout between shells; it may not change its words, state semantics, or token values.

---

## 8. Component inventory

**Implementation basis.** The web back-office starts from **shadcn/ui (MIT)** components copied into `apps/web/components/ui/` and restyled with the tokens in this document; Radix primitives provide behaviour, and the project owns the copied source. This is a component source, not a commercial admin template: no Ecme file, demo page, brand asset, or mock service is included. The mobile app uses its own React Native components mapped to the same tokens. Every component below must be implemented once and reused; screens compose components and do not restyle them.

Shared components are the only path to consistent UI. A screen composes them; it does not restyle them. Every component below must implement the states named, and every interactive component must meet the 44 px web / 48 dp mobile target.

| Component | Variants | Required states | Accessibility notes |
|---|---|---|---|
| `Button` | primary, secondary, tertiary, danger, ghost | default, hover, active, focus, disabled with reason, loading | Native button; label is a verb phrase; loading preserves width and sets `aria-busy`; disabled reason is adjacent or in `aria-describedby`, not `title` only. |
| `IconButton` | 32 visual / 44 hit (web), 48 dp (mobile) | default, hover, focus, pressed, disabled | Requires a specific Bahasa Indonesia `aria-label`; tooltip on hover and focus; icon `aria-hidden`. |
| `TextField` | text, search, password, textarea | default, focus, filled, error, disabled, read-only | Label is a real `<label>`; helper/error via `aria-describedby`; `aria-invalid` on error; no placeholder as the only label. |
| `MoneyInput` | inline, large (payment) | default, focus, formatted, error, disabled | Inputmode numeric; digits only; live grouping; raw digit count available; error text names the valid range. |
| `PlateInput` | search, create | default, focus, normalized preview, duplicate warning, error | Mono, uppercase live; canonical preview; no auto-padding; duplicate warning is not an error until save. |
| `Select` / `Combobox` | single, multi, searchable | default, open, selected, empty, loading, error, disabled | Keyboard: arrows, Enter, Escape; typeahead; selected state announced; no native select styling mismatch. |
| `Checkbox` / `Radio` / `Switch` | standard, card | default, checked, focus, disabled, error | 44 px target; label clickable; group has `fieldset`/`legend`; switch announces on/off. |
| `SegmentedControl` | 2–4 options | default, selected, focus, disabled | `role="tablist"` or radio group; arrow-key navigation; selected state not color-only. |
| `Tabs` | underline, pill-free | default, active, focus, disabled | `role="tablist"`, `aria-selected`, arrow keys; panel labelled by tab. |
| `DataTable` | default, compact, selectable | loading skeleton, empty, error, filtered-empty, success, selected, sorted | Caption, `scope`, `aria-sort`, sticky header, row action labels; horizontal scroll container with keyboard access; no page overflow. |
| `StatusChip` | success, warning, danger, info, neutral | default, with icon, compact | Text plus icon; never color alone; label is the status name, not a code. |
| `StatusRail` | order, queue, line | default | Decorative `aria-hidden`; the adjacent text carries the status. |
| `JobCard` | order, vehicle, queue item | default, selected, pending, conflict, void | The whole card is a link/button with one accessible name; inner actions are separate buttons; status rail plus label. |
| `Banner` | offline, sync, cached, read-only, locked | default, action, dismissible/non-dismissible | `role="status"` for non-urgent, `role="alert"` for blocking; action is a real button; not dismissible while true. |
| `Toast` | success, info, error | entering, visible, dismissed | Polite for success, assertive for error; dismiss button; max 3; never the only error surface. |
| `Modal` | standard, destructive | open, closing, focus-trapped | `role="dialog"`/`aria-modal`, labelled title, focus trap, Escape, return focus; destructive confirm repeats the verb. |
| `Drawer` / `Sheet` | web drawer, mobile full sheet | open, closing, dirty | Same dialog semantics; sticky footer; drag-to-dismiss is optional and never the only close path. |
| `FormField` | label, help, error, required | default, focus, error, disabled | Groups label, control, help, error; required text; error linked by id. |
| `EmptyState` | true zero, no results, setup | default, action | Left-aligned; one action; no fake illustration; copy explains why and what next. |
| `ErrorState` | page, panel, inline | default, retry, offline-cached | Cause + effect + recovery; `—` for unknown numbers; retry is a real button. |
| `Skeleton` | row, card, detail, table | loading | Matches final geometry; `aria-hidden`; the region has `aria-busy="true"` and a text alternative. |
| `Pagination` | numbered, simple | default, disabled, loading | Labels "Halaman sebelumnya/berikutnya"; current page announced; no infinite scroll. |
| `FilterBar` | inline, drawer (tablet) | default, applied, loading, no-results | Chips removable by keyboard; result count in text; URL state. |
| `PageHeader` | list, detail, form | default | One `h1`; description optional; actions labelled. |
| `Sidebar` / `NavItem` | expanded, collapsed, drawer | default, active, hover, focus, badge | Landmark `<nav>` with label; active `aria-current="page"`; collapsed items keep accessible names. |
| `TopBar` | web | default, offline, syncing | Search landmark; status chip is a button when actionable; no icon-only search on mobile web. |
| `NumericKeypad` | payment, quantity | default, pressed, disabled, max reached | 56 dp keys; visible labels; "Hapus semua" alternative; formatted value live region. |
| `QuantityStepper` | inline, compact | default, min, max, disabled | −/+ buttons with labels "Kurangi jumlah"/"Tambah jumlah"; numeric input optional; no swipe. |
| `SyncChip` | online, offline, syncing, failed, conflict | default, actionable | Text + icon + count; announces changes; opens queue. |
| `ConflictCard` | stock, price, plate, cash-reporting | unresolved, resolving, resolved | Names the product/order and the local vs server values; decisions are explicit and permission-gated. |
| `ReceiptPreview` | 58 mm, 80 mm | paid, offline-local, reprint, void | Paper-white; 35/48 columns; amounts never truncate; print/share actions outside the paper. |
| `MoneyText` | body, total, large, delta | default, negative, zero, error | Tabular figures; `−` for negative; `—` when unknown; accessible label spells the value. |
| `PlateText` | inline, chip | default, search match | Mono uppercase; copy button optional with label; no invented separators. |

---

## 9. Content and formatting

### 9.1 Voice

- Plain, direct Bahasa Indonesia. Imperative for actions, factual for states.
- Address the user as "Anda" only when a possessive or subject is needed; otherwise use the imperative. Never use "kamu", honorifics, or jokes.
- Errors do not apologize and are never vague. They say what happened, what it affects, and what to do.
- Empty states are invitations with a clear next action, not mood text.
- Success confirms exactly what changed, including the amount or the local/server distinction.
- One concept, one word. Do not alternate "nota" and "struk" for different objects, or "batalkan" and "hapus" for the same action.

### 9.2 Labels and actions

- Buttons are verb + object: "Simpan produk", "Cetak struk", "Batalkan transaksi", "Sinkronkan sekarang". The same verb appears in the confirmation and the success message.
- No "OK", "Ya", "Submit", "Proses", or "Lanjut" as the only label for a consequential action.
- Field labels are nouns or noun phrases: "Nomor polisi", "Nama pelanggan", "Jumlah terhitung", "Alasan pembatalan".
- Required: the word "Wajib" next to the label. Optional: "(opsional)" where omission matters.
- Navigation names are tasks, not internal modules: "Transaksi", "Nota servis", "Kendaraan", "Stok", "Laporan".

### 9.3 Money

| Rule | Example |
|---|---|
| Rupiah prefix + no-break space + grouped integer | `Rp 1.234.567` |
| No decimals, ever | `Rp 250.000`, not `Rp 250.000,00` |
| Thousands separator is a dot; decimal comma is never used for IDR | `Rp 1.234.567` |
| Negative/refund uses U+2212 before the prefix | `−Rp 25.000` |
| Positive delta uses a plus sign when the sign is meaningful | `+Rp 250.000` |
| Zero is shown only for a real computed zero | `Rp 0` at close on a day with no sales |
| Unknown/failed value is an em dash, never zero | `—` |
| Receipt and report totals are never abbreviated | `Rp 1.234.567`, not `Rp 1,2 jt` |
| Subtotal labels match the category | `Subtotal spare part`, `Subtotal jasa` |

The space between `Rp` and the number is a no-break space so the value never wraps after the prefix. Money cells are right-aligned and `nowrap`; the table scrolls instead of wrapping the number.

### 9.4 Plates

| Rule | Example |
|---|---|
| Input accepts mixed case, spaces, `-`, `.` | `b 1234 xyz` |
| Stored and displayed canonical form | `B1234XYZ` |
| No auto-zero-padding and no invented separators | `B1234XYZ`, never `B 1234 XYZ` by default |
| Search tolerates suffix-only queries | `XYZ` finds candidates with owner/outlet context |
| Display font | IBM Plex Mono 500, uppercase, 0.04em |
| Duplicate guard | Normalize, search, then offer the existing vehicle before create |

When a plate is ambiguous, the result row shows owner name, brand/model, and outlet. The plate alone is not enough context.

### 9.5 Dates, times, and timezone

| Context | Format | Example |
|---|---|---|
| Default UI | `dd MMMM yyyy, HH.mm WIB` | `26 November 2026, 14.05 WIB` |
| Dense table | `dd MMM yyyy` | `26 Nov 2026` |
| Date input | `dd/mm/yyyy` with a hint | `26/11/2026` |
| Reports business date | `dd MMMM yyyy` | `26 November 2026` |
| CSV | ISO 8601 with offset | `2026-11-26T14:05:00+07:00` |
| Offline queue | Relative + absolute in detail | `2 menit lalu, 14.05 WIB` |

All stored timestamps are UTC; all display and business-date logic is Asia/Jakarta (WIB). Financial and audit timestamps are absolute, never relative-only. Do not show a timezone abbreviation other than WIB in the UI.

### 9.6 Identifiers and references

- Invoice/receipt numbers are buyer-configurable per outlet. Display them in mono, uppercase, and copyable with a labelled copy button.
- Never reuse or renumber a voided receipt. The original number remains visible with the `DIBATALKAN` stamp.
- Order, payment, and ledger references in the UI are human-readable identifiers, not database IDs. Technical IDs do not appear in customer-facing copy.
- Offline local references are explicitly labeled as local and are replaced by the final invoice number after sync. The local reference remains in the audit trail.

### 9.7 Phone numbers and personal data

- List views mask the phone by default: `0812••••7890`. Full value appears on the record detail for permitted roles.
- Search by phone works on the full normalized number but results remain masked.
- Free-text notes fields carry: "Jangan masukkan data pribadi yang tidak diperlukan."
- Customer and vehicle exports are role-gated, audited, and limited to required columns. Phone numbers are never written to application logs or error output.
- Deletion is anonymization for personal fields while financial records remain; the UI says what will be retained and requires Owner confirmation.

### 9.8 Receipt content rules

- 58 mm = 35 columns; 80 mm = 48 columns. Design at 35 first.
- Header: outlet name, address lines (max 2), and optional tax identifier. No marketing slogans.
- Body: date/time, receipt number, plate and vehicle (if any), customer name, line items, category subtotals, discount, tax, total, tender lines, change, mechanic (if assigned), and footer text (max 3 lines at 35 columns).
- Item name wraps to a second line; quantity × unit price on one line; amount on its own line if the name is long. Never truncate the amount.
- Tender lines: method + amount, then reference on the next line. Non-cash is labeled "Belum terverifikasi" until reconciled.
- Stamps: `SALINAN`, `DIBATALKAN`, `SALINAN LOKAL — BELUM TERSINKRON`. These are the only all-caps strings.
- Reprints increment a counter and are visibly distinct from originals. A voided receipt is never presented as a valid sale.

### 9.9 Table and report formatting

- Column headers use sentence case and state the unit where it is not obvious: "Total (Rp)", "Stok", "Odometer (km)".
- Numeric columns are right-aligned; status columns are left-aligned; dates are left-aligned in a nowrap cell.
- Negative stock is displayed as `−1` with a visible "Stok minus" label and an override reference, not just red text.
- Report figures carry the period and outlet in the title. A zero-result period is explicitly "Tidak ada transaksi pada [date]" and may show `Rp 0` because the zero is true.
- CSV: UTF-8 with BOM, comma-separated per RFC 4180, Indonesian headers, integer money without thousand separators, ISO 8601 timestamps with `+07:00`. Export is Owner/Admin only and audited.

### 9.10 Standard copy patterns

| Situation | Copy intent |
|---|---|
| Fetch failure | `Data gagal dimuat. Periksa koneksi, lalu coba lagi.` + `Coba lagi` |
| Validation summary | `Periksa 3 kolom yang ditandai.` + links to fields |
| Permission denied | `Hanya Admin atau Pemilik yang dapat membatalkan transaksi. Hubungi Admin.` |
| Offline, sale allowed | `Anda offline. Transaksi tetap bisa dibuat dan akan disinkronkan otomatis.` |
| Sync in progress | `Mengirim 2 dari 3 transaksi…` |
| Sync conflict | `Stok berubah saat offline. Tinjau transaksi sebelum melanjutkan.` |
| Destructive confirmation | `Batalkan transaksi? Transaksi tetap tersimpan di riwayat dan tidak dapat dipulihkan.` |
| Success, server | `Pembayaran tercatat. Kembalian Rp 300.` |
| Success, local | `Tersimpan di perangkat. Menunggu sinkron.` |
| Empty, true zero | `Belum ada penjualan hari ini. Mulai transaksi baru untuk melihat data.` |
| Empty, filtered | `Tidak ada hasil untuk "oli". Hapus filter atau coba kata lain.` |
| Cached data | `Data tersimpan, terakhir diperbarui 14.05 WIB.` |

---

## 10. Accessibility

### 10.1 Standard and targets

- Web: **WCAG 2.2 AA** (NFR-005).
- Mobile: Android accessibility guidance, TalkBack labels, 48 dp targets, system font scaling, contrast at least 4.5:1 for text and 3:1 for UI boundaries.
- Touch targets: web interactive target at least **44 × 44 px** (product standard; WCAG 2.2 floor is 24 px, which is not accepted here); mobile **48 × 48 dp**, primary actions **56 dp**. Inline text links inside prose are exempt from the 44 px rule; standalone controls are not.
- Text contrast: **4.5:1** for normal text, **3:1** for large text, icons, focus rings, and component boundaries.
- Zero page-level horizontal overflow at 320 CSS px and 400% zoom. Tables may scroll inside their own container.
- Focus is always visible and never fully obscured by sticky bars or overlays (WCAG 2.4.11).
- Color is never the only signal (WCAG 1.4.1). Every status has text; every delta has a sign and an accessible label.
- Dragging is never required (WCAG 2.5.7). Cart, list, and quantity operations have visible buttons.
- Customer, vehicle, and odometer data entered at intake are reused in the order, estimate, payment, and receipt; only the plate may be re-confirmed (WCAG 3.3.7 Redundant Entry).
- Help sits in the same place on every screen: "Bantuan" at the bottom of the web sidebar and under "Lainnya" on mobile (WCAG 3.2.6 Consistent Help).
- Authentication does not require a puzzle CAPTCHA or a transcription test (WCAG 3.3.8). Mobile uses a PIN on a large keypad with a "Ganti pengguna" path; web supports password managers; no CAPTCHA.

### 10.2 Keyboard and screen reader

- Landmarks: `<nav aria-label="Navigasi utama">`, `<main>`, `<header>`, `<aside>` where appropriate, one `<h1>` per page.
- Skip link first. Focus order follows visual order.
- Dialogs and drawers trap focus and restore it. Destructive dialogs start focus on Cancel.
- Tables: caption, column headers, `aria-sort`, row action names. Do not use `div` tables.
- Live regions: cart total, payment result, sync state, conflict count, and form summary. Success is polite; blocking errors are assertive.
- Icon-only controls have specific names, not "tombol" or "ikon". Decorative icons are hidden.
- Forms: label, help, error linked; no placeholder-only labels; error summary links to fields.
- Mobile: TalkBack pass on home, intake, payment, queue, and receipt; Switch Access or keyboard pass on the same screens.

### 10.3 Forms and errors

- Validate on blur, not on every keystroke, except normalization previews.
- On submit, move focus to the error summary and announce it. Each error names the field and the fix.
- Never clear a user's entered data on a failed submit.
- Disabled controls always have a visible or programmatically associated reason. If the role can never perform the action, do not render the control; show the permission explanation instead.
- Destructive confirmations state the object, the financial/stock effect, and the recovery limit. The confirm button repeats the verb.

### 10.4 Visual verification protocol

This kickoff contains no application screens, so **rendered visual evidence for this design system is NOT VERIFIED**. The contrast ratios in §2.7 are computed from the token hex values; they are not screenshots.

When the UI exists, design QA must produce, for each target device class:

1. **Desktop web:** 1440 × 900 and 1280 × 800 screenshots of sign-in, dashboard, new sale, intake, payment, receipt, inventory list, stock adjustment, reports, and close-day. Automated axe pass on the same screens.
2. **Tablet:** 768 × 1024 and 1024 × 768 screenshots of the shell, sale, payment, and vehicle history; touch-target measurement at 48 dp.
3. **Phone:** 360 × 800 and 412 × 915 screenshots of PIN sign-in, sale, keypad, payment, offline queue, conflict sheet, and receipt preview. Verify `scrollWidth <= innerWidth` and no clipped totals at maximum font/display size.
4. **Keyboard-only:** complete a mixed sale, a void, and a stock adjustment without a mouse.
5. **Zoom/reflow:** 200% text, 400% zoom at 1280 px, and 320 CSS px width.
6. **Contrast:** token-level audit plus a spot check of disabled, placeholder, focus, and status text.
7. **Receipt:** print 20 worst-case receipts at 58 mm and 80 mm with long names, many tenders, and large totals; read back plate, totals, and payment lines at arm's length.
8. **Physical:** gloved/wet-hand tap test and printer-model test are **NOT VERIFIED** until performed on the buyer's device class and printer.

Screenshots and recordings are stored outside the repository per policy. Unverified classes are reported as `NOT VERIFIED`, never implied.

---

## 11. Originality and clean-room assurance

### 11.1 What this system is not

- It is **not** a copy, port, or derivative of any commercial admin-template item, including the template referenced in the kickoff research.
- No template source file, layout file, page template, CSS value, component code, demo text, sample name, logo, icon, illustration, screenshot, or brand asset is included in this repository or the delivered product.
- The template was used, at most, as public evidence of a general admin genre: persistent side navigation, a top bar, card surfaces, dense tables, and CSS-variable theming. Those are functional conventions, not copied expression.

### 11.2 How originality is assured

| Layer | Original decision |
|---|---|
| Accent color | Petrol `#0E6E66` / `#66D6C4`, an original teal that is not template-derived. The entire palette is original and contrast-verified. |
| Typography | Inter for UI plus IBM Plex Mono for the document layer; both OFL. Receipt preview is derived from the 35/48-column physical constraint, not from a template. |
| Layout | Web shell dimensions and navigation structure are derived from the PRD task analysis: 264 px sidebar, 56 px top bar, 72 px page header, 44 px table rows. Mobile uses four task tabs and a bottom action bar, not a desktop admin shell or a drawer-based phone navigation. |
| Signature | The job-card status rail, canonical plate treatment, and paper receipt preview are original to this product. |
| Icons | Lucide (ISC), an open set, with documented stroke and size rules. No template icon font or sprite. |
| Imagery | None. No stock photography, no demo illustrations, no placeholder portraits. Empty and error states use a single Lucide glyph and text. |
| Content | All UI strings are authored for this product in Bahasa Indonesia; sample/seed data is synthetic and authored in-repo, never copied from a demo. |
| Component code | Built from **shadcn/ui (MIT)** components copied into the repo, Radix primitives, and Tailwind with the tokens in this document. The project owns the copied source; no Ecme or other commercial-template component code is used. |
| Theming | Semantic CSS custom properties generated from `tokens.json`, mapped identically to the mobile theme. The mechanism is standard; the token names and values are original. |

### 11.3 Buyer branding

The product name and wordmark are buyer-configurable (FR-071, D-7). The default wordmark is plain text "Workshop POS" in Inter 600 with no icon. A buyer-supplied name replaces the text; a buyer-supplied accent replaces `accent.*` only after the contrast table in §2.7 is re-run. No template logo, demo brand, or third-party mark is ever used as a placeholder in the product.

### 11.4 Review rule

Before any UI is accepted, a reviewer checks:

1. No file, string, asset, or CSS value traces to a commercial template.
2. Every color, space, type size, radius, and motion value comes from `tokens.json`.
3. Every screen covers the states assigned in `docs/ui/state-matrix.md`.
4. No demo content, fake metric, or non-synthetic customer data appears.
5. The visual language reads as Lembar: status rail, ruled tables, document layer, squared surfaces, paper receipt.

---

## 12. Open decisions and design debt

These do not block the baseline, but they must be resolved before the affected screen is considered final. They are recorded as design dependencies, not silent assumptions.

| # | Item | Owner | Current default | Impact |
|---|---|---|---|---|
| 1 | Buyer vocabulary: nota vs struk, jasa vs servis, spare part vs suku cadang, mekanik vs teknisi (research Q22) | Buyer / Product | Struk, Nota servis, Jasa, Spare part, Mekanik | Every label and receipt line |
| 2 | Tax display and whether PPN is inclusive/exclusive (Q7, PRD BR-002) | Buyer / counsel | Exclusive, 11%, configurable to 0 | Cart summary, receipts, reports |
| 3 | Receipt header/footer content and legal text (Q10) | Buyer | Outlet name, address, plate, items, mechanic, totals, payment lines, thank-you | 35-column layout |
| 4 | Printer width default and tested models (Q20, D-9) | Buyer / ops | 58 mm, 35 columns | Receipt preview and templates |
| 5 | Product name, wordmark, and app icon (D-7) | Buyer | Text wordmark "Workshop POS" | Branding only; tokens unchanged |
| 6 | IBM Plex Mono entry in the license inventory | Ops / architecture | OFL-1.1 verified 2026-11-26 | Handover completeness |
| 7 | Chart palette validation against real report shapes | Design / frontend | Categorical palette in §2.6 | Reports accessibility |
| 8 | Physical verification: gloves, wet hands, 58/80 mm printers, low-end Android | Buyer / QA | Not verified | Mobile and receipt acceptance |
| 9 | Tablet navigation rail vs bottom tabs in the field | Design / buyer pilot | Rail 768–1024 dp, tabs below | Tablet ergonomics |
| 10 | Offline service intake is outside the MVP offline scope; only sales queue locally | Product / buyer | Intake creation requires a connection | Bay workflow if connectivity is poor |

---

## 13. Change control

- A token change updates `tokens.json`, this document where the rationale changes, and the contrast table if a text/background pair moves.
- A new component or variant requires a state entry in `docs/ui/state-matrix.md` and an accessibility note in §8.
- A color or type change is not accepted without a contrast check for both themes and a visual check at 360 dp, 768 dp, and 1280 px.
- The design system version increments on any breaking token rename. Consumers must not silently alias removed tokens.
- No design change may introduce a second accent, a second icon family, a font family beyond Inter and IBM Plex Mono, or a private card style.
