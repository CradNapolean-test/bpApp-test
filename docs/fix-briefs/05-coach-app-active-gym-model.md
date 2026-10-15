# Brief 05: Coach app: the active-gym model and coach data screens (app code)

**Goal:** a coach who works in more than one gym must see **correct** data for their members, never the other gym's plans, timetable or red flags, and must never write to the wrong gym by accident. Also make the coach pages fast enough to use and fix the smaller coach-screen bugs on the same files.

**Migration number reserved:** `0141` (one small function, `coach_unread_total`, only if you choose that approach).
**Depends on:** brief 02 (the SQL that makes plan names readable, validates plan and form gyms, adds `p_gym` to `red_flag_report`, owner functions) and brief 03 (`grant_credits`, `remove_credits`, `grant_credit_pack`). If they are not merged yet, write the app code against the function names in those briefs and mark `// TODO(brief 02/03)`. **Start after brief 04 is merged** (you share coach files with it).
**Read for evidence:** `docs/AUDIT_ROUND_2.md` (R38, R28, R36, R32, R27, R13, "Smaller items: coach and owner screens"), `docs/COACH_OWNER_AUDIT.md` (CM6, CM9).

## Ground rules (same in every brief)

1. Read `CLAUDE.md`. The stack is fixed. `lib/calculations.ts` formulas must not change.
2. **Never write to the live database or run seed or stress scripts.** `.env.local` points at the live project. In a browser do **not** click Save, Send, Delete, Assign or the gym switcher against live data. Verify with unit tests (`vitest` only; extract pure logic into helpers; a component-test library needs the owner's approval) or on a sandbox.
3. Never edit an existing migration; new files only, idempotent; `security definer` functions with `set search_path = public`, revoke from `public, anon`.
4. `npm test`, `npx tsc --noEmit`, `npm run lint` must pass.
5. Stay inside this brief's files (ownership table in `00-README.md`). No secrets or personal data. One commit per finding, imperative message, do not push.
6. For each **DECISION Dn** implement the recommended default and say so (`12-owner-tasks-and-decisions.md`).
7. Finish by appending a `## Status` section to this file.

## What is wrong (read this first)

A coach has an **active gym** stored on their profile; the database's `my_gym_id()` returns it and many policies and lookups use it. A coach can work in several gyms. **Brad's live state:** his active gym is Worsley but all 90 of his members belong to Salford Quays. As Brad, in the live app:

- **Clients:** all 90 show "No plan" ("No plan · 90") although 63 have an active plan (Salford plans are invisible to a Worsley-active coach). "Whole gym" says "No clients at this gym yet" while "My clients" shows 90.
- **A member's page:** "No plan set up" next to "End now" and "Ends Mon 2 Nov"; history just says "Plan". "Change plan" lists only Worsley's three plans.
- **Dashboard:** "Today · 8 sessions, all 0/12" are Worsley's classes, so "0% average class fill" is about the wrong gym; the 38 red-flag follow-ups are filed under Worsley.
- **Broadcast "Whole gym":** "This will message 90 clients" at a gym with none. A newer programme block was built in Worsley, so Salford's other coaches cannot use it.
- **Two tabs:** switch gym in one and the other tab then writes to the new gym (R28).

## R38 + R28. Make screens follow the member's gym (High)

**DECISION D16 (default):** keep `switch_active_gym`, but stop letting it decide what a coach sees about *a member*. Anything about a member uses the **member's gym**; anything about the gym's own timetable, plans, forms, events and templates uses the **active gym**, and the screen says which.

1. **Plan names (`lib/data/coach.ts:110-140`, `getMyClients`).** After brief 02's policy, `client_memberships!client_id(ended_at, membership_packages(name))` returns the name for the coach's own clients. Add a test that a client whose plan belongs to the other gym still shows its plan name. Also fix the member page header ("No plan set up" must not show when a membership exists).
2. **Change plan / Credits tab (`app/dashboard/_components/CreditsTab.tsx`, `lib/data/memberships.ts`).** The plan list shows only plans of the **member's** gym (pass the member's `gym_id`; load with a `getPackagesForGym(gymId)` helper). The bundle's `packages` for the coach member page (`lib/data/dashboardBundle.ts`) must be the member's gym too.
3. **Wrong-gym writes (R28, GS1).** Add `lib/data/gymGuard.ts`: `assertActiveGym(supabase, expectedGymId)` that reads `my_gym_id()` and throws "You changed gym in another tab. Reload this page." when it differs. Every coach write that creates or changes gym-scoped records takes `expectedGymId` (the gym the page was rendered for, available from `CoachGymsContext`) and calls it first: `createClass/updateClass/retire`, `createPackage/updatePackage/deletePackage`, `createCreditPack`, events, rewards, `createGroup`, `composeCommunication` (gym/group), `createFormTemplate/updateFormTemplate`, program templates, `createClient`, `importClients`, settings and roster actions. Keep the diff small: a wrapper `withGymGuard(expectedGymId, fn)`.
4. **Show the gym.** For coaches in more than one gym, the header shows the active gym name (it already does via `GymSwitcherMenu`); add a banner when the coach's own clients belong to a gym other than the active one: "Your members are at Salford Quays but you are viewing Worsley. Switch" with one button that calls `switchActiveGym`. Data function: `getClientGymMismatch()` returning counts per gym of the coach's clients. Label the dashboard "Today · Worsley" so the timetable's gym is explicit.
5. **Business, Library and Broadcast screens** use the active gym; add the gym name to their titles. Broadcast "Whole gym" audience count must count the **active gym's** clients (by `client_gym_id`), not the clients of coaches whose active gym is that gym (`getAudienceCounts` in `lib/data/communications.ts`; the function is owned by brief 09, change only the count query and say so).
- **Acceptance:** unit tests for `assertActiveGym` and the mismatch helper; with a coach active in A and members in B, plan names show, the Change-plan list shows B's plans, the banner appears, and a write from a stale page fails with the friendly message.

## R36 (app half). Red flags and gyms (Medium)

- `lib/data/redFlags.ts`, `app/coach/classes/_components/RedFlagsView.tsx`: call `red_flag_report(p_week_start, p_gym)` (brief 02) with a gym selector for coaches in several gyms; handle the new "not generated" state (the function no longer writes on view, RF1). `lastCompletedWeek()` uses `DEFAULT_TIMEZONE`; use the gym's timezone. The dashboard "Red flag follow-ups" count uses the same gym as the member list.
- `getActiveHold` and `getActiveHoldClientIds` (`lib/data/redFlags.ts:41,61`) compute "today" in UTC; use the gym timezone (CM6).

## R32. "Whole gym" shows colleagues' active members as "Unmonitored / Never logged" (Medium)

- **Where:** `getClientHealthStatuses(supabase, coachId)` (`lib/data/coach.ts:157-205`) only covers the signed-in coach's own members, so in "Whole gym" colleagues' members get no status, are excluded from "Gone quiet" and the CSV, and a colleague's member page says "Not monitored".
- **Change:** statuses for **every** client being shown (own or gym), computed in one call (`get_client_last_active` is per member; batch it). On the member header (`CoachMemberOverview.tsx`), when `lastActiveDate` is null show "Never logged", not "Last active N days ago" (it currently counts days since sign-up).
- **Acceptance:** a unit test of the status function with and without logs.

## R27 + CM9. Credits tab (Medium)

- **History cut at 12 rows (`CreditsTab.tsx`, `lib/data/memberships.ts`):** `getCreditHistory(clientId, limit = 12)` and `getMembershipHistory` (limit 10) back a button that says "Show all N". Add paging ("Load more", 25 at a time) and never label a capped list "all". Weekly reset rows dominate after about 12 weeks, so filter chips "Manual / Bookings / Resets" would help.
- **Use the new RPCs:** `grantCredits`, `grantCreditPack` (`lib/data/classes.ts`, `memberships.ts`) and `removeCredits` call `grant_credits`, `grant_credit_pack`, `remove_credits` (brief 03). Add a confirmation to "Extra session" and "Grant pack"; the amount box must allow clearing (it snaps back to 1 now); the expiry date uses the gym timezone; the hold default date uses the gym timezone. **When this is merged, tell the owner to apply migration `0143`** (it drops the direct ledger insert policy).

## CP1 + SP1. Coach pages are slow (Medium, measured)

Measured on the dev server against the live database with 90 members: `/coach` 6.2 to 6.6 s, `/coach/clients` 4.6 to 5.7 s, **one member's page 10.1 s**.

- `app/coach/clients/[clientId]/page.tsx` runs `loadDashboardBundle` (about 40 queries) plus `getClientHealthStatuses` for **all** the coach's members plus `getCoachChatOverview` for **all** threads, then keeps one row of each. Load only that member's status (`getClientHealthStatus(clientId)`) and a lightweight unread number.
- Every coach page calls `getCoachChatOverview()` only to show the header badge. Add `coach_unread_total()` (migration `0141`, one `security definer` function summing unread for the caller's clients) or reuse an existing count, and use it for the badge on every coach page.
- `getMyClients` and the Clients page render every member (2,900 DOM nodes and 345 KB of HTML for 90 rows). Render the first 50 with "Show more", and use `.range()` and a count query in `getMyClients`/`searchGymClients`/`coachDashboard.ts:217` instead of the silent 1,000-row ceiling (CM6).
- **Acceptance:** no extra queries for statuses of members not shown; the member page issues one status query; unit-test the paging helper.

## Smaller items (same files)

- **CC3:** the dashboard "Happening now / Up next" is computed once; refresh it every minute (`CoachDashboard.tsx`).
- **CC2:** the "Account deletion request" to-do, DELETE badge and "Pending deletion" filter can never fire (deletion is immediate); remove them.
- **MO (member overview):** the weight card uses only the 84-day history, so a member who last weighed in 3 months ago shows "No weigh-ins": fetch the latest weigh-in separately; "Needs you" only looks 2 weeks back for check-ins and 30 days for forms: add an "older, not reviewed" line. Show "Calories (avg)" after brief 06's fix.
- **NV1:** `aria-current` on the coach member nav belongs to brief 11.
- **GS2:** `shortGymName()` hard-codes "Ballistic Performance"; strip the **organisation name** instead (the owner Overview uses a copy of the same regex: share one helper in `lib/gymNames.ts`).
- **HUB1 (all hubs):** the sub-tab is not in the address, so reload resets it; write it to `?tab=` on change (Classes, Library, Business, Messages hubs).
- **CP2, CR:** the "Colleague's member opened read-only" note must say which coach owns them.

## Definition of done

- Items implemented or skipped with a reason in `## Status`; the helpers have unit tests; no write was run against the live database.
- A list for the owner: the data to fix by hand (move "Weeks 9-11" to Salford if wanted, set Brad's active gym) so the new banner does not show.

## Status

Branch `fix/05-active-gym` (cut from `fix/04-coach-high-risk`, so it builds on migrations 0127 to 0135 and 0143), 13 commits plus this status commit, nothing pushed. One migration: `0141_coach_unread_total.sql`.

**Not tried against a real database or in a browser.** There is no sandbox project, and the ground rules forbid clicking Save, Send, Delete, Assign or the gym switcher against live data. What did run: `npm test` (460 pass; the new pure logic is in `lib/` with tests next to it, plus a static test for the migration), `npx tsc --noEmit` (clean), `npm run lint` (0 errors, the same 9 warnings as before) and `next build` (compiles). The screens (banner, Show more, Credits tab, Red Flags gym selector) have only been checked by reading and typing, not looked at.

**Deploy order matters.** This code calls database functions from the earlier briefs: `red_flag_report(p_week_start, p_gym)` and `generate_latest_red_flag_week` (0129), and `grant_credits`, `remove_credits`, `grant_credit_pack` (0133). Apply those before deploying this branch, or the Red Flags tab, "Add credits", "Remove", "Extra session" and "Grant pack" fail. `0141` can go before or after: the badge falls back to the old inbox count if the function is missing. **After this branch is deployed, apply `0143`** (drops the direct ledger insert) and run `credits-integrity-check.cjs --after-0143`; applying it earlier breaks every grant and removal from the old code.

### Findings

| ID | Result | Commit | Notes |
|---|---|---|---|
| R38 (1) plan names | done | `472cb26` | `planNameOf` is exported and tested. A member with an open plan whose row the coach cannot read now reads "Plan" (not "No plan"); the member header says "Plan (name not available)" instead of "No plan set up". The real fix for the name is brief 02's policy (0130). |
| R38 (2) Change plan list | done | `472cb26` | `getPackagesForGym`, `getCreditPacksForGym`, `getClientGymId`. The member page bundle also takes forms, programme templates, courses and the timetable from the **member's** gym (small optional `forGymId` argument on `getFormTemplates`, `getProgramTemplates`, `getCourses`, `getScheduleOccurrences`). |
| R28 / R38 (3) wrong-gym writes | done | `992faf0`, `42cfaab` | `lib/data/gymGuard.ts`: `assertActiveGym` (throws), `checkActiveGym` (returns `{ok:false,error}`, which is what a Server Action must do for the words to survive production), `withGymGuard`. Every write sends the gym the page was drawn for (`useActiveGymId()` from `CoachGymsContext`). Wired: sessions (create, edit, retire, delete), plans, credit packs, events, rewards, groups, broadcasts, forms, programme templates (create, duplicate, import, start), add client, import clients, add coach, gym name, booking rules, admin rights. |
| R38 (4) banner and label | done | `3df6e5a`, `4e84de4` | `getClientGymMismatch()` and `lib/gymMismatch.ts` (tested). The banner shows when **most** of the coach's members are elsewhere (not for one stray member), has one Switch button, can be dismissed for the visit, and is hidden on a member's own page. Dashboard "Today", the average class fill and the Classes, Library, Business and New broadcast titles carry " · Worsley" for a coach in several gyms. |
| R38 (5) audience count | done | `4e84de4` | `getAudienceCounts` now counts the whole gym by the members' own gym (brief 09 owns the file; only that query changed). |
| R25 (hand-off from 04) | done | `4e84de4` | Broadcasts use the gym's own timezone; the send confirmation names the gym for a multi-gym coach. |
| R36 (app) / RF1 / CM6 holds | done | `6f9b203` | `getRedFlagReport(week, gymId)`; gym selector for a coach in several gyms; a "No list has been written" state with a "Write the list now" button for gym admins; the week rolls over on Monday at the gym (`lastCompletedWeekIn`, tested); holds use the date at the member's gym. |
| R32 | done | `f2ab836` | Statuses for the coach's own members **and** the whole gym in one go, so colleagues' members no longer read "Unmonitored". `computeHealth` and `lastActiveLabel` are tested with and without logs; the header says "Never logged". |
| R27 + CM9 | done | `b661949` | `grantCredits`, `removeCredits`, `grantCreditPack` call the three RPCs. Confirmations on Extra session and Grant pack, the amount box can be emptied, and expiry and hold dates use the gym's timezone (`lib/creditsForm.ts`, tested). History is 25 at a time with Load more and filters (All / Manual / Bookings / Resets); plans 10 at a time. Nothing capped says "all". |
| CP1 + SP1 | done | `f2ab836` | A member's page loads that member's last log (one narrow query), unread count and nothing else about the roster. The header badge is one count (`coach_unread_total`, `0141`) on the dashboard, Classes, Library, Business and Settings. Lists read every page of rows (`lib/paging.ts`, tested) and the Clients list draws 50 at a time with "Show more". |
| CM6 (1,000 rows) | done | `f2ab836` | `getMyClients`, `searchGymClients`, `getClientHealthStatuses`, the coach dashboard and the business overview read in pages. |
| CC3 | done | `d58e179` | The dashboard clock ticks every minute and "today" follows the gym's calendar (`lib/todaySessions.ts`, tested). |
| CC2 | done | `f2ab836` | The deletion to-do, DELETE badge, "Deletion requested" badge and "Pending deletion" filter are gone. The member-side `requestAccountDeletion` function is still in `clientProfile.ts` (brief 06/07's file; nothing calls it). |
| MO | partly | `14402ea` | The weight card falls back to the latest weigh-in ever ("Last weighed in on ... Nothing in the last 12 weeks"); an "N older items not reviewed" line appears in Needs you (`lib/memberReview.ts`, tested). **Not done:** "Calories (avg)" (waits for brief 06's fix). |
| GS2 | done | `1b46ed2` | `lib/gymNames.ts` (tested): strips a known organisation name, else the words all of the person's gyms share, else (one gym) what follows the last " - ". The owner screen still has its own copy (`OwnerShell.tsx` is brief 08's). |
| HUB1 | done | `0446890` | Classes, Library, Business and Messages write `?tab=` on change (History API, no server trip). |
| CP2 / CR | done | `14402ea` | The read-only note names the owning coach. |
| D3 journal | done | `013e615` | The delete button on a member note shows only to the coach who wrote it, and other coaches' notes say so. |
| NV1 | skipped | n/a | Brief 11. |

### Files outside the usual list I had to touch, kept small

`lib/data/{classes,forms,education,programTemplates,community,rewards,clientGroups,communications}.ts` (an optional `expectedGymId` or `forGymId` argument), `lib/broadcastSend.ts` (an optional `gymName`), `app/api/coach/create-client`, `app/api/coach/import-clients` and `app/api/gym/create-coach` (one check each: a 409 with "You changed gym in another tab. Reload this page."), `app/coach/settings/_components/GymAdminSection.tsx` (a few one-line wirings), `app/dashboard/_components/{DashboardShell,CoachMemberOverview}.tsx`, `app/coach/_components/workspace/NotesTab.tsx`, `vitest.config.mts` (the `@/` import shortcut, so tests can import modules that use it) and `lib/data/result.ts` (`firstFailure`).

### What the owner must check

1. Apply nothing to live yet. On the sandbox: `0141`, then compare the badge number with the old one for the same coach (the query is in the migration's header).
2. On a sandbox copy of the app, signed in as a coach in two gyms whose members are all in one: the banner appears and Switch works; Clients shows the right plan names; a member's Change plan lists that member's gym plans; Red Flags offers both gyms; in two tabs, switch gym in one and try to add a plan in the other (it must say "You changed gym in another tab").
3. Credits tab on a test member: Extra session and Grant pack ask first; Add credits with the box emptied; "Load more" and the filter chips once the member has more than 25 rows.
4. Then deploy, then apply `0143`.

### Data to fix by hand so the new banner does not show

- Brad's active gym is Worsley but all 90 members are in Salford Quays: set his active gym to Salford Quays (or move his members, if that is where they train now). Until then he will see the banner on every page.
- "Weeks 9-11" was built in Worsley: copy it to Salford Quays if its other coaches need it (there is no "copy to gym" for programme templates yet; Education has one).

### Things to know

- **The guard fails closed but can be wrong in one case:** the gym comes from the layout, which Next does not redraw on a soft navigation. In tab A, after tab B switched gym, clicking to another page in tab A shows the new gym's data but still sends the old gym id, so the first write says "Reload this page". A reload fixes it. The opposite (writing to the wrong gym) cannot happen.
- **Not wired to the guard:** the exercise library, education courses, message templates and per-row edits of template days or exercises (those are by id, so they cannot land in the wrong gym; creating a course or a message template can).
- **"My clients" still includes members in every gym.** The Clients page, the Classes "add client" picker and the Library member pickers list the coach's own members whichever gym they belong to; the banner is what tells the coach why the timetable looks wrong.
- **Hold dates on the Clients list** use the active gym's timezone for every member (members in a gym with a different timezone are off by at most a day near midnight).
- **`get_client_last_active` is read in pages of 1,000 with `.order('client_id').range()`.** If your PostgREST rejects `.order` on that function, the Clients page will error loudly; tell me and I will change it to read the logs table directly.
- **Unread count for a colleague's member** reads 0 (a thread is only readable by the member's own coach).
- `remove_coach_from_gym` does not cancel the removed coach's scheduled broadcasts (brief 02's note): still open for brief 08 or 09.

### Hand-offs

- **Brief 06:** "Calories (avg)" on the member overview (MO).
- **Brief 08:** switch `OwnerShell.tsx` to `lib/gymNames.ts`; adopt `useActiveGymId()` / `expectedGymId` for owner-side writes; the add-coach route already checks the gym.
- **Brief 09:** `getAudienceCounts` is now by the members' own gym; `composeCommunication` takes `expectedGymId`.
- **Brief 11:** `GymMismatchBanner` and `HubTabBar` (`aria-current` on the hubs and the member nav, NV1).
