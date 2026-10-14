# Owner requests (Oct 2026): plan

Status: plan only, nothing built. Grouped by theme, with size (S under half a day, M about a day, L multi-day), what the code does today, and what is still unknown. Items marked **Q** need an answer from the owners before building.

## Quick wins (build first)

| # | Item | Today | Plan | Size |
|---|------|-------|------|------|
| 1 | Remove credits from the dashboard | `BpHomeHero` (`BpHome.tsx`) shows a credits pill top right | Delete the pill (keep credits in Classes / Account). Check `creditsBalance` prop still needed elsewhere | S |
| 2 | Member home: 2 tabs on the main page | `BpHome.tsx` has `BpHomeSections` ("Your progress" + "Explore" tiles) under the hero, with a bookings/coaching tile pair | Add a two-tab switcher on Home. **Q**: which two tabs? Suggest **Today** (next class, check-in, event banner) and **Progress** (sessions, club, streak/weekly average) | M |
| 3 | Remove streaks for full-time members | `TodayTab.tsx` `currentStreak()` shows "Current streak" for everyone | Hide when the member's package is not a challenge/short plan. Needs a definition of "full time": **Q** (package with `duration_weeks` null? a flag on `membership_packages`?). Suggest a `show_streak` boolean on the package so the owner controls it | S |
| 4 | FAQs: add more | FAQs live behind Community > FAQs (`CommunityTabs.tsx`) | **Q**: owners supply the questions. Check whether FAQs are hard-coded or coach-editable; if hard-coded, move to a table so owners can edit | S (M if made editable) |
| 5 | Banner on home when an event is scheduled | `gym_events` exist (`GymEventRow`, Community > Events) | Query next upcoming event (within N days) in the dashboard bundle; dismissible card at the top of Home linking to the event. Dismissal in localStorage per event id | S |
| 6 | Email coach from the app | Resend is wired (`lib/email.ts`) | "Email my coach" button (Account / Coach hub) opening a short form -> server action sends via Resend to the coach's email, reply-to = member. Rate limit like the chat limits (0108). Alternative: `mailto:` link, no server work. **Q**: form or mailto? | S/M |

## Member engagement

| # | Item | Today | Plan | Size |
|---|------|-------|------|------|
| 7 | Birthday emails | No date of birth stored (nothing in schema matches `birth`/`dob`) | Add `date_of_birth` (optional) to `client_profiles` and the onboarding form + Account. New daily cron `/api/cron/birthdays` (add to `vercel.json`, same pattern as `checkin-reminders`) sends a templated email via `lib/email.ts`, plus an in-app message / push (`lib/push.ts`). Owner edits the template in settings. Need a "sent this year" guard so reruns don't double send. Back-fill DOB: ask in the next check-in form | M |
| 8 | 100 club: doesn't reset to 0 after a milestone | Home bar uses `sessions % 100` (resets). Rewards tab bar does too, but the reward cards below it use `value / threshold` capped at 100%, so a "100 sessions" reward sits at 100/100 forever, and the 2nd-round (200) reward needs its own row | **Reproduce first**: with a test member at 100 / 101 sessions, compare Home vs Rewards tab. Likely fix: per-reward progress shown relative to the *current* lap, or hide completed rewards behind "Received" and show only the next one. Also make the badge row dynamic (it is hard-coded 100-500). **Q**: which screen showed the wrong number? | S/M |
| 9 | Hide accountability when not on a challenge, plus individual toggles | `Accountability` is a fixed bottom-tab category (`categories.ts`). Packages already have `included_screens` (null = all) and per-client disabled screens | Default: hide the Accountability tab unless the member's package is a challenge. Per-member override from the coach view using the existing disabled-screens mechanism (`toEffectiveDisabledScreenSet`). Individual toggles for the sub-screens (Weekly Log, Check-in, Forms, Habits) via the same list. Bottom bar must cope with 4 tabs | M |
| 10 | Weekly average tabs | `OverviewTab` builds a weekly trend (`buildWeeklyTrend`) | **Q**: weekly averages of what and where (Insights? Weekly Log?). Proposed: tabs for Weight / Calories / Protein / Steps / Sleep, each showing week-by-week average and change vs previous week | M |
| 11 | 6 week challenge countdown: review | `CoachMemberOverview.tsx` ~l.262 builds "6 Week Challenge, week 2 of 6, ends 15 Nov" from `duration_weeks` and `started_at`/`scheduled_end` | Review for edge cases (before start, last week, ended, started mid-week, timezone) and consider showing it to the member on Home, not only coach view. Add unit tests for the week maths | S |

## Training

| # | Item | Today | Plan | Size |
|---|------|-------|------|------|
| 12 | Training: load volume | Sets/reps/weight are logged in `WorkoutTab.tsx`; no volume view | Volume = sum(weight x reps) per exercise, per session and per week. Pure helper in `lib/` with tests, then a "Volume" chart in Progress/Training (per exercise + weekly total). Bodyweight and banded work excluded or counted separately. **Q**: per exercise, per muscle group, or both? | M |
| 13 | Training: progression | Templates already have `progression_load_increment` and `progression_every_weeks` (`ExerciseEditor.tsx`) so *prescription* progresses; member-facing history does not | Per-exercise history chart (best set / estimated 1RM over time), PR flags, and "last time" shown in the workout. **Q**: is this view for members, coaches, or both? | M |

## Progress and body scans

| # | Item | Today | Plan | Size |
|---|------|-------|------|------|
| 14 | Photo comparison: zoom and download | `ProgressTab.tsx` has a Compare mode (l.118) | Pinch / tap zoom with synced pan on both photos in compare view (small gesture helper, no new heavy library); Download button saves each photo, or a stitched side-by-side image via canvas. Photos come from Storage signed URLs, so check CORS for canvas export | M |
| 15 | InBody: QR code | `BodyScansTab.tsx` is manual entry from the printout (+ photo upload to `inbody-scans`) | **Q**: what is the QR? Two readings: (a) the InBody printout / app has a QR the member scans to import results, (b) the gym shows a QR the member scans to open the scan form. Investigate InBody's own app/API (LookinBody Web) before committing; if there is no API, (b) is a deep link to Progress > Body scans, and (a) is unlikely. Spike first | Spike S, build unknown |

## Big Dog

| # | Item | Today | Plan | Size |
|---|------|-------|------|------|
| 16 | Remove the 13th exercise ("run") | `lib/bigDog.ts` has 13 exercises incl. `run_5000`; header comment says "all 13" and Gold = Big Dog in every one; tests in `lib/bigDog.test.ts` | Remove `run_5000` (confirm it is the 13th: the sheet says "5000m run"). Tier thresholds that assume 13 must become 12. Existing results in `big_dog_results` (0063, 0078) for `run_5000`: keep the rows, stop counting them. **Q**: confirm tier cutoffs after the change | S |
| 17 | Automate the Big Dog shirt | Tier is computed (`none/white/turquoise/silver/gold`), shirts handed out manually | When a member's tier rises, create a "shirt owed" record (reuse the rewards `granted` pattern: `lib/data/rewards.ts`), notify the coach, and push the member. Coach marks "given". Owner sees the outstanding list on `/owner` | M |
| 18 | Check the scoring in detail | Standards are strings in `bigDog.ts`, parsed per `ResultKind` | Audit pass: for each of the 12-13 exercises, table-test every boundary (just under/at/over rookie, strong, big dog), both genders, time (lower is better) vs distance/weight, banded = 0 reps, `m:ss` parsing, `<` and `>` operators. Compare with the owners' Member Standards sheet row by row | S/M |

## Owner reports

| # | Item | Plan | Size |
|---|------|------|------|
| 19 | Reports | Extend `/owner` Reports (phase 3 of `OWNER_SIDE_PLAN.md`): retention, attendance trend, coach comparison, CSV export. **Q**: which reports first? The items below are the first set | L |
| 20 | Check-in percentage through the week; check-ins per week; check-ins per day | New security-definer RPCs (owner reads aggregates, per the owner plan): % of members who checked in by weekday (Mon-Sun), count per day, count per week for the last 12 weeks, filter by gym and coach. Need to confirm what counts as a "check-in": weekly check-in form (`lib/utils/checkin.ts`), the `CheckInButton`, or class attendance. **Q** | M |
| 21 | Amount of messages sent | RPC counting chat messages by sender role (coach vs member), per coach, per week; read-only, no content. Feeds the planned Coach messages review | M |

## Wolf Pack challenge: investigation (no build yet)

Nothing named "wolf pack" exists in the code. Investigation deliverable (1 short doc):

1. **Q** to the owners: what is it? Team vs team, whole-gym collective goal, or an individual challenge with a pack leaderboard? Duration, scoring (sessions, steps, points), prizes, who joins.
2. What we already have to build on: gym events + signups, rewards/clubs, packages with `duration_weeks` (how the 6 week challenge works), the activity feed (`ActivityEventRow`), Big Dog self-logging.
3. Options: (a) a special event with a manual leaderboard the coach updates; (b) an auto-scored challenge from sessions and check-ins with teams; (c) full new module (challenges, teams, points ledger, leaderboard, privacy opt-in). Recommend starting with (a)/(b).
4. Privacy: leaderboards expose names and numbers across members, so opt-in and RLS via a view, not raw rows.

## Suggested order

1. **Batch A (one session):** 1, 3, 5, 11, 16, 8. Small, mostly deletions and fixes.
2. **Batch B:** 9, 2, 4, 6, 7 (member app shape and birthday cron; migration for `date_of_birth`).
3. **Batch C:** 18, 17, 12, 13, 14 (Big Dog correctness first, then training/progress features).
4. **Batch D:** 20, 21, 19 (owner reports; depends on definitions of check-in).
5. **Spikes, in parallel when answers arrive:** 15 (InBody QR), Wolf Pack, 10.

## Questions to take to the owners

1. Home page: which two tabs? (item 2)
2. What defines a "full time" member, and should streaks come back for anyone? (3)
3. FAQ content list. (4)
4. 100 club: which screen showed the wrong figure, and at what session count? (8)
5. Which screens count as "accountability" when toggling individually? (9)
6. Weekly average tabs: of which measures? (10)
7. Load volume and progression: member-facing, coach-facing, or both? (12, 13)
8. InBody QR: what does the QR do? (15)
9. Big Dog: after dropping "run", do the shirt tier cutoffs change? (16)
10. What counts as a check-in for the owner stats? (20)
11. Wolf Pack: what is the challenge? (above)
12. Email coach: in-app form or the member's own mail app? (6)

## Cross-cutting rules

- New tables / RPCs ship with RLS and a test under `supabase/tests/`, as in 0105-0115. Owner reads aggregates only.
- Migrations continue from `0116`.
- Calculation engine `lib/calculations.ts` is not touched by any of this. Big Dog changes need updated tests in `lib/bigDog.test.ts`.
