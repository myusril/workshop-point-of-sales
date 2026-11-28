# Accessibility and Locale Audit — WP9 Sign-off

| Field | Value |
| --- | --- |
| Product | Workshop POS |
| Audit date | 2026-11-28 |
| Candidate | WP9 branch `feat/wp9-handover-a11y-backup` (web/API unchanged from WP8 except docs; mobile adds the printer surface) |
| Standard | WCAG 2.2 AA (web); Android accessibility guidance, TalkBack, 48 dp targets (mobile) |
| Auditor | Automated axe sweep + keyboard/viewport tests + token contrast measurement; human review of the records below |
| Related | `docs/ui/DESIGN.md` §10, `docs/STATUS.md` §7.15/§7.17, `docs/ops/handover-evidence.md` |

This record is evidence, not a redesign. WP9 did not change the web visual system or the mobile sale path except the printer picker.

---

## 1. Web — automated WCAG 2.2 AA sweep

Tool: `@axe-core/playwright` 4.14.1, tags `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`, `wcag22aa`.

Command (from `apps/web`, disposable dev database):

```sh
npx playwright test tests/e2e/a11y.spec.ts --project=chromium
```

Observed 2026-11-28: **2 passed in 28.0 s**, zero violations.

| Surface | Result |
| --- | --- |
| `/login` | PASS — 0 axe violations |
| `/` | PASS — 0 |
| `/orders` | PASS — 0 |
| `/catalog` | PASS — 0 |
| `/customers` | PASS — 0 |
| `/vehicles` | PASS — 0 |
| `/inventory` | PASS — 0 |
| `/reports` (default) | PASS — 0 |
| `/reports?report=payment-mix` | PASS — 0 |
| `/reports?report=end-of-day` | PASS — 0 |
| `/audit` | PASS — 0 |
| `/settings` | PASS — 0 |
| `/users` | PASS — 0 |
| `/outlets` | PASS — 0 |

Open violations: **none** on these surfaces. Axe is automated and does not cover every WCAG 2.2 criterion (for example, meaningful reading order in complex tables, cognitive load, or screen-reader announcements); those remain manual/buyer acceptance items.

The first sweep attempt on the same candidate timed out in the 13-route test while a 21-minute Android Gradle build was consuming the same machine. It reported no violations before the timeout. The clean rerun above (after the build finished) is the recorded result; no test timeout was changed.

---

## 2. Web — keyboard, focus, reflow

Command (same environment):

```sh
npx playwright test tests/e2e/home.spec.ts tests/e2e/auth.spec.ts --project=chromium
```

Observed 2026-11-28: **10 passed in 22.5 s**.

| Check | Result |
| --- | --- |
| Login form reachable by keyboard with a visible focus ring | PASS (`auth.spec.ts:107`) |
| Guarded home redirects to login, then shows the signed-in identity | PASS (`home.spec.ts`) |
| Login at 320 px has no horizontal overflow | PASS |
| Staff screen at 320 px has no page-level horizontal overflow | PASS |
| Owner sign-in, invalid credentials, lockout, deactivated account, expired session | PASS (the rest of the auth suite) |

Focus is rendered as a 2 px ring with a 2 px offset from the WP1/WP4 shell; the login keyboard test asserts the visible ring. Sticky bars and overlays were not re-tested beyond the existing suite.

---

## 3. Web — contrast

Ratios are computed from the shipped `docs/ui/tokens.json` light palette with the WCAG 2.2 relative-luminance formula. Axe's `color-contrast` rule also passed on every route above.

| Pair | Values | Ratio | Requirement | Result |
| --- | --- | --- | --- | --- |
| Body text / canvas | `#14191B` on `#F4F5F2` | **16.20:1** | 4.5:1 | PASS |
| Secondary text / canvas | `#4A5559` on `#F4F5F2` | **7.02:1** | 4.5:1 | PASS |
| Muted text / canvas | `#5F6B66` on `#F4F5F2` | **5.07:1** | 4.5:1 | PASS |
| Link text / canvas | `#0A5B54` on `#F4F5F2` | **7.28:1** | 4.5:1 | PASS |
| White on accent | `#FFFFFF` on `#0E6E66` | **6.10:1** | 4.5:1 | PASS |
| Focus ring / surface | `#0E6E66` on `#FFFFFF` | **6.10:1** | 3:1 | PASS |
| Input/select boundary | `#7C8A83` on `#FFFFFF` | **3.61:1** | 3:1 | PASS |
| Danger text / danger background | `#A3231B` on `#FBE9E7` | **6.37:1** | 4.5:1 | PASS |
| Warning text / warning background | `#7A4A00` on `#FDF0DA` | **6.65:1** | 4.5:1 | PASS |
| Success text / success background | `#17603A` on `#E6F2EA` | **6.59:1** | 4.5:1 | PASS |
| Info text / info background | `#33474D` on `#EAF0F1` | **8.48:1** | 4.5:1 | PASS |
| Default separator | `#C9D0CB` on `#FFFFFF` | 1.57:1 | decorative only | Not used as an interactive boundary; inputs/selects use `border.strong` (WP8 fix, re-verified here) |

Dark-mode tokens were not re-measured in this run; the shipped web app is light-mode-first and OS dark mode is `NOT VERIFIED` (see §6).

---

## 4. Bahasa Indonesia sweep

- UI strings are product Bahasa Indonesia by convention; code identifiers, comments, and docs are English.
- A targeted scan of user-facing source (`apps/web/app`, `apps/web/components`, `apps/web/lib`, `apps/mobile/app`, `apps/mobile/src`, excluding tests) for English labels (`Save`, `Cancel`, `Submit`, `Loading`, `Search`, `Add`, `Edit`, `Delete`, `Error`, `Retry`, `Close`, `Back`, `Next`, `Print`, `Settings`, `Users`, `Reports`, `Audit`, `Logout`, `Sign in`, `Sign out`) returned **0 hits**.
- The new printer surface is entirely Bahasa: “Pilih printer”, “Cetak struk”, “Mencari printer…”, “Belum ada printer yang dipasangkan…”, “Izin Bluetooth ditolak…”, “Bluetooth mati…”, “Gagal mencetak…”, “Muat ulang”, “Tutup”.
- Validation/error copy for the printer path is explicit; no browser/library default string is shown.

---

## 5. Mobile — touch targets, labels, TalkBack

| Check | Status |
| --- | --- |
| 48 dp minimum targets in shared components | **Static PASS** — `Button` uses `theme.size.targetMobile`; `IconButton` and `TextLink` enforce the same minimum; the new printer rows use `theme.size.targetMobile` and the modal buttons reuse `Button` |
| Primary action 56 dp | **Static PASS** — `theme.size.primaryMobile` is used by primary `Button` |
| Accessible names on the printer picker | **PASS (RNTL)** — each printer row exposes `Cetak ke <name>` plus the address as a hint; close/refresh have explicit labels |
| Screen-reader/TalkBack labels on the sale and receipt path | **NOT VERIFIED** — no Android device attached (`adb devices` empty) |
| System font scaling / large text | **NOT VERIFIED** — no device |
| 58/80 mm receipt preview | **PASS (unit/DOM)** — receipt columns 35/48 and paper width are covered by the printing/receipt tests |
| Direct Bluetooth printing | **NOT VERIFIED on hardware** — the native module compiles into the debug APK and exposes the expected permissions, but no physical printer was available; see `docs/ops/handover-evidence.md` §WP9A |

No emulator or AVD was created or used.

---

## 6. Not verified / limits

- Real Android device: TalkBack, focus order on the shared device, touch-target measurement, OS font scaling, landscape. `adb devices` returned no attached device at audit time.
- Real 58/80 mm printers (any brand), pairing prompts, and Bluetooth permission flows. The picker and transport are unit-tested; the native write path is not hardware-tested.
- Firefox, WebKit, iOS Safari, and OS dark mode on the web.
- Screen-reader announcement quality beyond axe's automated checks.
- 200%/400% browser zoom and sticky-bar focus occlusion beyond the existing 320 px/keyboard tests.

These are not silently accepted as passed. M3 web sign-off is clean; mobile sign-off is conditional on the buyer's device/printer pilot.
