# Fix briefs: how to use these

The audit found about 120 issues. Fixing them in one chat would be slow and risky, so they are split into **self-contained briefs**, one per area. Give **one brief to one chat** (a Claude Code session opened in this repo). Each brief lists exactly what to fix, where, how to check it, and what not to touch.

The evidence behind every ID is in `docs/MEMBERS_APP_AUDIT.md` (H, M, L ids), `docs/COACH_OWNER_AUDIT.md` (CH, CM, CL ids) and `docs/AUDIT_ROUND_2.md` (R ids). A brief repeats what the chat needs, so it can start without reading all three.

## The briefs

| # | Brief | Kind | Findings | Migration numbers |
|---|---|---|---|---|
| 01 | [Database: security and access rules](01-database-security-and-rls.md) | SQL only | H1, H2, CM5, R9, M10, M3 (DB), R31, CL2, M9, M12, R23 (DB) | 0127, 0128 |
| 02 | [Database: gym scoping and permissions](02-database-gym-scoping-and-permissions.md) | SQL only | R36, RF1, CL4, CM6 (SQL), R38 (DB), CM3, CM4, GA1, CH1 (DB), R37 (DB) | 0129, 0130, 0131 |
| 03 | [Database: credits, bookings and integrity](03-database-credits-bookings-integrity.md) | SQL only | CH2 (DB), R26 (DB), SV1, L6, CH4, CM9, R5 (DB), CL3, R33 | 0132, 0133, 0143 |
| 04 | [Coach app: the confirmed high-risk bugs](04-coach-app-high-risk-fixes.md) | App code | R3, R4, R5, R24, R25, R26, R29, R33 (UI), CH2 (UI), library, forms, events, plans | 0135 |
| 05 | [Coach app: active gym model](05-coach-app-active-gym-model.md) | App code | R38, R28, R36 (app), R32, R27, CM9 (app), CP1/SP1, CC and CR items | 0141 |
| 06 | [Member app: data correctness](06-member-app-data-correctness.md) | App code | R11, R12, R14, R15, R19, M2, M8, M12 (UI), L2 to L5, food, check-in, scans, forms | 0136 |
| 07 | [Member app: speed, reliability and UX](07-member-app-platform-and-ux.md) | App code | R13, H5, M1, M3 (app), M4, M5, R8, R16, R17, R18, R20, R21, R22, R23, R43 | 0137, 0138 |
| 08 | [Owner and admin features](08-owner-and-admin-features.md) | App code | R37, R30, CH1 (UI), CH3, CM2, GA, join link, CM5 (app) | 0142 |
| 09 | [Email, push and notifications](09-email-push-notifications.md) | App code | R2 (code), CM1, R40, R41, R42, CM6 (birthdays), R39, class-cancel push | 0139 |
| 10 | [Security hardening and infrastructure](10-security-hardening-and-infrastructure.md) | App code, config | H3 (code), H4, M6, M7, M11, M13, CM8, R8, R43, R44 | 0140 |
| 11 | [Accessibility and polish](11-accessibility-and-polish.md) | App code | L7, shared dialogs, landmarks, headings, touch targets, dates | none |
| 12 | [Your own tasks and decisions](12-owner-tasks-and-decisions.md) | **Not for a chat** | dashboards, data clean-up, decisions D1 to D20, sandbox, release plan | n/a |

Migration numbers are pre-allocated so chats working at the same time cannot collide; gaps are fine (Supabase applies them in order). Apply them to a sandbox, then live, **in numeric order**; `0143` is the last of all, after brief 05 is deployed. If two SQL briefs change the **same function** (for example `cancel_class_occurrence`: 02 adds a past-date check, 03 makes it refund through one shared function), the later brief must start from the **latest definition** in the merged migrations and keep the earlier change.

## How to start each chat

1. Open a **new Claude Code chat in this project folder** (so it can read `CLAUDE.md`, the code and the audit documents). Use a separate git branch per chat.
2. Paste this (change the brief number and name):

   > Work through `docs/fix-briefs/NN-name.md` in this repo. Read `CLAUDE.md` and that brief first, then the audit evidence it points to. Follow its ground rules exactly: never write to the live database, never run seed scripts, do not push. Work item by item, one commit per finding, run `npm test`, `npx tsc --noEmit` and `npm run lint`, and finish by appending a `## Status` section to the brief. If a decision is marked **DECISION Dn** and you have no answer, use the recommended default and tell me.

3. When a chat finishes, open its brief and read the `## Status` section before merging.

**Important:** the `docs/` folder is **not committed to git yet**. A chat that runs in a separate git worktree will not see these files. Either open chats in this folder, or commit `docs/` first (ask me and I will commit it), or paste the brief's text into the chat.

## Order

1. **Today, no code (you):** the items under "Do first" in brief 12 (turn off public sign-up, set the email sender, remove test accounts).
2. **Wave 1, in parallel (no overlap):** 01, 02, 03 (SQL), 10 (hardening). Review each migration, then apply to a **sandbox** first, then live (see "Applying SQL" below).
3. **Wave 2, in parallel after wave 1 is merged:** 04, 06, 08, 09. Brief 04's R5 part uses brief 03's function; its R3 part needs migration 0135.
4. **Wave 3, after wave 2:** 05 (active gym; it touches many coach files, so it goes after 04 and 08), 07 (member speed; it touches shared chat and dashboard files).
5. **Last:** 11 (accessibility; it touches shared components every other brief touches).

If you run several chats at once, give them **separate git branches** (`git switch -c fix/04-coach-high-risk`) so they cannot overwrite each other, and merge in the order above.

## Who owns which files (to avoid collisions)

| Files | Owner brief | Others must |
|---|---|---|
| `supabase/migrations/*` new files | The brief holding that number block | Never edit an applied migration; use your own number |
| `lib/data/forms.ts`, `FormsPane.tsx`, `BroadcastsPane.tsx`, `ProgramTemplateManager.tsx`, `lib/data/programTemplates.ts`, `TimetableView.tsx`, `GroupsManager.tsx`, `app/coach/messages/**`, `useCoachMessages.ts`, `MessagesDrawer.tsx` | 04 | Not edit |
| `app/dashboard/_components/ChatTab.tsx` | 04 first (R4 only), then 07 | 07 starts after 04 is merged |
| `lib/data/classes.ts` (shared, **separate functions**) | 04 (`createClass`, `updateClass`, `deleteClass`), 05 (`grantCredits`), 07 (`getUpcomingBookings`), 09 (`cancelClassOccurrence`) | Edit only your own function; merge in the order below |
| `lib/data/coach.ts`, `coachDashboard.ts`, `memberships.ts`, `CreditsTab.tsx`, `ClientTable.tsx`, `lib/data/gym.ts` (switching), `CoachGymsContext`, `GymSwitcher*`, `app/coach/**/page.tsx` | 05 | Not edit |
| `app/owner/**`, `lib/data/owner.ts`, `GymAdminSection.tsx`, `app/api/coach/*`, `app/api/gym/*`, `JoinLinkCard.tsx`, `lib/data/onboarding.ts` (details request) | 08 | Not edit |
| `app/_components/AppShell.tsx` | 08 (sign-out), then 11 (landmarks) | 11 starts after 08 |
| `lib/email.ts`, `lib/push.ts`, `lib/data/communications.ts`, `app/api/cron/*` bodies | 09 | 10 changes only the secret check at the top of each cron route |
| `next.config.ts`, `vercel.json`, `package.json`, `lib/supabase/middleware.ts`, `app/auth/confirm`, `app/api/join`, `public/sw.js`, `scripts/*` | 10 | Not edit |
| Food, check-in, setup, insights screens and `lib/data/{foodDiary,manualMacros,dailyLogs,clientProfile}.ts` | 06 | Not edit |
| `dashboardBundle.ts`, `DashboardShell.tsx`, `OnboardingFlow.tsx`, `PushPrompt.tsx`, `VoiceRecorder.tsx`, `CheckInButton.tsx`, `CommunityTabs.tsx`, `lib/data/chat.ts` structure | 07 | 09 adds coach notification as a call from `chat.ts` (one line) |
| Shared components (`BottomSheet`, `ConfirmDialog`, `FocusOverlay`, `DropdownMenu`, tab bars) | 11 | Not edit |

## Applying SQL (read before using briefs 01 to 03)

`.env.local` in this repo points at the **live** database. Chats must **write** migration files and tests but **not apply them to live**. The order to apply is:

1. Create a throwaway Supabase project (sandbox) and apply `supabase/schema.sql` and every migration in order, then the new ones.
2. Run the checks in `supabase/tests/security-audit/` against the sandbox only. They refuse to run unless `--ref=<sandbox ref>` is listed in `AUDIT_ALLOWED_REFS`.
3. Run the read-only pre-flight query in each brief on **live** (it counts rows that a new rule would reject).
4. Only then apply to live, in numeric order, one migration at a time, with a database backup taken first.

## Ground rules (every brief repeats these)

1. Read `CLAUDE.md` first. The stack is fixed (Next.js, Supabase, Vercel); the calorie engine `lib/calculations.ts` is validated against a real spreadsheet: **do not change its formulas**.
2. **Never write to the live database or run seed or stress scripts.** `.env.local` is live. In a browser, do not click Save, Send, Delete or Assign against live data; verify with tests, or ask the owner to point `.env.local` at a sandbox first.
3. Never edit an existing migration. Add a new file with your pre-allocated number. Make it idempotent (`drop policy if exists`, `create or replace`). New `security definer` functions set `search_path = public`, use NULL-safe checks (`is distinct from`, `coalesce`), and `revoke execute ... from public, anon` as migration `0105` does.
4. `npm test`, `npx tsc --noEmit` and `npm run lint` must pass before you finish. Add unit tests for pure logic (names and data in tests must be fictional).
5. Stay inside your brief's files (see the ownership table). If you must touch another file, keep the change minimal and say so.
6. No secrets, passwords or personal data in code, logs, tests or commit messages.
7. Make one commit per finding (or per tight group), imperative message, and do not push. Follow your session's attribution rules.
8. When a finding needs an owner decision (marked **DECISION Dn**), use the recommended default if the owner has not answered, make it easy to change, and say so in your final message.
9. At the end, append a `## Status` section to your brief listing each ID as done, partly done or skipped, with the commit hash and anything the owner must check.
