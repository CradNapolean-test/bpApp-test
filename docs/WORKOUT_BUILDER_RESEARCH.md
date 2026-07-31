# Competitive Research: Workout Programme Builders in Coaching Apps

## 1. TrainHeroic

**Builder structure:** Session-first. A coach builds one training session at a time by stacking "blocks" — each block is either an **Exercise** (a single movement with full set/rep/load prescription) or a **Circuit** (free-text instructions for a warm-up/cool-down/conditioning piece where the athlete doesn't log every set). Sessions stack into a program; there's no rigid week/day grid forcing structure — reordering is drag-based via arrow handles.

**Supersets/circuits:** Supersets are created by *linking two Exercise blocks* via a 3-dot menu → "Superset Instructions," which is where shared rest/RPE notes live. This is a deliberate architectural split: circuits are for unstructured/unlogged work, exercises (including supersetted ones) are for logged, trackable work.

**Progression/%1RM:** This is TrainHeroic's signature strength. Coaches prescribe a **percentage** (e.g., "3x5 @ 75%") and the app auto-calculates the load per athlete from their stored **Working Max**. Working Max can be a true tested 1RM or an *estimated* 1RM (NSCA load-chart estimation from any rep test ≤15 reps). One program percentage-scales automatically across an entire roster with different maxes — coaches don't re-author the program per athlete. RPE-based autoregulation is supported as an alternative/complement to percentages.

**Client execution:** Athletes check off sets or tap into a numeric keypad to log reps/load, set types include normal/failure/drop-set/warm-up. Completing a set **triggers a rest timer automatically**, which can go fullscreen or collapse to a mini view while the athlete edits their set.

**Reputation:** Consistently cited as the best-in-class tool for strength/percentage-based programming and timers; less suited to nutrition/general-fitness coaching (that's not its focus).

## 2. TrueCoach

**Builder structure:** Deliberately minimal and text/calendar-first — "free-form," no drag-and-drop workflow builder by design philosophy ("built by coaches for coaches," avoiding flashy complexity). Coach types an exercise name into a calendar-based workout, and the builder **auto-links a matching video demo** from its library as you type.

**Exercise library:** 2,500–3,500+ pre-recorded demo videos (sources disagree on exact count, it's growing); coaches can attach their own video via URL or upload with one click (camera icon next to the exercise field).

**Progression:** No dedicated %1RM auto-calc surfaced in research — progression is manual, coach-authored per week, leaning on the calendar view to "see last week/last month" for reference.

**Client execution:** Clients enter results directly against the prescribed exercise, can attach photos, and each exercise has an **Exercise History** view showing prior logged results for that same movement. Coaches can request qualitative feedback (RPE, notes) as a per-workout or per-check-in convention rather than a rigid structured field.

**Reputation — strength:** "Gets out of your way" simplicity is praised repeatedly. **Complaint:** ironically, several reviews describe the *actual* UI as visually busy/cluttered ("can't tell where one exercise ends and a circuit begins"), too many taps to log a result, and small/hard-to-read result text. Exercise library video quality is inconsistent.

## 3. Trainerize

**Builder structure:** True **drag-and-drop**: exercises live in a right-hand panel and get dragged into a workout list on the left; reordering is drag-based, not button-based. Programs run 4/8/12 weeks with scheduled auto-delivery.

**Supersets/circuits:** First-class distinction — supersets = zero rest between paired exercises + rest after the pair; circuits = a mini rest-punctuated block of multiple exercises, both built directly in the drag UI.

**Progression:** Has both %1RM auto-progression (calculates load off a tested max, similar to TrainHeroic) *and* a separate **Progression Spreadsheet** view — every scheduled instance of a recurring workout laid out as rows so a coach can bump reps/weight/tempo/rest week-over-week in one spreadsheet-like screen. Notably, this spreadsheet is **manual edit, not rule-based auto-progression** (per Trainerize's own idea forum, users are still requesting real automatic week-over-week increment rules).

**Client execution:** After finishing a workout, the client is auto-prompted for an **RPE rating (1–10 scale) plus a free-text comment**, which posts to the coach's timeline/notification feed with a red-dot alert.

**Reputation — strength:** Drag-and-drop + %1RM progression + video library called "one of the strongest programming toolsets available." **Complaints:** exercise library called inconsistent/outdated ("an absolute joke" in one review), templates/copying awkward especially on mobile, workouts occasionally fail to save without a re-open, and older/less tech-savvy clients need extra onboarding.

## 4. PT Distinction

**Builder structure:** Not week/day-gridded — it's **program → named workouts → sections** (e.g., "warmup," "main work"), with a zoomed-out overview of all workouts plus a detailed single-workout editor. It's exercise-first: search-and-add exercises into a section, then tab across fields to fill sets/reps/intensity. A field left blank simply doesn't show to the client — a deliberate "don't clutter what you didn't specify" rule.

**Supersets/circuits:** Visual linking — coaches drag a small "circuit" connector between exercises and a **green line indicates the pairing/grouping** as you build it, rather than a naming/tagging convention.

**Progression/time-savers:** Batch-edit sets/reps/tempo across an entire section at once; copy-paste whole workouts/sections/warm-ups between programs; recently added an **AI program builder** that drafts a structured program from goal/equipment inputs in seconds (reviewed as "a game changer," though needing coach cleanup).

**Exercise library:** Add a fully custom exercise (with a YouTube/Vimeo video, stripped of ads/external links) in under 30 seconds.

**Reputation:** Praised for depth/flexibility and the AI assist; consistently dinged for a **dated client-facing UI** and steep learning curve relative to newer competitors (e.g., Superset).

## 5. CoachRx (by OPEX Fitness — not TeamBuildr; that's a separate, unrelated strength-and-conditioning platform)

**Builder structure:** Calendar-based "Program Design Calendar" explicitly organized around **periodization language** — macro/meso/microcycles — aimed at strength & conditioning coaches, OPEX-style remote coaches, and physical therapists who think in training blocks and phases, not just weeks.

**Exercise library:** ~2,000 video demos in an "Index"; typing an exercise name surfaces a dropdown of matching demo videos to attach; coaches control exactly what a client sees per item (name, video, RPE target, upcoming weeks).

**Progression/RPE:** Recently added dedicated **RPE and training-load tracking tools** for athlete monitoring, aligned with its periodization focus (managing load/fatigue trends over a mesocycle, not just single-session numbers).

**Reputation:** Positioned/marketed as the tool for coaches who need real periodization structure (assessment features, long-term planning, competitive-season awareness) rather than a generic day-by-day builder — a narrower, more advanced niche than TrueCoach/Trainerize.

---

## Concrete Suggestions for `WorkoutTab.tsx` / the program builder

1. **Add a `prescription_type` + `%1RM` auto-calc field** to `workout_exercises` (and default in `exercise_library`): `absolute | percent_1rm | rpe`. When `percent_1rm`, store `percent` and resolve the displayed/logged target load from the client's tested max for that lift — which the spec already tracks via `client_profiles` (DB Press, Squats, Pull Ups, RDL, Hip Thrust). This is TrainHeroic/Trainerize's single most-cited strength: one prescription scales automatically per client without the coach re-typing numbers.

2. **Split "Exercise" vs "Circuit" block types**, mirroring TrainHeroic. Right now every row in `AddExerciseForm` assumes graded logging (sets/reps/load/RPE). Add a lightweight `is_circuit: boolean` (or `block_type`) so a coach can drop in a free-text warm-up/finisher block that renders as instructions only and doesn't force `LogSetForm` on the client — currently every exercise gets a full log form regardless of whether it's a "5 min row" filler.

3. **Add a `set_type` enum to `logSet`** (`working | warmup | failure | drop`), as TrainHeroic does, so the client-facing log (currently just reps/load/RPE) can distinguish a top set from a warm-up set in both the input form and the logged-history summary line (`WorkoutTab.tsx` line ~430).

4. **Give supersets a real linking affordance instead of a free-text group string.** `supersetGroup` is currently a plain text input ("Superset (e.g. A)") — error-prone (typo `A` vs `a`). Replace with a "link to next exercise" toggle/button per row (PT Distinction's drag-and-link pattern), auto-assigning/reusing a group id, and show the existing up/down arrow reordering *within* the superset boundary only.

5. **Add a week-over-week progression rule to program days/templates**, not just static per-exercise numbers. E.g. an optional `progression_rule` on a template exercise (`+2.5kg/week` or `+1 rep/week for 3 weeks then deload`) that `instantiateProgramTemplate`'s RPC applies when generating each week's row — closing the exact gap Trainerize itself hasn't solved (its progression spreadsheet is manual).

6. **Add a client-facing rest timer that actually runs**, not just displays static text. Currently `rest_seconds` is shown as a string ("`60s rest`"); add a small client-side countdown component that starts when a client submits `LogSetForm`, matching TrainHeroic/Trainerize's "log set → timer fires" pattern, which reviewers repeatedly call out as a retention-driving detail.

7. **Prompt for session-level RPE/notes at the end of a day**, not only per-set RPE. Trainerize's "auto-prompt after finishing a workout" (1–10 scale + comment, surfaced to the coach's feed) is a cheap, high-value addition on top of the existing per-set `actual_rpe` — add a `workout_day_logs` (or similar) row keyed on `program_day_id` + date with an overall RPE/comment, surfaced to the coach view as a feed item.

8. **Add a lightweight phase/block label above `week_num`.** CoachRx's meso/microcycle framing is popular with more advanced coaches; a nullable `phase_label` on `workout_program_days` ("Hypertrophy Block 1," "Deload") costs little schema-wise but lets the UI group/header weeks by phase instead of a flat week list.

9. **Batch-apply across a day**, PT Distinction-style: an "apply to all exercises in this day" control for rest-seconds or RPE, since right now each exercise's rest/RPE must be typed individually even when a coach wants the same value across a whole session.

10. **Surface cross-program exercise history to the client**, TrueCoach-style. `logsByExercise` currently only aggregates logs for the *current* program's exercise row; add a lookup by exercise *name* (or a stable `library_id` reference) across all of the client's past programs so `LogSetForm` can show "last time: 3x8 @ 60kg" — a strong adherence/motivation signal cited favorably in TrueCoach reviews.

11. **Custom exercise creation with an attached video should be reachable from the builder inline**, not just via a separate library CRUD screen — PT Distinction's "under 30 seconds" custom-exercise-with-video flow is the benchmark; today `AddExerciseForm` supports a free-text video URL per instance but doesn't let a coach save that new exercise back into `exercise_library` for reuse without leaving the tab.

## Sources

- [TrainHeroic support — Creating Training Sessions](https://support.trainheroic.com/hc/en-us/articles/18156961923981-For-Athletes-Creating-Training-Sessions)
- [TrainHeroic support — Creating Supersets](https://support.trainheroic.com/hc/en-us/articles/18156598268429-For-Coaches-Creating-Supersets)
- [TrainHeroic support — Exercises vs Circuits](https://support.trainheroic.com/hc/en-us/articles/18170960686605-Programming-Exercises-vs-Circuits)
- [TrainHeroic support — Linear Weight Progression or Percentages](https://support.trainheroic.com/hc/en-us/articles/18156690075917-Programming-with-Linear-Weight-Progression-or-Percentages)
- [TrainHeroic support — Testing/Updating Maxes](https://support.trainheroic.com/hc/en-us/articles/18170920165645-Testing-and-Updating-Athletes-Maxes)
- [TrainHeroic support — Logging a Training Session](https://support.trainheroic.com/hc/en-us/articles/18156631592589-Logging-your-Training-Session)
- [TrainHeroic blog — Workout Timer](https://www.trainheroic.com/blog/workout-timer/)
- [TrueCoach — Workout Builder](https://truecoach.co/features/workout-builder/)
- [TrueCoach — Video Exercise Library](https://truecoach.co/features/video-exercise-library/)
- [TrueCoach Help — Adding Demo Videos](https://help.truecoach.co/en/articles/2403878-adding-demo-videos-to-workouts-the-library)
- [TrueCoach Help — Client Experience](https://help.truecoach.co/en/articles/2403707-the-truecoach-client-experience)
- [TrueCoach App Store reviews](https://apps.apple.com/us/app/truecoach/id1439127794?see-all=reviews&platform=iphone)
- [Trainerize blog — Workout Builder Software](https://www.trainerize.com/blog/workout-builder-software/)
- [Trainerize Help — Superset and Circuit Workouts](https://help.trainerize.com/hc/en-us/articles/208688926-How-to-Create-Superset-and-Circuit-Workouts)
- [Trainerize Help — Progressions Spreadsheet](https://help.trainerize.com/hc/en-us/articles/212130826-Progressing-Regressing-Workouts-with-the-Progressions-Spreadsheet)
- [Trainerize blog — Progression View](https://www.trainerize.com/blog/introducing-the-new-progression-view-in-trainerize/)
- [Trainerize Help — RPE](https://help.trainerize.com/hc/en-us/articles/360033937932-How-to-Use-the-RPE-Rating-of-Perceived-Exertion-in-Your-Training)
- [PT Distinction — Feature Spotlight Program Builder](https://www.ptdistinction.com/blog/feature-spotlight-program-builder)
- [PT Distinction — Program Builder Hacks](https://www.ptdistinction.com/blog/efficient-training-programs-program-builder-hacks)
- [PT Distinction — AI Program Builder Demo](https://www.ptdistinction.com/blog/demo-of-the-ai-program-builder)
- [PT Distinction Trustpilot reviews](https://www.trustpilot.com/review/www.ptdistinction.com)
- [CoachRx — Design](https://www.coachrx.app/features-design)
- [CoachRx — Who's CoachRx For](https://www.coachrx.app/whos-coachrx-for)
- [CoachRx — Exercise Library article](https://www.coachrx.app/articles/exercises-index)
- [CoachRx App Store listing](https://apps.apple.com/us/app/coachrx-by-opex-fitness/id1544150077)
