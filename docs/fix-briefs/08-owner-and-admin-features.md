# Brief 08: Owner and admin features (app code)

**Goal:** make the owner login useful and safe (it is a read-only dashboard today), let gym admins and owners add, move and remove coaches, stop "confirm details" from locking members out, and make account creation safe.

**Migration number reserved:** `0142` (details-confirm flag, join-link rotation).
**Depends on:** brief 02 (owner and admin SQL functions: `owner_gym_roster`, `owner_set_gym_admin`, `owner_add_coach_to_gym`, `owner_remove_coach_from_gym`, `owner_reassign_clients`, `owner_rename_gym`, `owner_set_gym_booking_settings`, `reassign_clients`, `remove_coach_from_gym`, `profiles.deactivated_at`). If not merged yet, code against those names with `// TODO(brief 02)`.
**Read for evidence:** `docs/AUDIT_ROUND_2.md` (R37, R30, R34, "Smaller items: coach and owner screens"), `docs/COACH_OWNER_AUDIT.md` (CH1, CH3, CM2, CL1, CL6, CL10).

## Ground rules (same in every brief)

1. Read `CLAUDE.md`. The stack is fixed. `lib/calculations.ts` formulas must not change.
2. **Never write to the live database, create real accounts or run seed or stress scripts.** `.env.local` points at the live project. Test account-creation code with unit tests and mocked clients, or on a sandbox. In a browser do not click Save, Send, Delete or Add against live data.
3. Never edit an existing migration; new file `0142_*.sql` only, idempotent; functions `security definer` with `set search_path = public`, revoke from `public, anon`.
4. `npm test`, `npx tsc --noEmit`, `npm run lint` must pass.
5. Stay inside this brief's files (ownership in `00-README.md`). No secrets, passwords or personal data in code, logs or tests. One commit per finding, imperative message, do not push.
6. For each **DECISION Dn** (`12-owner-tasks-and-decisions.md`) implement the recommended default and say so.
7. Finish by appending a `## Status` section to this file.

## R37 (DECISION D2). The owner login can only look at five totals (Medium, reported by the owner)

**What the owner reported and the code confirms:** no member data on screen, no way to change a password or settings, no way to assign coaches, and **no way to sign out on a phone**. `/owner` is the only owner page; every `/coach/**` page and coach API refuses the owner role (confirmed live: redirects and 403).

### First, the quick fix (do this commit first)
- **Sign-out missing below 768 px.** `app/_components/AppShell.tsx:80-81` hides the header Sign out when a page passes `mobileHeader`, assuming that page has an Account screen. `OwnerShell.tsx` passes `mobileHeader` but has none. Show Sign out in the owner header at every width (or remove `mobileHeader` from `OwnerShell`). This is the only edit you make in `AppShell.tsx`; brief 11 adds landmarks afterwards.

### Then the owner area (default scope D2)
1. **`/owner/account`:** change password and email (reuse `ChangePasswordForm`, `ChangeEmailForm`), theme, sign out, and (once enabled in Supabase) two-factor enrolment. The avatar in the header links to it.
2. **`/owner/gyms/[gymId]`:** for a gym in the owner's organisation, a **read-only roster** from `owner_gym_roster` (member name, coach, plan, last active, status; no health data), with search and paging; every number on the Overview ("99 no plan", "24 plans ending", "114 flagged") links to the matching filtered roster.
3. **Owner actions on that page** (all through brief 02's `owner_*` functions, each with a confirmation): add a coach (see CM2 below), move all of one coach's members to another coach, remove a coach from the gym, make or remove a gym admin, rename the gym, set booking rules (reuse the forms in `GymAdminSection.tsx`, which you also own, but parameterise them with a `gymId`).
4. **Role gate:** each new page checks `role = 'owner'` and that the gym belongs to the owner's organisation (the database refuses too).

## R30. Owner screens: errors, numbers and labels (Medium)

- **`lib/data/owner.ts:88` (`getOwnerActivityReport`)** returns `null` on any error and `ReportsPane.tsx` then says "Reports are not available yet. Run migration 0120" (a timeout looks like a missing setup step); `load()` has no try/catch so a network error leaves "Loading reports…" forever; `app/owner/page.tsx:17` shows "Owner access is not set up yet. Run migrations 0102 and 0103" on any failure. **Change:** return `{ ok, data, error }`; show "We could not load this. Try again" with a Retry button; log the technical reason (Sentry), never show migration instructions to the owner.
- **Misleading numbers:** "Checked in this week" compares the **part-finished** current week with last week's complete figure (a Monday looks like a collapse): label it "so far (Mon to Wed)" and compare with the same days last week. "Classes attended this month" compares month-to-date with the whole of last month ("-50%" on the 14th): compare equal day ranges. The weekday averages ("last 8 complete weeks") include weeks before anyone logged anything: start at each gym's first activity week. `thisWeek`, `best`, `worst` assume non-empty arrays (TypeError on an empty result): guard them.
- **Consistent member counts:** the Overview "Members" counts all client rows (224 live, 219 of them test accounts) while Reports counts only onboarded members (5). Show both labelled ("members", "finished onboarding") on both screens.
- **Labels:** coaches show as their login address when they have no display name (use the shared name helper from brief 05 `lib/gymNames.ts`: `prettyName(email)` fallback); every coach is labelled "Gym admin", which says nothing: show it only when some coaches are not admins; the brand name "Ballistic Performance" is typed in `OwnerShell.tsx` and a regex: use `organisations.name`.
- **Acceptance:** unit tests for the comparison-range helper and the retry behaviour of the loader.

## CH1 (UI). Remove a coach, reassign members (High)

- `GymAdminSection.tsx` (roster rows): add **Reassign members…** (choose the receiving coach; shows the count) and **Remove from gym** (refused while the coach still has members; explains why). When `remove_coach_from_gym` reports the coach has no gym left, call a new route `app/api/gym/deactivate-coach` (admin client: `auth.admin.updateUserById(id, { ban_duration: '876000h' })`; checks the caller is an admin of that gym or an owner of its organisation) so the login stops working; add "Reactivate".
- Show display names without repeating the email (a coach with no display name currently appears twice); the last-admin refusal from the database (GA1) must show its message, not a generic error.

## CH3. "Ask all my clients to confirm details" locks members out (High)

- **Where:** `lib/data/onboarding.ts:234-263` (`requestDetailsUpdate`, `requestDetailsUpdateForAll`) sets `onboarding_completed_at = null`; `app/dashboard/page.tsx:28` then renders only `OnboardingFlow` (no skip, no sign-out); the button sits in `JoinLinkCard.tsx` inside the Add client popover behind one confirm.
- **Change:** migration `0142` adds `client_profiles.details_confirm_requested_at timestamptz null`; the two functions set that instead of clearing `onboarding_completed_at`. The member sees a **dismissible banner** on Home ("Your coach asked you to check your details") that opens the onboarding flow in "confirm" mode (brief 07 supports the mode); finishing clears the flag; "Later" hides it for a day. Move the button out of the Add client popover into the Clients page menu, and make the confirm text say what members will see.
- **Coordinate:** `lib/data/onboarding.ts` is also edited by brief 06 (`submitOnboarding` and its helpers). Keep your change to the two request functions.

## CM2 (+ IC1). Creating coaches and members (Medium)

Files: `app/api/coach/create-client/route.ts`, `app/api/coach/import-clients/route.ts`, `app/api/gym/create-coach/route.ts`, `AddClientForm.tsx`, `ImportClientsButton.tsx`, `GymAdminSection.tsx` (`AddCoachForm`). Role checks are correct (verified live: a member and an owner get 403).

- **Orphan logins:** the Auth user is created first; if the profile insert fails nothing deletes it and the address is then "already registered" with no profile. Delete the Auth user on failure (as `/api/join` does).
- **Passwords shown in plain text and passed on by hand:** the coach sees a temp password to copy into a message; nothing forces a change. **Default:** generate a **password-set link** (`auth.admin.generateLink({ type: 'recovery', email })`) and show that to copy; keep the account unusable until used. No plaintext password in any response or screen.
- **Email handling:** trim and lower-case; validate with a real pattern (the import only checks for an `@`, so a free-text cell containing `@` is submitted as an email); the response for "already exists" must be one neutral message (today any coach learns whether an email exists at **any** gym, and a gym admin learns whether it is a client or a coach).
- **Import (`import-clients`):** up to 200 accounts one by one inside one request; if the function times out partway the accounts exist and the passwords are gone. Process in batches of 20 (the screen calls the route repeatedly and shows progress); the UI pre-checks the 200 cap; results are a downloadable CSV (use the guarded `toCsv`) of email and set-password link, not an on-screen password list.
- **Add coach by email attaches them to your gym silently** (`add_coach_to_gym`): show who was added and that an existing account was used.
- **Send a reset link from the coach side (CL6):** a "Send password reset link" action on the member's page produces a link to copy (and emails it when email works).

## Smaller items

- **JL1:** `getMyJoinLinkToken` (`lib/data/onboarding.ts`) **creates** the coach's sign-up link the first time the Add client popover is shown (a read that writes), and the card disappears silently on error. Create only on an explicit "Create sign-up link" click; show an error with Retry; add **Reset link** (migration `0142`: `rotate_my_join_link()` makes a new token, the old one stops working; today a leaked link can only be switched off and on).
- **CPF1:** saving the display name does not refresh the page (the header and Account card keep the old name): `router.refresh()`. **DC1:** the default check-in reminder select must revert if the save fails and must be able to show a stored value outside the options (for example 10).
- **CM5 (app half):** `uploadCoachLogo` (`lib/data/coachSettings.ts`) names the file from its extension, never deletes the previous logo, and accepts any size/type on the client: validate type (png, jpeg, webp) and size (1 MB) before upload, delete the old object after a successful replace (brief 01 enforces the same in the database).
- **R16 (admin field):** add a "Referral link" URL field to the gym settings form (`gyms.referral_url`, added by brief 07's migration `0138`).
- **GA timezone:** the confirm for changing the gym timezone also says already-booked sessions move by the offset; the blackout form rejects `start == end`.
- **CL7:** record who changed an admin flag (a small `admin_audit` table is fine, in `0142`).

## Definition of done

- Quick fix committed first; the owner area, roster, actions and account page work against brief 02's functions (or are mocked behind clearly named functions); unit tests for the report helpers and the account-creation helpers (email normalisation, batch splitting, rollback).
- `## Status` lists which owner actions were built, anything skipped, and the exact owner steps (enable two-factor, set referral URL).


## Status

Branch `fix/08-owner-admin`. `npm test` (86 files, 812 tests), `npx tsc --noEmit` and `npm run lint` on the changed files all pass. Nothing was written to the live database, no account was created, no seed script was run, nothing was pushed.

**What was and was not checked.** The SQL has only static checks (`supabase/tests/migration-owner-admin.test.ts`); there is no local Postgres, so it must run on the sandbox first. I looked at the coach side of the running app (Clients page menu, Add client popover, Settings > Gym) in the preview, read only, signed in as a coach. I could **not** look at the owner pages: the browser was signed in as a coach, and I never sign in for you. The account-creation, reset-link and switch-off-login routes are covered by unit tests of their rules, but were not run against a real project.

| ID | Result | Commit | Notes |
|---|---|---|---|
| R37 quick fix | Done | `6b04942` | Sign out shows on phones in the owner header (`signOutOnMobile` on `AppShell`). |
| R37 owner area | Done, except two-factor | `aa2ea9e`, `33c53b8` | `/owner/account` (change password, change email, theme, sign out; the header avatar links to it). `/owner/gyms/[gymId]`: read-only **Members** list from `owner_gym_roster` (no health data; search, filter, paging), **Team** (move members, remove coach, make or remove admin, add coach) and **Settings** (rename, booking rules, referral link), all through the `owner_*` functions with a confirmation. Every number on the Overview for a single gym, and the red-flag count, opens the matching filtered list. Role gate: each page checks role `owner` and that the gym is in the owner's organisation (unknown gym is a 404); the database checks again. |
| R37 two-factor enrolment | **Skipped** | | Supabase two-factor is not switched on, and the sign-in page has no code step (the login page belongs to brief 10). An enrolment card on its own would look protective and do nothing. Do both together later (see owner steps). |
| R30 | Done | `33c53b8`, `de34260` | Loaders return `{ ok, data, error }`; a failure says "We could not load this. Try again." with a Try again button, and the reason goes to Sentry. Migration instructions are never shown. "Checked in this week" is labelled "so far (Mon to Wed)" and compared with the same days last week (check-ins per member per day, from the 28-day series). "Classes attended this month so far" compares with the same days last month. Weekday averages start at each gym's first check-in week. Empty arrays are guarded. Both screens now label members ("N finished onboarding" on the Overview; "N members in total" on Reports). Coaches with no display name show a readable name; "Gym admin" appears only when some coaches are not admins; the brand and gym names come from `organisations.name`. Tests: `lib/ownerReport.test.ts` (ranges, guards, loader retry). **The like-for-like month figure, the new weekday averages and the "finished onboarding" counts need migration 0142**; until it is applied the screens fall back to the old figures with no comparison percentage, and no error. |
| CH1 (UI) | Done | `ef9e1be`, `aa2ea9e` | Same controls for a gym admin (Settings > Gym) and the owner: **Move members…** (choose the receiving coach, shows the count, confirms), **Remove from gym** (refused with an explanation while the coach still has members, and for yourself), admin switch. The last-admin refusal from the database is shown as written. When the coach has no gym left, `/api/gym/deactivate-coach` switches the login off (`ban_duration`); it only acts on a coach the database already marked as removed from every gym, called by that gym's admin or the organisation's owner (rules in `lib/gymAccess.ts`, tested). Names no longer repeat the address. Members are **not** told when moved (the confirm says so). |
| CH1 Reactivate | Partly done | `3fce785` | There is no list of removed coaches to put a button on. Instead, **the owner** adding the same email again (Team > Add a coach) switches the login back on and adds them to the gym. A gym admin cannot do this (they get the neutral "could not add" message): ask the owner. |
| CH3 | Done | `48b57df`, `aa44caf` | `details_confirm_requested_at` replaces clearing `onboarding_completed_at`; Home shows a dismissible banner ("Later" hides it for a day on that device) that opens the short details check; finishing clears the request. The button moved from the Add client popover to a **⋯ menu on the Clients page**, with a confirm that says what members will see. The per-member "Ask them" wording on the Setup tab matches. Old rows already stuck behind the lock-out are not touched (they finish the flow as before). |
| CM2 / IC1 | Done | `3fce785` | No password is made up, shown or sent: new logins get a random password nobody sees and the coach gets a **one-time set-password link** (`/auth/confirm?...&next=/reset-password`, works from any device, expires with Supabase's email link expiry). A failed profile (or membership) write deletes the login again. Emails are trimmed, lower-cased and checked with a real pattern. One neutral message ("We could not add that email. It may already have an account.") for every taken-address case, whatever the address belongs to. Import: batches of 20 per request, progress bar, 200 cap checked before sending, result is a downloadable CSV (guarded `toCsv`) of address and link, no on-screen passwords. Add coach by email says who was added and that an existing login was used. |
| CL6 | Done | `aa44caf` | "Send password reset link" on the member's Setup tab (their own coach or a gym admin of their gym): makes the link, emails it through the existing `sendBroadcastEmail` when Resend is configured, and always shows it to copy. |
| JL1 | Done | `48b57df`, `de34260` | Opening the popover only reads. "Create sign-up link" on a click; "Reset link" (migration function `rotate_my_join_link`) makes a new token and the old one stops working; a failed read shows an error with Try again. |
| CPF1 | Already working | `7f84a98` | `useAction` already refreshes the page after a save, so the header and Account card pick up the new name; only a comment was added. |
| DC1 | Done | `7f84a98` | The reminder select goes back if the save fails and shows a stored value outside the list (for example 10). |
| CM5 (app half) | Done | `7f84a98` | PNG, JPEG or WebP, 1 MB, checked in the browser and in the action; the name comes from the checked type; the old logo is deleted after the new one is saved (and after "Remove logo"). Same limits as the bucket rules in 0128. |
| R16 (admin field) | Done | `ef9e1be`, `bed2b97` | "Referral link" field in Settings > Gym and on the owner's gym page. Needed new functions (nobody can update `gyms` directly): `set_gym_referral_url`, `owner_set_gym_referral_url`, in 0142. |
| GA timezone / blackout | Done | `ef9e1be` | The timezone confirm now says already-booked sessions move by the difference between the zones; a blackout with equal start and end is refused in the form and in both actions. |
| CL7 | Done | `de34260` | `admin_audit` table and trigger on `coach_gym_memberships` (who changed an admin flag, when). No screen: read it in the SQL editor. |

### Migration

Everything is in **`0142_owner_admin_features.sql`** (re-runnable): the details-confirm column, `rotate_my_join_link`, `admin_audit`, the two report functions with extra fields, and the referral setters. I first wrote the report and referral part as `0144`, then folded it into `0142` because a brief 03 test requires `0143` to be the last migration. If you had already applied the first version of `0142`, apply it again. Depends on `0129` (report functions), `0131` (the `owner_*` functions and `deactivated_at`) and `0138` (`gyms.referral_url`). Pre-flight queries are in the file; nothing existing is rejected.

### Owner steps

1. Apply `0142` to the sandbox, then live (backup first). Until `0131` and `0142` are live, the owner roster and team actions will show "We could not load this".
2. In Supabase **Auth, email settings, set the OTP / link expiry** as long as you are comfortable with (up to 24 hours). The set-password links given to new members and coaches use it; the default of one hour can run out before a new member opens it.
3. Set each gym's **Referral link** (Settings > Gym, or the owner's gym page). Until then the Refer a friend screen stays hidden for that gym's members.
4. **Two-factor:** enable TOTP in Supabase Auth, then ask for a follow-up that adds the code step to sign-in (brief 10's files) and the enrolment card to `/owner/account` together.
5. Check that `RESEND_FROM_EMAIL` is set (brief 09 / decision list), or the reset-link email will not reach members; the link is still shown to copy.
6. Run the sandbox checks you use for the earlier SQL briefs against the new functions (I did not add a `security-audit` script for them).

### Hand-offs and things to know

- **Working tree on arrival:** `AppShell.tsx`, `OwnerShell.tsx` and the 0142 file had been reverted or deleted without a commit. With your OK I restored them to the committed versions; nothing else was discarded. Three untracked seed scripts in `scripts/` (`seed-smoke-*`, `seed-walkthrough`) were already there and are untouched and uncommitted.
- A coach switched off by the owner can keep working until their current sign-in expires (up to an hour); Supabase does not end existing sessions when a login is banned.
- Files outside this brief's list that got small edits: `lib/data/gym.ts` (member counts, referral, reassign and remove actions), `app/coach/clients/page.tsx` (the ⋯ menu), `app/dashboard/_components/SetupTab.tsx` (reset-link card, wording), `app/dashboard/_components/DashboardShell.tsx` (mounts the banner), `app/coach/business/_components/OverviewPane.tsx` (uses the shared `prettyName`), `lib/data/types.ts` and `lib/data/clientProfile.ts` (the new column).
- Decision D2 used its recommended default (read-only roster, no health data, actions through the `owner_*` functions).
- `AppShell.tsx` keeps `signOutOnMobile` for brief 11 to work around; the owner pages are the only users.
