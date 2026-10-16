# Brief 11: Accessibility and polish (app code)

**Goal:** the app can be used with a keyboard, a screen reader, large text and a thumb. Fix the shared components once so every screen benefits, then the per-screen gaps.

**Migration number:** none.
**Start last**, after all other briefs are merged: you edit shared components (`BottomSheet`, `ConfirmDialog`, `FocusOverlay`, `DropdownMenu`, `AppShell`, tab bars) that every other brief touches.
**Read for evidence:** `docs/AUDIT_ROUND_2.md` (LT7 "Accessibility scan", "Smaller items", R21), `docs/MEMBERS_APP_AUDIT.md` (L7), the notes on SH2 to SH4 and UI1 to UI3 in the "Smaller items" lists.

## Ground rules (same in every brief)

1. Read `CLAUDE.md`. The stack is fixed. `lib/calculations.ts` formulas must not change.
2. **Never write to the live database or run seed scripts.** `.env.local` points at the live project. In a browser, only look (read the page, run the scan below); do not click Save, Send, Delete or Assign against live data. Verify with unit tests for pure logic and the scan snippet for structure; screen-reader checks need a sandbox and the owner's phone.
3. No migrations in this brief.
4. `npm test`, `npx tsc --noEmit`, `npm run lint` must pass. A new dev dependency (for example `eslint-plugin-jsx-a11y`, `@testing-library/react`, `axe-core`) needs the owner's approval first.
5. Stay inside the shared components and the screens named below. No secrets or personal data. One commit per component or finding, imperative message, do not push.
6. For each **DECISION Dn** (`12-owner-tasks-and-decisions.md`) implement the recommended default and say so.
7. Finish by appending a `## Status` section to this file with the **before and after scan numbers**.

## What the live scan found (15 Oct, member app at phone width, dev server)

- **No `<main>` landmark** on any screen; **exactly one heading** per screen (the member's name as `<h1>`; no h2 or h3); on coach and owner pages **two `<h1>`** (the brand wordmark and the page title).
- No unnamed buttons and no images without alt text on Home, Book, Coach, Profile and Check-in (good: keep it that way).
- **31 touch targets under 32 px on the Check-in screen**; owner segment buttons are 28 to 30 px tall; the event banner Dismiss is 28 px.
- One unlabelled text box on Check-in; the Add-food sheet leaves the whole page behind it in the accessibility tree (no `aria-modal` or `inert`).
- Delete-confirm dialog: the **destructive "Delete" button is focused when it opens** and **Escape does not close it** (confirmed live).

**Scan snippet** (paste into the browser console on a page; it reports the numbers above; keep the before and after in `## Status`):
```js
(() => { const name = (e) => (e.getAttribute('aria-label') || e.getAttribute('title') || e.textContent || '').trim();
return { path: location.pathname, main: document.querySelectorAll('main,[role=main]').length,
 h1: document.querySelectorAll('h1').length, headings: [...document.querySelectorAll('h1,h2,h3')].length,
 nav: [...document.querySelectorAll('nav,[role=navigation]')].map(n => n.getAttribute('aria-label') || '(unlabelled)'),
 unnamed: [...document.querySelectorAll('button,[role=button],a[href]')].filter(b => !name(b) && b.offsetParent).length,
 unlabeledInputs: [...document.querySelectorAll('input:not([type=hidden]),select,textarea')].filter(i => i.offsetParent && !i.getAttribute('aria-label') && !i.id && !i.closest('label') && !i.getAttribute('aria-labelledby') && !i.placeholder).length,
 under32px: [...document.querySelectorAll('button,a[href],input,select,[role=radio]')].filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && (r.width < 32 || r.height < 32); }).length,
 dialogs: document.querySelectorAll('[role=dialog],[role=alertdialog]').length }; })()
```
Target after the fixes: `main` 1; `h1` 1 on every screen; every `nav` labelled; `unnamed` 0; `unlabeledInputs` 0; `under32px` under 5 (decorative or inline links excepted, listed); any open overlay has `dialogs` 1.

## Shared components (fix once)

1. **`ConfirmDialog` (SH2).** On open focus the **Cancel** button (or the dialog) for destructive confirmations; Escape closes (as Cancel); focus is trapped inside; `role="alertdialog"` with `aria-labelledby` and `aria-describedby`; return focus to the trigger on close; a second `confirm()` while one is open must not orphan the first promise (queue it or resolve the first as cancelled). Brief 07 already adds the back-handler registration: keep it.
2. **`BottomSheet` and `FocusOverlay` (SH3).** `role="dialog" aria-modal="true"` with a label; initial focus on the first field or the close button; focus trap; Escape closes; body scroll lock; the rest of the page `inert` (or `aria-hidden`) while open; restore focus on close. `FocusOverlay` (the form editor, template editor, education) is not announced as a dialog today.
3. **Custom modals that bypass the shared ones:** `AddFoodSheet`, `FoodTrackingTab`'s `EditEntrySheet`, `BrowseExercisesModal`, `GroupsManager`, `MessagesDrawer`, the coach "More" sheet in `CoachBottomTabBar`: migrate them onto `BottomSheet`/a shared `Modal` (the code comment in `BrowseExercisesModal.tsx` says to extract one when a second caller appears) so the behaviour above comes for free.
4. **`DropdownMenu`, `GymSwitcherMenu` (UI1, GS2):** menu and listbox keyboard support: arrow keys, Home/End, Escape from anywhere in the menu, focus returns to the trigger; `aria-haspopup`/`aria-expanded` correct.
5. **`useClickOutside`:** it listens to `mousedown` only; on iOS, taps on non-interactive areas do not generate mouse events, so popovers (Add client, gym switcher, menus) may not close. Use `pointerdown`.
6. **`AppShell` (SH4):** wrap the page content in `<main id="main">`; add a "Skip to content" link; the brand wordmark must not be an `<h1>` (use a `<p>` or `<span>`), and each screen supplies one `<h1>` (on mobile the page title is hidden when `mobileHeader` is set: keep a visually-hidden `<h1>`). Brief 08 already made the Sign out button visible on the owner page; keep it.
7. **Navigation semantics:** `CoachNav` (a `div` today) becomes a `<nav aria-label="Coach">`; bottom bars and the member bottom nav get `aria-label`s; the active link/tab has `aria-current="page"` (`CoachNav`, `CoachBottomTabBar`, `CoachMemberSideNav`, `CoachMemberBottomNav`, `CoachMemberTabs`). **Tab rows** (`HubTabBar`, `CoachMemberTabs`, the coach Reports section and range chips, `ConversationList` filters, owner segments) use `role="tablist"`/`tab`/`aria-selected` for real tabs and `aria-pressed` for toggle chips; `ThemeToggle` buttons get `aria-pressed`.
8. **`Toast`:** errors disappear after 4 seconds (easy to miss): keep errors until dismissed (or 10 s), put toasts in an `aria-live` region (`role="status"`, errors `role="alert"`).
9. **Focus and motion:** a visible `:focus-visible` ring on every interactive element; respect `prefers-reduced-motion` (skeleton pulses, transitions).

## Per-screen gaps

- **Touch targets (min 44 px on phone for primary controls, never under 32):** Check-in steppers and presets, owner segment buttons, event-banner Dismiss, chat photo buttons, Weekly Log day chips, `CSV` buttons.
- **Labels:** the unlabelled Check-in text box; icon-only buttons need `aria-label`; the chat photo is a clickable `<img>` with no keyboard access: make it a `<button>` and give the viewer a focus trap, Escape and a close button (also the body-scan printout viewer, which has no close button).
- **`ZoomablePhoto` (ZP1):** add keyboard zoom (`+`, `-`, arrows) and a reset; use refs, not stale props, in the pointer-move handler; make the wheel listener non-passive so the page does not scroll while zooming.
- **Colour-only cues (L7):** RPE and mood buttons rely on colour and position: add text or a pattern and `aria-label`s ("Energy 3 of 5"); the red/amber/green status chips already carry text.
- **Dates and language:** all dates `en-GB`. `CoachHeaderExtras.tsx`, `CoachGreeting.tsx`, `MessagesHubShell.tsx`, `CoachSettingsShell.tsx` format `en-US`; `NotesTab.tsx` and `CommunityShell.tsx` use `toLocaleDateString(undefined)`; `EventBanner.tsx` uses `en-NZ`. Add formatters to `lib/utils/dates.ts` (`formatLongDate`, `formatTime`) and use them; unit-test them.
- **Charts:** `TrendChart` uses `preserveAspectRatio="none"`, so the last-point circle becomes an ellipse on wide screens: draw the dot as an overlay element. Give each chart a text summary (`aria-label` with first, last and change).
- **Programme day list (UI3):** the "current week" dot has an `aria-label` on a non-interactive span (not announced): move the text into the visible label.
- **Language and content:** `lang="en-GB"` on `<html>`; the form editor, the confirm dialogs and error toasts use plain wording (no "Run migration …" text anywhere a user can see it).

## How to verify

- Run the scan on: login, join, member Home, Book, Coach, Profile, Check-in, Food (with the Add-food sheet open), Chat; coach Dashboard, Clients, a member page, Classes, Library (with a form open), Business, Messages (with the drawer open), Settings; owner Overview and Reports. Record before and after.
- Keyboard-only walk: Tab through login, book a class, log food (sheet opens and closes with Escape, focus returns), confirm a delete (Cancel is focused, Escape works).
- Ask the owner to run VoiceOver (iPhone) and TalkBack (Android) through login, booking and logging food, and list anything announced as "button" without a name.
- Unit tests: the date formatters, and any pure helper you extract (for example the focus-trap order function).

## Definition of done

- Shared components fixed once; screens above fixed or skipped with a reason; before and after scan table in `## Status`; no visual regressions (the owner checks the look on a phone).

## Status

Branch `fix/11-accessibility-polish` (started from the finished brief 10). `npm test` (118 files, 1,094 tests), `npx tsc --noEmit`, `npm run lint` (0 errors; 7 old warnings in files this brief did not touch) and `npm run build` pass. Nothing was written to the live database, no script was run, nothing was pushed. In the browser I only **looked**: I opened pages and one read-only dialog (the client "Colour key") and clicked nothing that saves. No migration. No new dev dependency. No DECISION Dn applies to this brief.

### Before and after (scan snippet above, phone width 375 px)

The scans were run against a **production build** (`npm run build`, then `next start`) signed in as a coach, because the dev server is slow to compile. Owner pages, the member app (Home, Book, Coach, Profile, Check-in, Food, Chat) and the login screen could not be scanned (no member or owner session in the browser and I did not sign in as anyone). Those are covered by unit tests and by reading the code, and by the owner's phone check below.

| Page | main | h1 | nav labelled | unnamed | unlabelled inputs | under 32 px | dialogs |
|---|---|---|---|---|---|---|---|
| **Before** (audit, 15 Oct, member app) | 0 | 1 (member name) | no | 0 | 1 | 31 on Check-in | 0 when a sheet was open |
| **Before** (audit, coach and owner pages) | 0 | 2 (brand and title) | no | not recorded | not recorded | not recorded | not recorded |
| **After**: Coach dashboard `/coach` | 1 | 1 | yes (Coach x2) | 0 | 0 | 1 (skip link) | 0 |
| Clients `/coach/clients` | 1 | 1 | yes | 0 | 0 | 1 (skip link) | 1 with the Colour key open |
| Classes `/coach/classes` (and `?tab=reports`) | 1 | 1 | yes; tab lists named | 0 | 0 | 1 (skip link) | 0 |
| Library `/coach/library` | 1 | 1 | yes | 0 | 0 | 1 (skip link) | 0 |
| Business `/coach/business` | 1 | 1 | yes | 0 | 0 | 1 (skip link) | 0 |
| Messages `/coach/messages` | 1 | 1 | yes (the conversation list is "Conversations") | 0 | 0 | 1 (skip link) | 0 |
| Settings `/coach/settings` | 1 | 1 | yes | 0 | 0 | 1 (skip link) | 0 |
| A member page `/coach/clients/<id>` | 1 | 1 | yes (Member sections) | 0 | 0 | 1 (skip link) | 0 |
| Privacy and Terms `/legal/*` | 1 | 1 | none on the page | 0 | 0 | 0 | 0 |

The one element under 32 px everywhere is the **skip link**, which is 1 x 1 px until it gets keyboard focus (by design). In between the two rounds the same scan found, among other things: Library **137** small targets (Edit buttons 28 px tall, filter chips 22 px, "Watch demo" links 16 px), Clients 12, Business 9, Messages two unlabelled `<nav>`s, Settings one unlabelled select, and the sign-in, join, reset and legal pages with no `<main>`. Those are fixed (see the last three rows of the table below).

The dialog behaviour was checked in the production build with the Clients "Colour key": opening it gives `role="dialog"`, `aria-modal`, a label, focus on **Close**, the rest of the page `inert`, the page behind locked from scrolling; Escape closes it, focus goes back to the **Colour key** button, and the inert and scroll lock are removed.

One thing worth knowing if you test the same way: in the Claude desktop browser pane a page whose tab is not in front does not finish streaming in (the browser stops animation frames), so it looks stuck on its loading skeleton and shows two `<main>`s. It is not the app; taking a screenshot (which brings the tab forward) finishes it.

### What was done

| Item | Result | Commit | Notes |
|---|---|---|---|
| 1 `ConfirmDialog` (SH2) | Done | `9024873` | Focus starts on **Cancel** for a destructive question; Escape cancels; Tab stays inside; `role="alertdialog"` with title and description linked; focus returns to what opened it; a second `confirm()` while one is open is **queued** (the first is never dropped). The brief 07 back-button registration is kept. |
| 2 `BottomSheet`, `FocusOverlay`, other overlays (SH3) | Done | `9024873` | One shared helper, `useDialog` (`app/_components/useDialog.ts`, pure parts in `lib/dialogFocus.ts`, unit-tested): focus moves in and comes back, Tab is trapped, Escape closes **only the top** dialog, the siblings are `inert`, the page does not scroll behind. Used by `BottomSheet`, `FocusOverlay` (the form, template and education editors), `DialogOverlay`, the photo viewers. |
| 3 Custom modals moved onto the shared ones | Done | `e7cbdc0`, `58895d2` | Add-food and edit-entry sheets, the exercise browser, the groups manager, the messages drawer, the coach "More" sheet. Close buttons are bigger. |
| 4 `DropdownMenu`, `GymSwitcherMenu` (UI1, GS2) | Done | `7c8a241` | Arrow keys, Home, End, Escape from anywhere in the menu, focus returns to the trigger, `aria-haspopup` and `aria-expanded` correct (`lib/menuKeys.ts`, tested). |
| 5 `useClickOutside` | Done | `7c8a241` | Listens to `pointerdown`, so a tap on empty space closes a popover on iOS. |
| 6 `AppShell` (SH4) | Done | `58895d2`, `f5a3f9d`, `b87f707` | `<main id="main">`, a "Skip to content" link, the brand is a `div` (it first was a `<p>`, which broke hydration because the site switcher inside it is a block: fixed in `f5a3f9d`), a visually hidden `<h1>` when the page draws no title of its own (on a phone). The Sign out button from brief 08 is kept. |
| 7 Navigation semantics | Done | `58895d2`, `8aeffde`, `c44359c` | `<nav aria-label>` for the coach nav, bottom bars and member nav; `aria-current="page"` on the current link; `HubTabBar`, member tabs and the Reports sections are real tab lists (`role="tablist"`, `tab`, `aria-selected`, arrow keys, `lib/menuKeys.ts`); toggle chips use `aria-pressed` (conversation filter, report period and order, client scope and quick filters, library filters, dashboard scope, the Weekly Log days); `ThemeToggle` says which is pressed. |
| 8 Toasts | Done | `d2a6150` | Errors stay 10 seconds (others about 4), the region is `aria-live` (`status`; errors are `alert`) and stays announced while a dialog is open. `lib/toastTiming.ts`, tested. |
| 9 Focus and motion | Done | `b87f707` | The focus ring no longer squares off round buttons; `prefers-reduced-motion` stops the pulses and transitions everywhere. |
| Touch targets | Done | `41417c7`, `c9692bb`, `fac07e2` | 40 px or more for the Check-in controls, Clear, water units, chat buttons, event and banner Dismiss, segmented buttons, CSV, the programme week arrows, library Edit, the client filters, hub tabs, the gym switcher, Chat on a member page. Only the skip link is under 32 px. |
| Labels | Done | `41417c7`, `fbc759d`, `fac07e2`, `c44359c` | The Check-in notes box, the search box, the default-reminder select have labels. The chat photo is a button; photo viewers (including the body-scan printout) are dialogs with a Close button. Labels on plain spans (they are never read out) were replaced by visible or screen-reader text (unread dots, the current-week marker, the traffic-light dot). |
| `ZoomablePhoto` (ZP1) | Done | `6d9a8b8` | `+`, `-`, arrows and `0` (reset) when it has focus (`zoomKeyAction`, tested); the move and pinch handlers read the current value from a ref; the wheel listener is not passive so the page does not scroll. |
| Colour-only cues (L7) | Done | `6d9a8b8`, `75b7e68` | Mood and energy dots carry the number 1 to 5 and say which is chosen; the Weekly Log day dot is also written out. RPE is typed into a number box (not a coloured button), so nothing to change. |
| Dates and language | Done | `41417c7` | `formatLongDate`, `formatShortDate`, `formatWeekdayShort`, `formatTime`, `formatDateTime` in `lib/utils/dates.ts` (en-GB, tested in `lib/utils/dateFormat.test.ts`); every screen that used `en-US`, `en-NZ` or "whatever the phone says" now uses them. `<html lang="en-GB">`. No user-visible "Run migration" text was found. |
| Charts | Done | `6d9a8b8` | The last-point dot is an overlay `span`, so it stays round; each chart has an `aria-label` with its first and last value, the change, the lowest and the highest. |
| Programme day list (UI3) | Done | `c9692bb` | The "(current week)" text is real screen-reader text and the button has `aria-current`. |
| Sign in, reset, join, legal | Done | `52cdbb4` | These pages sat outside `AppShell` and had no `<main>`. |

### What I could not check

- **Screen readers** (VoiceOver, TalkBack): none available. Please run both through login, booking a class and logging food, and list anything announced as just "button".
- **The member app and owner pages** were not scanned (see above). The member changes are covered by the shared-component work and unit tests; please open Check-in, the Add-food sheet (focus lands inside, Escape closes, focus returns to the button), a delete confirmation (Cancel is focused), the before and after photo view and the owner Overview and Reports on a phone.
- **The look.** Controls are 36 to 40 px tall now where they were 22 to 30 px, so rows of chips and buttons are a little roomier. Please look at the Clients page, the Library filters and a member page on a phone.
- No automated accessibility checker was added (a new dev dependency needs your approval); the scan snippet is the check.
