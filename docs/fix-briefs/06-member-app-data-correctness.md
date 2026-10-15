# Brief 06: Member app: data correctness (app code)

**Goal:** what a member logs is what is stored, what the coach sees, and what the averages use. Fix the places where food, check-in, profile and training data are lost, invented, zeroed or overwritten.

**Migration number reserved:** `0136` (a nullable `daily_logs.calories`, one reward-progress function change, a mark-all-read function).
**Read for evidence:** `docs/AUDIT_ROUND_2.md` (R11, R12, R14, R15, R19, LT1 to LT4 in "Confirmed live", "Smaller items: member screens"), `docs/MEMBERS_APP_AUDIT.md` (M2, M8, M10, L1 to L5, L9, L11).

## Ground rules (same in every brief)

1. Read `CLAUDE.md`. The stack is fixed. **`lib/calculations.ts` formulas must not change** (validated against a real spreadsheet used with real clients); add guards and wrappers around them in other files.
2. **Never write to the live database or run seed or stress scripts.** `.env.local` points at the live project (the seeded test member's data is live). In a browser do **not** log or save anything against live data. Verify with unit tests (`vitest` only; extract pure logic into helpers; a component-test library needs the owner's approval) or on a sandbox.
3. Never edit an existing migration; new file `0136_*.sql`, idempotent, functions `security definer` with `set search_path = public`, revoke from `public, anon`.
4. `npm test`, `npx tsc --noEmit`, `npm run lint` must pass.
5. Stay inside this brief's files (ownership in `00-README.md`): food, check-in, setup, insights, measurements, photos, scans, workout and account screens and their `lib/data` files. No secrets or personal data. One commit per finding, imperative message, do not push.
6. For each **DECISION Dn** (`12-owner-tasks-and-decisions.md`) implement the recommended default and say so.
7. Finish by appending a `## Status` section to this file.

## Confirmed live (reproduce these in tests)

- **LT1:** a Quick Add of 300 kcal with no macros: the Food screen shows 300; the Coach hub "Today's targets" ring shows 0; the database holds `quick_add_calories = 300` on the entry and `0/0/0` on `daily_logs`.
- **LT2:** after deleting that entry the day's log stayed `0/0/0`, `hasLoggedData` is true, and the Weekly Log said "2 days of food logged" with the average halved (482 kcal instead of 965).
- **LT3:** pressing Tab to move focus onto the Sleep slider saved `sleep = 0` (`upsertDailyLog`); the screen still said "Not logged".
- **LT4:** typing 7 in the Sleep box saved 7; clearing the box and leaving it put 7 back, in the screen and the database. A logged value can never be removed.

## Food and calories

### R11 (DECISION D9). Calories-only entries are invisible outside the Food screen (Medium)
- **Where:** `lib/data/foodDiary.ts` (`syncFoodDiaryToLog` writes protein, carbs, fat only; `entryMacros` uses `quick_add_calories` as entered). Everything else computes calories from macros: Today, Weekly Log averages, Insights, streak, the coach's overview.
- **Default (D9):** add `daily_logs.calories numeric null` (migration `0136`), written by `syncFoodDiaryToLog` as the day's **total kcal including quick adds**; add `dayCaloriesOf(log)` (`lib/utils/dailyLog.ts`) returning `log.calories ?? dayCalories(protein, carbs, fat)` and use it **everywhere** `dayCalories(` is called on a log (`grep -rn "dayCalories(" app lib`). The engine function itself is unchanged. Existing rows keep `calories = null` and behave exactly as before.
- **Acceptance:** unit tests: kcal-only entry gives the day 300; mixed entries sum; a day with no entries gives `null` (see M2).

### M2. An emptied food diary counts as a logged day (Medium)
- `lib/data/foodDiary.ts:147` and `lib/data/manualMacros.ts:99` write `0 / 0 / 0` when the last entry is removed; `hasLoggedData` treats `0` as logged. **Fix:** write `null` (and `calories = null`) when there are no entries. Provide the owner a one-off clean-up query for existing empty days (rows with `0/0/0` and no food entries), **not** run by you.

### FT1 to FT9, FS items (Low-Medium)
- **FT1:** browsing back day by day calls `getFoodDiaryForDate(create=true)` and creates a blank `daily_logs` row for every day viewed, unlimited. Create the row only when the first entry is added; limit look-back to 30 days (D20).
- **FT2:** `todayIso` is memoised once (`FoodTrackingTab.tsx:363`), and Weekly Log `focusedDate` is state; a phone left open overnight logs new food on yesterday. Recompute on `visibilitychange` and with a timer at midnight in the member's timezone.
- **FT3:** every add/remove runs the action, then `loadDate` (another upsert + reads), then `router.refresh()` (the full 40-query bundle). Return the updated entries and totals from the action and update local state; no `router.refresh()` for food changes. (The global refresh pattern is brief 07.)
- **FT4:** `handleAdd*` returns silently when `currentDailyLogId` is null: show an error. **FT5:** `useFoodShortcuts` has no `.catch`; `toggleFavorite` is optimistic with no rollback.
- **FT7:** a barcode scan always adds 100 g with no prompt: open the quantity sheet with the product's serving size. **FT8:** make sure the scanner `<video>` has `playsInline` and `muted` (check on iPhone Safari; note it for the device test).
- **FT9/FS3/FS6:** number inputs have no min or max: `min=0`, sensible maximums (kcal 5,000, grams 2,000, portions 50) with a friendly inline message; the database limits from `0114` stay as the backstop.
- **FS5:** `AddFoodSheet` closes immediately after `onAdd`, so a failed add loses what was typed: close only on success. Quick Add rows can only be deleted: allow edit.
- **MP1:** "Add the whole plan / section to today's diary" duplicates every entry if tapped twice: remember what was added today and show "Already added".
- **RC1:** recipes cannot be renamed; servings must be a whole number.

## Check-in

### R12. Sliders record 0; a logged value cannot be removed (Medium, confirmed live)
- **Where:** `app/dashboard/_components/AccountabilityTracker.tsx` (range input commits on any `onKeyUp` and `onPointerUp`, even without a change; the number box ignores a blank), `WeeklyLogTab.tsx`, `lib/data/dailyLogs.ts` (`upsertDailyLog`).
- **Change:** commit a slider only when its value actually changed from what was shown; a blank number box means "clear this value" and is saved as `null`; a slider at 0 that was never touched is "not logged". Show a small "Clear" control. **Acceptance:** tests of the commit decision (`shouldCommit(prev, next, touched)`) and of blank-to-null.

### R14 (DECISION D20). Old weeks open blank and saving overwrites real data (Medium)
- **Where:** `WeeklyLogTab.tsx` builds past weeks from the 84-day `historyLogs`; older weeks show blank forms; any save writes the whole non-food field set from that blank form (the real stored bodyweight, steps, sleep and notes become blanks). Navigation back is unlimited. Also WL2: the `fieldset onBlur` saves on every blur and refreshes the whole page; the save sends a full stale snapshot (lost updates across devices).
- **Change:** load the day's log when navigating (`getDailyLog(date)`), never from a window; **save only the fields the member changed** (patch); days older than 14 days (default D20) are read-only with "Ask your coach to change this"; saves are debounced and do not call `router.refresh()`.
- **Acceptance:** a test that editing one field produces a patch with only that field.

## Profile and onboarding data

### R15. Setup saves the whole profile from a stale copy (Medium)
- **Where:** `SetupTab.tsx:118,176` holds the **entire** database row (`useState(initialProfile)`) and `lib/data/clientProfile.ts:20` (`upsertClientProfile`) writes every column back. A coach change made while the member has Setup open (needs_coach_review, tracking mode, targets, reminder days) is overwritten; if reminder days, join date or referral source changed, the `0110` guard raises "Not authorized to change coach-managed profile fields" and the member sees a failure they cannot explain.
- **Change:** form state is an **allow-list of member-editable fields**; send only changed fields; map the guard's error to "Your coach updated these details; reload to see them." SU2: members can edit `start_weight` and `goal_weight`; `start_weight` becomes read-only after the first save (coach edits it). SU3: stop writing `timezone: DEFAULT_TIMEZONE` on every save.
- **Coordinate with brief 01 (M10):** its trigger lists the columns a member may still write; match it.

### M8 (DECISION D6, D18). New members see a calorie-deficit target before a coach reviews it (Medium)
- **Where:** `lib/onboarding.ts:95-103`, `lib/data/onboarding.ts` (accepts ages 10 to 100), `lib/calculations.ts:173` (`CALORIE_FLOOR` is advisory).
- **Default:** for a member with `needs_coach_review` set, show "Your coach is setting up your plan" in place of calorie and macro targets (Coach hub, Setup, Today ring) until it is cleared; add a BMI-floor flag and validate `activityLevel` against the allowed options; block under-16s with "Please ask your coach to set up your account" (D18: change the age if the owner decides otherwise). Do not change the engine.
- **Files:** `lib/onboarding.ts`, the validation in `completeOnboarding` and `completeShortOnboarding` in `lib/data/onboarding.ts` (brief 08 edits other functions in the same file, `requestDetailsUpdate` and `requestDetailsUpdateForAll`: keep your change inside yours), and the screens that show targets.

### R19. Insights "maintenance calories" can be nonsense (Medium)
- **Where:** `InsightsTab.tsx` and `estimateAdaptiveTdee` (`lib/calculations.ts`): no minimum span. Five food days and two weigh-ins a day or two apart can give a negative maintenance level, and the card then tells the **member** "N kcal off your plan, ask your coach to review". It also counts zero-calorie logged days (R11, M2).
- **Change (outside the engine):** add `lib/insights.ts` with `trustworthyAdaptiveTdee(logs, profile)` that calls the engine only when: at least 14 days between the first and last weigh-in, at least 10 days with food, and the result is between 1,000 and 6,000 kcal; otherwise show "Needs about two weeks of food and weigh-ins". Exclude days with `calories` null/0 and no entries. Unit-test the guard with the failing case from the audit.

## Other member data

- **L1:** `programWeek` (`lib/data/dashboardBundle.ts:143-146`) takes the first log in an 84-day window, so it reads "week 13" forever. Compute it from the programme's start date. (The file belongs to brief 07; make this one small change and say so.)
- **L2 (streak):** `TodayTab.tsx:30-39` counts from today, so it reads 0 each morning until something is logged, and cannot exceed 85 days. Count from the latest logged day, allow "yesterday" to keep the streak alive, query beyond the 84-day window; extend `lib/streak.test.ts`.
- **L3:** `AccountTab.tsx:94-98, 113-117` flip toggles optimistically and never roll back; roll back on failure.
- **L4 (workouts, `WorkoutTab.tsx`):** after deleting a middle set `nextSetNumber = logs.length + 1` reuses a number; an all-empty set can be logged; local block choices are never reconciled with server data; "Finish workout" is only a toast.
- **L5 (`ClassesArea.tsx:94-96`):** blackout hours and cut-off come from `occurrences[0]`, empty when nothing is scheduled; recompute nothing in the browser: take them from the server data for that class.
- **CH1 (hub):** `CoachingHub` uses `programs[0]` (the **oldest** programme) for "this block has finished"; use `pickCurrentProgram` as the Workout tab does.
- **PT1 (measurements):** saving an empty form stores an empty row that makes the "Now" column dashes; require at least one value, and make "Now" the latest value **per site**.
- **PT2/PT3/PT4 (photos):** clear the file input in a `finally`; signed photo and printout links last 10 minutes while the screen stays open (use a longer TTL for the viewer or refresh on open); show a busy state during image shrinking.
- **BS1/BS2/L9/L11 (scans and uploads):** the scan date needs `max = today` (UI and server); delete the uploaded file if the row insert fails; build storage paths from a validated extension, not `file.name`.
- **FM1/FM2 (forms):** `FillableForm` drafts live in `localStorage` as `form-draft:<assignmentId>` and survive sign-out: clear them in `SignOutButton` (it only clears `bp-offline-snapshot`); a required number question can be "answered" with `-` or `1.2.3` and then silently dropped: validate it.
- **CC1:** the member credits screen shows a balance but no history and no expiry dates (the bundle fetches `creditsLedger` and drops it, and brief 07 removes that fetch): add a small `getMyCreditHistory(limit 10)` and show expiry dates on bonus credits and "weekly credits reset on Monday".
- **RW1 (rewards):** `member_reward_progress()` counts attended bookings with no status filter while Home counts attended among non-cancelled; unify in one function (in `0136`) and use it for both.
- **NO1:** the bell marks each unread notification read with its own request (up to 50): add `mark_all_notifications_read()` in `0136` and use it.
- **M12 (UI):** brief 01 adds a way to hide or correct a scanned food; add the coach-side control (a "Hide" action on a food in the coach food search) and make the member search skip hidden foods.

## Definition of done

- Each item implemented or skipped with a reason in `## Status`; unit tests for `dayCaloriesOf`, the sync (null on empty), `shouldCommit`, the patch builder, the editable-window rule, `trustworthyAdaptiveTdee` and the streak.
- Owner clean-up queries written (empty `0/0/0` days) but not run.
