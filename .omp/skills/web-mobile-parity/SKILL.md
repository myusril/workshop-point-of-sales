---
name: web-mobile-parity
description: "Cross-platform UI contract for a web back-office and a React Native mobile app: shared design tokens, breakpoints, touch targets, keyboard and focus, safe areas, modal and sheet behavior, offline banner parity, and accessibility checks."
---

# Web and mobile parity rules

Use this skill when adding or changing a screen, component, navigation pattern,
or state that exists on both the web back-office and the mobile app. The two
surfaces may differ in density and interaction model, but they must not drift
in meaning, tokens, or state vocabulary.

## Shared token contract

- One shared token package is the source of truth for color, spacing, type
  scale, radius, border width, elevation, and motion. Web and mobile consume
  the same semantic tokens through their own adapters.
- Name tokens by role, not by appearance: `surface`, `surface-raised`,
  `text-primary`, `text-muted`, `border-subtle`, `border-strong`, `accent`,
  `accent-contrast`, `danger`, `success`, `warning`, `focus-ring`, `overlay`.
  A token named after a hex value or a specific screen is a defect.
- Raw color, spacing, radius, or font values in a screen or component are a
  defect. They belong in the token package, or in a documented platform
  exception approved as a token.
- Both platforms map the same token to their native mechanism (CSS variables
  or theme extension on web, a theme object or style provider on mobile). Do
  not maintain two independent palettes that happen to look similar.
- Changing a token is a cross-platform change: verify both surfaces and the
  contrast checks before merging. A platform-only token addition needs a
  documented reason and the same semantic name.
- Support light and dark mode only if both surfaces support them; if one
  surface has dark mode, every token used there needs a verified dark value.

## Breakpoints and density

Use a documented, shared breakpoint set rather than per-screen guesses. A
workable default:

| Name | Width | Layout expectation |
|---|---|---|
| Compact | under 600 px | Single column; bottom navigation; full-width forms; sheets |
| Medium | 600–1023 px | Two-column forms where useful; collapsible side navigation |
| Expanded | 1024–1439 px | Dense back-office: persistent sidebar, multi-column detail views |
| Large | 1440 px and above | Expanded content width cap; do not stretch forms edge to edge |

- The web back-office is dense at Expanded and above: tables, filters, and
  keyboard workflows are first-class. The mobile app is one-handed and
  single-column at Compact, with primary actions reachable in the lower half of
  the screen.
- Do not hide a critical action (save, pay, void, sync) at narrow widths. Move
  it into a sticky action area or overflow menu with a visible label.
- Data tables must not become unreadable: below the table breakpoint, switch to
  stacked rows with explicit labels, or allow horizontal scroll with a sticky
  identifier column and a visible scroll affordance. Never truncate money or
  status.
- Respect the 320 CSS px reflow floor on web and test text at 200 percent
  zoom. Layouts must not require two-dimensional scrolling except for genuine
  data tables.
- Mobile layouts must survive font scaling up to 200 percent without clipped
  labels or overlapping controls.

## Touch and pointer targets

- Mobile interactive targets are at least 44 by 44 dp, with at least 8 dp
  between adjacent targets. This includes icon buttons, row actions, and
  destructive controls.
- On web, the minimum target is 24 by 24 CSS px per WCAG 2.2 AA; primary and
  destructive actions should be at least 44 px. Provide spacing so a target is
  not made effectively smaller by a neighbor.
- Do not rely on hover to reveal an action that is required to complete a task.
  Hover may enhance; it may not gate.
- Disabled controls are still identified by label and state to assistive
  technology. Do not remove a control from the layout in a way that shifts the
  primary action under the user's finger.
- Separate destructive actions from the primary action spatially, and require
  an explicit confirmation for void, delete, logout with unsynced data, and
  stock override.

## Keyboard and focus

- Every interactive element is reachable and operable by keyboard alone on
  web. Tab order follows visual and reading order.
- Focus is always visible: at least a 2 px ring using the shared focus token,
  with 3:1 contrast against the adjacent surface. Never use `outline: none`
  without an equivalent visible replacement.
- Focus must not be obscured by sticky headers, footers, banners, or the
  on-screen keyboard (WCAG 2.2 Focus Not Obscured).
- Opening a modal or sheet moves focus into it, traps focus while it is open,
  and restores focus to the invoking control on close. Escape closes a
  non-destructive layer.
- Provide a skip-to-content link and a single logical heading order per screen.
  Announce validation errors and asynchronous status changes through an
  appropriate live region.
- Document keyboard shortcuts on both surfaces if they exist; do not create a
  shortcut that conflicts with browser or operating-system behavior. Mobile
  must remain usable with an external keyboard and with a screen reader.
- Forms submit on Enter where the platform convention allows it; multi-line
  fields and destructive actions do not.

## Safe areas and viewport

- Respect device safe-area insets on mobile: top for status bars, bottom for
  gesture navigation and home indicators. Never place a primary action or
  critical text under the system gesture area.
- Use keyboard avoidance for forms and checkout; the focused field and the
  submit action must remain visible when the keyboard is open.
- Sticky bottom bars account for the keyboard and safe area; they must not
  cover the last row of a scrollable list. Add matching scroll padding.
- On mobile web, prefer dynamic viewport units over a fixed full-height
  calculation, and test with browser chrome visible and hidden.
- Bottom sheets and dialogs must not be dismissible by an accidental edge
  swipe when they contain unsaved sale data; require an explicit discard
  confirmation.

## Modal and sheet behavior

- One interaction layer at a time. Do not stack a sheet on a modal, or a
  dialog on a sheet, except for a system-level confirmation.
- Web uses a dialog with a labelled title, a description where needed, focus
  trap, scroll lock behind it, and focus restoration. Mobile uses a bottom
  sheet for contextual choices and a full-screen screen for complex forms.
- Dismissal rules are explicit and consistent: a sheet with unsaved input
  requires a discard confirmation; a read-only sheet may dismiss on backdrop
  tap; a destructive confirmation never dismisses on backdrop tap.
- Mobile back navigation closes the top layer before leaving the screen. The
  same action on web is Escape or an explicit close control.
- Preserve entered data when a layer is dismissed accidentally only if the
  product explicitly supports drafts. Otherwise discard must be explicit, and
  the loss must be stated before it happens.
- Modal and sheet titles, button labels, and confirmation verbs are identical
  across platforms: the user should not have to relearn the flow.

## Offline and sync banner parity

- Both surfaces use the same state vocabulary: online, offline, syncing,
  pending-sync, synced, conflict. The same state shows the same label and
  severity on web and mobile.
- The banner is persistent while the state persists, not a transient toast. It
  is reachable by screen readers as a polite status region and is not conveyed
  by color alone: pair the color with text and an icon.
- Distinguish "offline" from "online but sync pending" and from "conflict
  requires action". These are different user decisions; do not collapse them
  into one red bar.
- Offline-capable sale screens mark stock as provisional, in the same words on
  both surfaces. The conflict screen shows the product, local quantity, server
  quantity, and the resolution actions.
- The banner includes the pending count and a retry action when a retry is
  meaningful. It never claims data is saved or synced before the server
  confirms it.
- Cached data displays its age or last-sync time, and read-only cached screens
  do not present enabled write controls.
- Web and mobile may place the banner differently (top bar versus above the
  content), but the text, severity, and available actions are the same.

## Accessibility checks

- WCAG 2.2 AA on web: 4.5:1 text contrast, 3:1 for large text and UI
  boundaries, 24 by 24 px minimum targets, visible focus, reflow at 320 px,
  200 percent text resize, and consistent help and navigation placement.
- Mobile: 44 by 44 dp targets, screen-reader labels on every interactive
  element, announced state changes, 200 percent font scaling, and no
  color-only status.
- Every form control has a programmatic label, a described error, and an error
  summary that links to the fields. Required fields are conveyed in text, not
  by an asterisk alone.
- Images that convey information have alternative text; decorative images are
  hidden from assistive technology. Charts include a text or table equivalent.
- Motion respects the reduced-motion preference; loading indicators do not
  flash more than three times per second.
- All UI copy is in Bahasa Indonesia, including empty states, errors, and
  confirmations. Currency uses integer IDR with display formatting; dates are
  unambiguous and use the configured Jakarta timezone.
- Do not use a placeholder as the only label. Do not use color alone to
  indicate selected, required, error, or stock status.

## Parity review checklist

Before calling a UI change complete, verify:

| Area | Web | Mobile |
|---|---|---|
| Tokens | No raw values; shared semantic names | Same tokens through the theme adapter |
| Layout | Expanded density; reflow at 320 px | Single column; 200 percent font scale |
| Targets | 24 px minimum; 44 px for primary | 44 dp minimum; 8 dp spacing |
| Keyboard | Full path, visible focus, dialog trap | External keyboard and screen reader path |
| Safe area | Sticky bars do not cover content | Insets and keyboard avoidance |
| Layers | Dialog focus and dismissal rules | Sheet/back-button and discard rules |
| Offline | Same states, copy, count, and actions | Same states, copy, count, and actions |
| A11y | Axe clean on changed screens | TalkBack pass and target audit |

A visual match is not parity. Parity means the same state, the same words, the
same available action, and the same accessibility guarantee on both surfaces.
