# Feedback Notes — 2026-08-02 batch

Raw feedback from a review pass, triaged and traced against the actual code. Organized by
whether it's a real bug (something broken), a clarity problem (working as built, but
confusing), or a feature gap (missing entirely). Each item names the file(s) involved.

**Status: everything below has been implemented, verified with disposable test accounts, and
deployed to production** — see migration `0025_exercise_max_reps.sql` and the corresponding
code changes across `WeeklyLogTab.tsx`, `DashboardShell.tsx`, `ClassManager.tsx`,
`ExerciseEditor.tsx`, `SetupTab.tsx`, `FoodTrackingTab.tsx`, `TodayTab.tsx`,
`clientExerciseMaxes.ts`, and `WorkoutTab.tsx`; the workout-section restructure
(`FocusOverlay.tsx`); and the Education rebuild (migration `0026_education_courses.sql`,
`lib/data/education.ts`, `EducationPane.tsx`, `EducationTab.tsx`). Left in place as a record
of what was found and why, not as an open punch list.

---

## Bugs (confirmed against code, not just reported symptoms)

### Weekly Log doesn't auto-save — likely explains "Progress doesn't update" and "only Monday logs"
`WeeklyLogTab.tsx` requires an explicit **"Save day" button click per day** — nothing
persists on field change (`updateDay` only touches local `days` state; `saveDay` is the only
path to `upsertDailyLog`, and it's only wired to that one button, line ~358). If a user fills
in several days but only remembers to click Save on Monday, every other day's typed values
are silently lost on refresh/navigation — never reaching `daily_logs` at all. That fully
explains both complaints at once: `OverviewTab.tsx`'s weekly-trend aggregation itself looks
correct (it averages every day with `hasLoggedData` in a week, not just Monday — checked
`buildWeeklyTrend`), so "only Monday shows in graphs" isn't a graphing bug, it's that only
Monday ever actually got saved. Same root cause likely explains "Progress doesn't update
with weekly log saves."
**Direction:** auto-save on blur (same `onBlur`-commit pattern already used throughout the
app — `PhaseLabelInput`, `DayNotesField`, etc.) instead of a manual per-day button, or at
minimum a very visible "unsaved changes" indicator per day if auto-save turns out to be
undesirable for some fields.

### Mobile: several screens are completely unreachable, not just "hard to find"
Confirmed root cause: `AppShell.tsx`'s hamburger button and drawer are both gated on
`sidebar && !bottomBar` (lines ~53 and ~87). Since `DashboardShell.tsx` now **always** passes
a `bottomBar` (the 5-tab bottom bar added in an earlier pass), the hamburger/drawer path is
permanently disabled on every client dashboard view, on every screen size. The `<aside>`
sidebar itself only renders at `md:block` (desktop). Bottom tab bar taps only select a
*category* and land on that category's *first* screen (`screensForCategory`'s array order)
— there is currently **no mobile-visible way to reach a category's second/third screen at
all**. This affects: Recipes + Meal Planner (Nutrition's 2nd/3rd screens — matches "can't
create recipes, no way to change to recipe page"), Activity (Training's 2nd screen), Forms +
Education + Insights (Accountability's 2nd-4th screens), and Progress & Photos (Progress's
2nd screen). This is a real regression, not a missing nice-to-have — it's the single most
impactful item in this whole batch.
**Direction:** needs a mobile-visible sub-screen switcher within a category (e.g. a
horizontal tab strip or dropdown under the header, shown only when the active category has
more than one screen) — the desktop sidebar's sub-nav treatment doesn't need to change, this
is purely a "how does mobile reach it" gap.

---

## Clarity problems (working as designed, but the UI doesn't explain itself)

### "Day #" field on the coach's Classes page
This is `linked_day_position` (`app/coach/classes/_components/ClassManager.tsx`) — links a
recurring class to a stable slot in a client's workout-program block so a self-check-in
resolves to the right day. Right now it's a bare number input with only a hover tooltip
(`title="Linked day position..."`), no visible label/explanation, no indication of which
program day "1" vs "2" actually corresponds to for a given client. Confusing because the
number itself is meaningless without also knowing how workout days are numbered.
**Direction:** needs real inline help copy (not just a tooltip), and probably a way to name/
preview which day a position number maps to rather than a bare integer a coach has to
remember.

### "Absolute" vs "% 1RM" prescription types
Confirmed: `ExerciseEditor.tsx`'s prescription-type toggle (~line 229) is a plain two-button
segmented control with just the labels "Absolute" and "% 1RM" — no explanation anywhere of
what either means or why a coach would pick one over the other.
**Direction:** short inline copy — "Absolute = a fixed weight number you set. % 1RM = a
percentage of the client's tested max for this exercise; the app calculates the actual
target weight for you" — plus probably surfacing it the first time a coach touches the
toggle, not just as permanent clutter.

### Measurements (start/goal) don't show current progress
Confirmed there are actually **two separate measurement systems** that don't talk to each
other: `SetupTab.tsx`'s "Measurements (start / goal)" is a one-time static pair of numbers
per body part; `ProgressTab.tsx` has a real logged-history table (`measurement_logs`) that
**already computes and displays "vs start" and "vs last" deltas** for the most recent entry
(`measurementDelta` in `lib/utils/measurementDeltas.ts`) — genuinely good, already-built
functionality the user hasn't necessarily connected to the Setup screen they're looking at.
The complaint is really "Setup's start/goal feels incomplete on its own," which is true —
it's not meant to be read standalone, it's a target-setting field, and the real progress
story lives in Progress & Photos.
**Direction:** worth deciding whether to (a) surface the latest `measurement_logs` value
next to Setup's start/goal fields so the full picture is visible in one place, or (b)
reconsider whether Setup needs its own start value at all, given `measurement_logs`' first
entry could serve as "start" automatically. Needs a product decision, not just a UI tweak.

---

## Feature gaps

### Calorie/macro targets aren't visible where the client actually logs
The calculated targets (BMR/TDEE/protein/carbs/fat from `lib/calculations.ts`) currently only
render inside `SetupTab.tsx`'s "Calculated targets" card. Neither `WeeklyLogTab.tsx` nor
`FoodTrackingTab.tsx` shows target-vs-actual for the day — a client tracking food has no live
comparison against their own goal while they're actually logging.
**Direction:** thread the computed week's target (already computable from `client_profiles` +
`weeklyTarget()`) into both tabs as a simple "X / Y kcal, X / Yg protein" comparison line.

### Home screen cards aren't clickable
Confirmed: every card in `TodayTab.tsx` (nutrition, streak, habits, forms, next class,
credits) is a static `<div>` — none navigate anywhere. Specifically called out: Habits should
jump to the assigned-habits view, Forms should jump to Forms.
**Direction:** wrap each card in a button/link calling the same `handleCategoryClick`/
screen-selection mechanism `DashboardShell` already exposes (same pattern as the new
`CheckInButton` wiring from the last batch of work) — Home already has `onCheckIn` threaded
through for exactly this kind of "card click routes elsewhere" behavior.

### Exercise max testing doesn't support rep-based maxes (2RM/3RM/5RM)
Confirmed `client_exercise_maxes` only has `tested_max` + `is_estimated` — no rep-count
field. A 5-rep max and a true 1RM are currently indistinguishable in the data, which matters
for %1RM prescriptions resolving to the wrong number if a coach records a 5RM as if it were a
1RM.
**Direction:** add a rep-count field to the max-recording flow (`RecordMaxForm` in
`WorkoutTab.tsx` + the `client_exercise_maxes` table), and decide whether %1RM resolution
should (a) only use true 1RM entries, or (b) auto-estimate a 1RM from an N-rep entry via a
standard formula (e.g. Epley: `1RM ≈ weight × (1 + reps/30)`) — a real design decision, not
just a schema add.

### Workout section feels congested; wants a click-into-day flow — SHIPPED
Implemented as a fullscreen "click into a day" overlay (`app/_components/workouts/
FocusOverlay.tsx`, matching the barcode scanner's existing fullscreen pattern), applied to
both `WorkoutTab.tsx` and the coach's Programme Templates builder
(`ProgramTemplateManager.tsx`). Day rows are now compact one-liners; clicking one opens the
day's exercises/notes/batch-apply/session-feedback in a dedicated fullscreen view instead of
expanding inline. The classes check-in flow now opens directly into this overlay instead of
scrolling to an expanded accordion row. Verified end-to-end with disposable test accounts and
deployed.

---

## Education — researched against Kajabi, "Real course structure" tier — SHIPPED

"Education session needs some work" had no specifics, so researched Kajabi (a real
course-delivery platform) to turn it into concrete, gradeable options. Of the three tiers
scoped (Minimal polish / Real course structure / Full Kajabi-style), the user picked
**Real course structure**.

Implemented as a full schema + UI rebuild (migration `0026_education_courses.sql`, dropping
the old flat `education_content`/`education_assignments` tables per the user's choice, since
there was no real production content to preserve): `education_courses` →
`education_modules` → `education_lessons`, with ordering on both modules and lessons
(up/down reorder, same pattern as meal sections), a `education_course_assignments` +
`education_lesson_completions` pair replacing the old single binary complete flag, and a
`courseCompletionPercent`/`isLessonUnlocked` helper pair (`lib/utils/educationProgress.ts`)
driving a per-course progress bar and simple date-based lesson unlocking ("Available from
X").

Coach authoring (`EducationPane.tsx`) and the client/coach-viewing-client view
(`EducationTab.tsx`) both reuse the fullscreen `FocusOverlay` built for the workout
restructure above — a course opens into a fullscreen view listing its modules/lessons
inline, matching the same "click into it, don't expand accordion-style" pattern. Clients get
a "Mark complete" checkbox per unlocked lesson; coaches viewing a client see the same
completions as read-only Completed/Pending. Verified end-to-end with disposable test
accounts (course creation, module/lesson authoring incl. a future-dated `unlock_at`,
assignment, client-side completion + progress-bar persistence after reload, coach read-only
view) and deployed.
