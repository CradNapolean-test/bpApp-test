# Gym SOPs — mapped to the app

Source: the gym's operating procedures (Google Drive exports, Oct 2026), read in full including the
embedded images and every tab of the Master Session Generator workbook. **Nothing here is implemented by this
file.** It records which SOP touches which part of the app, so later work can be scoped.

Status key: **Covered** = app already does this, **Partial** = some of it, **Gap** = not in the app,
**Off-app** = happens in another tool (PT Distinction, Ontraport, TeamUp, MyFitnessPal, Calendly, Google Sheets).
Status is a code-scan judgement (file names, schema, key functions), not a line-by-line audit. Re-check before building.

Paths: coach UI `app/coach/...`, client UI `app/dashboard/_components/...`, data `lib/data/...`, schema `supabase/migrations/...`.

## Decisions recorded (from the owner)

- **Session length is 45 minutes.** Lift 12 min, then 20 minutes of **Strong or Conditioning**. Each is split into **two 10-minute blocks**, and **the member decides during the workout** which to do. They can **switch after the first 10-minute block**, so valid sessions are Strong + Strong, Conditioning + Conditioning, Strong then Conditioning, or Conditioning then Strong. This replaces the "60 MIN" label and the 30/30 split in the Master Session Generator, which showed both as full blocks. Time left over is warm-up, changeovers and wrap-up.
  - This matches how the workbook is already built: Strong is two pairs (Upper, then Lower) and Conditioning is two groups of four exercises (e.g. the Tue/Fri card's "10MIN AMRAP" panels).
- **Red Flag Tracker is a coach-side report in the app** (SOP 11), not a Google Sheet.

---

## Quick index

| # | SOP | Main app area | Status |
|---|-----|---------------|--------|
| 1 | Weekly Check-In Process | Dashboard "members to check", messages, communications | Partial |
| 2 | Struggle-Solution Framework | Messages, education, nutrition feedback | Gap |
| 3 | Challenge Members Check-In | Accountability tracker, communications, memberships | Partial |
| 4 | Nutrition Calculations + Setting Targets | `lib/calculations.ts`, `lib/onboarding.ts`, Setup tab | Partial (different method) |
| 5 | Nutrition Course (slide scripts) | Education | Gap (content) |
| 6 | InBody Measurements | Body scans, progress photos | Partial |
| 7 | Member Standards Board | Big Dog | Covered |
| 8 | 12 Week Training Overview | Library, program templates, workouts | Partial |
| 9 | Master Session Generator + session cards | Library, program templates | Partial |
| 10 | Conditioning Programming Guide | Exercise library / programme builder | Gap (guidance only) |
| 11 | At-Risk Reporting + Red Flag Tracker automation | Coach report (new), bookings, memberships | Partial |
| 12 | Onboarding a New Member After the Challenge | Join link, memberships, onboarding | Partial |
| 13 | Booking App (TeamUp) staff and member instructions | Classes, credits, booking rules | Covered / Partial |
| 14 | Intro Session SOP (delivery) | Join link, onboarding, measurements, forms, education | Partial |
| 15 | Intro Session Admin (pre and post) | Join link, memberships, classes, messaging | Partial |

---

## 1. Weekly Check-In Process

**What the SOP says**
- Automated check-in message goes to each coach's members **every Sunday 9am**. It asks how the week went and prompts for wins, struggles and focus for next week. The coach can add a personal touch (celebrate a success, follow up an earlier topic, ask something non-gym).
- Coach works through each reply: label every paragraph a **success** (praise it) or a **struggle** (give an obvious solution, or ask a follow-up question first to find the cause).
- Before replying, review results tracking (weight, circumferences) and the food diary, and keep **notes** on the member (targets, things to address).
- Reply by video or written message; video is preferred.
- A "Client Overview" tick-list shows who has been checked in. **All ticks reset at the start of each week.**
- No reply by **Wednesday** → send a nudge ("just checking you're ok").
- Texts / WhatsApp / Instagram outside working hours get a polite reply: coach will respond when back in the gym, and gym questions (nutrition and training) go through the coaching app so everything stays in one place.

**App areas affected**
- Scheduled Sunday message → `lib/data/communications.ts`, `0031_scheduled_communications.sql`, `app/api/cron/send-communications`, `app/api/cron/checkin-reminders`, `0007_checkin_reminders.sql`, `0011_coach_sets_checkin_reminder.sql`.
- Reply workflow and "who is checked in this week" → `app/coach/_components/CoachDashboard.tsx`, `lib/data/coachDashboard.ts` (`WeekCheckin`, `MemberToCheck`), `ReviewQueue.tsx`.
- Messaging including voice → `app/coach/messages`, `ChatTab.tsx`, `app/_components/VoiceRecorder.tsx`, `0040_chat_voice_notes.sql`, `0002_chat_realtime.sql`.
- Member notes → `app/coach/_components/workspace/NotesTab.tsx`.
- Results and food review → `app/coach/clients/[clientId]/page.tsx`, `lib/data/progress.ts`, `lib/data/foodDiary.ts`, `lib/data/nutritionFeedback.ts`.
- Out-of-hours rule is policy; could be repeated in the welcome / join flow (`app/join/[token]/page.tsx`).

**Gaps and open questions**
- No Wednesday "no reply → nudge" automation found.
- Confirm the check-in list resets on a Sunday boundary.
- No success/struggle tagging or reply templates.
- Chat has voice notes; confirm whether coach video replies are supported.

---

## 2. Struggle-Solution Framework

**What the SOP says**
A lookup of common member struggles and the standard coach response, with resources to send.
- **Nutrition**
  - Low protein: a protein source at every meal or snack, bigger portions, a cost-effective protein powder (powder is a supplement, "not magic").
  - Healthy but no results: explain calories and set a tracking target; photo food diary and swap calorie-dense foods.
  - Nights out: **calorie borrowing** (save 100–150 kcal a day for 7 days, or 350–500 kcal a day for 2 days) and get back on track the next day.
  - Structure: meal planning.
  - Vegan protein: lentils, pulses and a vegan powder.
  - Not tracking weekends: pre-log the meal and a guessed drinks count, borrow calories, or a late low-calorie breakfast (about 20% of daily calories).
  - Low energy: bracket carbs in the 2–3 hours around training; caffeine.
  - Period: reassurance, or +50g carbs (+200 kcal) and back to normal afterwards.
- **Sleep:** fewer than 6 hours (routine, dark room, caffeine cut-off 6h before bed, no screens an hour before, no work in the bedroom, Pzizz app, ZMA / 5HTP) and **night-shift workers**. **5HTP must not be taken with antidepressants or cognitive drugs unless a doctor clears it.**
- **Stress:** meditation app (Headspace / Calm), Urgent-Important matrix, support circle, Ballistic Tree, and "fell off track and stressed about measurements" (reassure, treat as a new set point, book measurements).
- **Mood:** low motivation (track weights, goal-setting task, measurements, CARE framework), work anxiety (Anxiety Interpretation Wheel, Ballistic Tree), gym anxiety, "I don't belong", and **potential crisis → listen, support, direct to a professional, stay in scope**.
- **Training:** weights vs cardio for fat loss, feeling weaker, can't increase weight, can't get to sessions (schedule 2–4 weeks ahead, Habit Coaching), first-session soreness, first-session nerves.
- Tools: **CARE** (Catch, Accept, Reframe, Embody), Ballistic Tree, Anxiety Interpretation Wheel, Urgent-Important matrix.

**App areas affected**
- Coach reference / quick-reply library → `app/coach/education` or `app/coach/library` (nothing exists for this yet).
- Member-facing resources the SOP links to → `EducationTab.tsx`, `lib/data/education.ts`, `0018_education.sql`, `0026_education_courses.sql`.
- Ballistic Tree / goal-setting task as forms → `app/coach/forms`, `lib/data/forms.ts`, `lib/starterForms.ts`.
- Calorie borrowing and the period carb bump touch targets → `lib/calculations.ts` (`weeklyTarget`, calorie cycling, `cycleDayFor`), `lib/data/manualMacros.ts`, `dailyLogs.ts`.
- Habit Coaching → `lib/data/habits.ts`, `lib/utils/habitStats.ts`.

**Gaps and open questions**
- Whole framework is a content gap: no coach-facing struggle→solution picker or snippets.
- Calorie borrowing is not a feature; a temporary per-day target override would be needed.
- The crisis path is a policy / training item; consider a reminder wherever coaches read check-ins.

---

## 3. Challenge Members Weekly Check-In

**What the SOP says**
- Sunday 9am automated message to **challenge** members: check in if you have questions, otherwise thumbs up.
- A thumbs-up still needs a profile review and feedback (positives first, then improvements such as water, steps, accurate tracking).
- Review: weight trend (note if tracking, and loss or gain against goal), food diary, and the **Accountability Sheet**. Green means **8,000+ steps, 7.5h sleep, 2.5L+ water**, and all challenges completed. Pick **one** focus area; don't overload.
- Week 1: set up correctly (goal sent, accountability sheet and food diary started, MFP username and calorie target saved in notes). Week 2: weight recorded and progress, review sheet and diary. Week 3+: set specific actions, keep earlier ones going.

**App areas affected**
- Accountability thresholds already exist → `lib/utils/accountability.ts`, `AccountabilityTracker.tsx` (**Covered**; matches 8k / 7.5h / 2.5L, with amber bands 4k–8k, 6–7.5h, 1–2.5L).
- Challenge-only automated message → `lib/data/communications.ts` + cron; needs a membership-type audience (`lib/data/memberships.ts`, `membership_packages`).
- Week-by-week coach checklist → `app/coach/clients/[clientId]/page.tsx`, `lib/data/coachDashboard.ts`.
- Notes (goal, MFP username, calorie target) → `NotesTab.tsx`, `lib/data/clientProfile.ts`.

**Gaps and open questions**
- Can scheduled messages target "challenge members"? Check `membership_packages` and `0088_membership_panel.sql`.
- "All challenges done" has no home in the app.
- MFP username only matters if MFP stays in the workflow.

---

## 4. Nutrition Calculations and Setting Member Nutrition Targets

**What the SOPs say**
Three overlapping documents: Nutrition Calculations (Gymownr sheet), Setting Member Nutrition Targets, and the Nutrition Coaching sections within it.

*Setting new targets (Calculator tab)*
- For new clients after an Intro Session, or members who haven't followed a target for a long time.
- Inputs (yellow cells): gender (use that gender's calculator), activity (**assume Sedentary if unknown**), goal (**Fat Loss / Muscle Gain**), **body weight in kg from the InBody**.
- Outputs: calories, protein, fat, carbs. Example from the sheet: male, 75kg, sedentary, fat loss → 1,645 kcal, 165g protein, 37g fat, 164g carbs. A muscle-gain example shows 2,574 kcal, 198g protein, 79g fat, 267g carbs.
- Very high or low body weights can give unsuitable targets; use discretion.
- **Default approach: calories (maximum, ±100 kcal) and protein (minimum) only.** Carbs and fat are interchangeable inside that. Option 2 is calories plus full macros for experienced trackers.

*Adjusting (Re-Calculate tab)*
- Inputs: current weight, current calorie target, **compliant** (hit calories ±100 for 28+ days: yes/no), **adjust targets** (yes/no), goal, **switching goal** (yes/no), **setting** (Steady / Moderate / Aggressive).
- **Adjustment Decision Matrix:**
  - Compliant + no progress → adjust.
  - Compliant + made progress → don't adjust.
  - Compliant + wants faster or slower → adjust.
  - Compliant + goal change → adjust.
  - Not compliant → don't adjust (unless the goal is changing).
- **Settings Matrix:**
  - Fat loss — Steady: sustainable long-term (recommended); Moderate: slightly lower calories, faster progress; Aggressive: very short-term quick wins, risk of muscle loss.
  - Muscle gain — Steady: slowly build muscle and stay reasonably lean; Moderate: ideal for muscle building; Aggressive: faster muscle building, chance of fat gain.
- Example: 70kg, currently 2,500 kcal, compliant, adjust, fat loss, not switching, Steady → 2,250 kcal, 154g protein, 62g fat, 270g carbs.
- Don't switch goal unless it fits the member (high body fat is not suited to a muscle-gain goal). Consider personality and lifestyle when choosing a setting (a stressful job suits Steady; a member who struggles with leanness shouldn't go Aggressive muscle gain). Explain the trade-offs.
- Rule-of-thumb adjustments in the MFP method: add 150–200 kcal/day if losing weight too quickly, tired and craving; remove 150–200 kcal/day (or add steps / cardio) if not losing and feeling fine ("in most cases someone isn't being honest"); muscle gain: −150–200 if gaining rapidly and sluggish, +100–200 if static.
- **Expectations table** (Steady / Moderate / Aggressive × fat loss / muscle gain) lists what to tell the member: speed of change, hunger, cravings, energy, strength, likely shape change (C → I → D shape).
- After a change: update the member's profile (notes / Nutrition section) and **message the member** (template provided) to set expectations.

*Coaching-app method (no calorie counting)*
- Meal order: protein → vegetables → fat → carbs.
- **Hand portions** per meal: men 2 palms protein, 2 fists veg, 2 cupped hands carbs, 2 thumbs fat; women 1 of each.
- Meals a day: men 4–6, women 3–5.
- Healthy habits: more protein, more fibre, time-restricted eating (skip breakfast or set a cut-off time), homemade meals. **Add things to the diet, don't take them away.**
- Adjustments here are by judgement (portion size, adding a snack) using the same decision matrix, with compliance judged on habits for 28 days.

**App areas affected**
- Engine → `lib/calculations.ts` (`calcEngine`, `weeklyTarget`, phase deficits, `CALORIE_FLOOR`). **CLAUDE.md says this engine is validated against the owner's spreadsheet and is source of truth.** The SOP calculator is a *different* tool (Steady/Moderate/Aggressive, no 12-week phases). The worked examples above are good test cases to compare, but don't edit either until the owner decides which wins.
- New-member plan → `lib/onboarding.ts` (`buildOnboardingPlan`, `ACTIVITY_OPTIONS`, `TRACKING_OPTIONS`), `lib/data/onboarding.ts`, `OnboardingFlow.tsx`, `0034_nutrition_tracking_mode.sql`, `0083_onboarding.sql`.
- Coach edits targets → `SetupTab.tsx`, `app/coach/clients/[clientId]/page.tsx`, `lib/data/clientProfile.ts`, `0081_coach_updates_client_profiles.sql`.
- Calories + protein only vs full macros → `lib/data/manualMacros.ts`, `NutritionSummary.tsx`, `FoodTrackingTab.tsx`.
- 28-day compliance and progress for the adjust decision → `lib/data/dailyLogs.ts`, `lib/utils/foodTotals.ts`, `lib/calculations.ts` (`estimateAdaptiveTdee`, `isPlateaued`), the "stalled" reason in `coachDashboard.ts`.
- Delivering the explanation → `lib/data/nutritionFeedback.ts`, `FeedbackThread.tsx`, messages.
- Hand portions, meal order, habits → Education content and Habits (`lib/data/habits.ts`).

**Gaps and open questions**
- Steady / Moderate / Aggressive and the compliant × progress decision matrix aren't modelled; the app uses tiers and 12-week phases.
- No "add or remove 150–200 kcal" helper; coach edits targets by hand.
- The SOPs disagree on method (MFP calculator, coaching-app habits, Gymownr sheet) and on where targets live ("PTD notes" vs "app profile"). Needs an owner decision on which is current.
- The Gymownr sheet's formulas aren't in the export, only example outputs.

---

## 5. Nutrition Course (slide scripts)

**What the SOP says**
Eight lessons (scripts, with video examples at gymownr.com).
1. **Basics:** nutrition pyramid (adherence → calories → macros → micros → timing → supplements); three rules: **90% single-ingredient foods, 10% flexible, track and hit calorie and macro targets every day.** Start with calories only, then add protein, then carbs and fat. Within **100–150 kcal** counts as accurate.
2. **Building better habits:** habit must be obvious, frequent, triggered (habit stacking), achievable (90–100% sure), and 100% in your control; write a habit statement ("I am 90–100% certain I will [action] when [trigger], in order to [outcome]").
3. **Calories:** 4 kcal/g protein and carbs, 9 fat, 7 alcohol; maintenance, deficit and surplus; 3,500 kcal ≈ 1 lb of fat.
4. **How to track:** video only.
5. **Under-reporting:** hidden calories (spreads, sweets, sauces, drinks).
6. **Increasing NEAT:** steps; track a week first, then raise gradually.
7. **Calorie density:** low-density foods for fat loss, dense foods for gain.
8. **Alcohol:** typical drink calories, calorie borrowing (days before and after), log drinks in the app and take the calories from carbs or fat, **not protein**.

**App areas affected**
- Course delivery → `EducationTab.tsx`, `app/coach/education`, `lib/data/education.ts`, `lib/utils/educationProgress.ts`, `0018_education.sql`, `0026_education_courses.sql`, `lib/utils/videoEmbed.ts`.
- Rules reflected in the product: tracking → `FoodTrackingTab.tsx`; steps → `lib/calculations.ts` (`STANDARD_STEP_TARGET`, `stepTargetForWeek`); alcohol / drinks → food search (`lib/data/foods.ts`).
- The SOPs link to an Ontraport members site; the Education module is the replacement.

**Gaps and open questions**
- Content only: scripts and videos aren't in the app. Decide whether to seed them as a course.
- Lesson 4 refers to MyFitnessPal, which doesn't match the in-app diary.

---

## 6. InBody Measurements

**What the SOP says**
- Measurement sessions are available every day, **up to 10 minutes, booked beforehand** (via Calendly). Check the Front Desk iPad before each coaching block.
- Prep: scanner and printer on and connected, printer stocked with result sheets.
- Procedure: measure height (stadiometer) if unknown; check the member followed the testing guidelines; shoes and socks off; stand on the scanner, enter their PIN (or create one) and follow the screen.
- **Guidelines for members:** same time of day each test; normal fluids the day before; no alcohol or excess caffeine for 24h; no eating or exercise for 3h; use the bathroom; no shower or sauna just before; stand 5 minutes first; remove shoes, socks, heavy clothing; no lotion on hands or feet. The board in the measurement room says the same.
- Print the sheet and explain it. **Upload a photo of the sheet to the app's Progress Photos dated the day before**, because progress photos go in on the actual day. Message the coach.
- Progress photos: shirt off (male) or sports bra / fitted top (female), 3 photos (front, side, back) against a black background.
- Reinforce why: measurements are a tool for tracking, not the be-all and end-all.
- **Reading the sheet (four sections):**
  - **Muscle-Fat Analysis:** weight, skeletal muscle mass (SMM), body fat mass; the bar shape is C (low SMM, higher fat), I (balanced) or D (SMM above weight and fat, athletic).
  - **Segmental Lean Analysis** (5 segments: arms, legs, trunk; % of expected for height; use for upper/lower imbalances).
  - **Segmental Fat Analysis** (where fat is carried).
  - **Body Composition History:** last 8 scans of weight, SMM and PBF; the main trend view. **Healthy PBF: men 10–20%, women 18–28%. Don't use BMI.**
- **Expected results by goal:**
  - Fat loss: weight, fat mass and PBF down; SMM maintained or slightly down.
  - Muscle gain: weight and SMM up; fat mass maintained or slightly up; PBF maintained or slightly up.
  - Shape goal: C → I, I → D, or maintain D.
- A rise in SMM with a drop in PBF is a success; a drop in SMM with a rise in PBF is a negative result even if weight fell.
- FAQs cover how BIA works, accuracy, why fluids and 5 minutes standing matter.

**App areas affected**
- Scan storage and display → `lib/data/bodyScans.ts`, `BodyScansTab.tsx`, `0084_body_scans.sql`. Probably replaces the "photo of the sheet" step if the fields cover weight, SMM, fat mass, PBF and segmental data (check).
- Progress photos → `ProgressTab.tsx`, `lib/data/progress.ts`, photo reviews in `ReviewQueue.tsx`.
- Trends and deltas → `lib/utils/measurementDeltas.ts`, `InsightsTab.tsx`.
- Measurement booking → `app/coach/classes`, `0070_one_off_sessions.sql`, `0071_check_in_booking.sql` (the SOP uses Calendly).
- C / I / D shape guidance, healthy PBF ranges and expected results by goal could surface in the coach client page (`app/coach/clients/[clientId]/page.tsx`) and the scan view. The prep checklist could sit in booking confirmation or Education.

**Gaps and open questions**
- Confirm which InBody fields `body_scans` stores.
- The "day before" date offset is a workaround and wouldn't apply if scans are entered directly.
- The FAQ and prep poster say "Steel Habitat" (template gym branding).
- "Inbody Measurements (1)" and "(2)" are byte-identical.

---

## 7. Member Standards Board ("Big Dog")

**What the SOP says**
Rookie / Strong / Big Dog benchmarks for 13 tests, split male and female. The first block is male, the second female. Lower body: deadlift and back squat 3RM. Upper: bench 3RM, chin-ups. Core: dead hang, farmer carries. Aerobic: 2000m row, 2000m ski, 4000m bike, 5000m run. Anaerobic: 30:30 ×8 distance on rower, ski and bike.

**App areas affected**
- Fully modelled → `lib/bigDog.ts` (+ tests), `lib/data/bigDog.ts`, `BigDogTab.tsx`, `0063_big_dog_results.sql`, `0078_big_dog_self_logging.sql`, coach verification via `ScoreToVerify` in `coachDashboard.ts`.
- The Wed/Sat session card says "Press menu to save score" on the 30s:30s ×8 test, which feeds this.

**Gaps and open questions**
- The sheet repeats the headings for the female half with no label; the code has been confirmed against it already.

---

## 8. 12 Week Training Overview

**What the SOP says**
Weeks 1–4, 5–8, 9–11, then **Week 12 Peak Week**. Each workout is its own day with one weekday. **Only Peak Week runs as day pairs** (Mon/Thu, Tue/Fri, Wed/Sat, one pair per column); weeks 1–11 do not.

| | Weeks 1–4 | Weeks 5–8 | Weeks 9–11 |
|---|---|---|---|
| Block A (lift) | 3 × 12–8 | 3 × 8–6 | 3 × 5/3 |
| Block B strong | 3×12 Ecc / AMRAP / 3×12 | EMOM / 3×10 / 3×10 | 3×8 / 3×8 / 3×8 |
| Block B conditioning | AMRAP / Big Chipper / Ladder | Time Killer / Circuit / EMOM | Circuit / Horse Power / Tabata |
| Block C strong | Partner AMRAP / Heavy Ecc / YGIG 100 | DESC-15s / Partner Ladder / Drop Sets | P-ISO / Partner AMRAP / Sets × Reps |
| Block C conditioning | AMRAP / Big Chipper / Ladder | Time Killer / Circuit / EMOM | Circuit / AMRAP / Descending Reps |

Conditioning methods also include Pyramid, Descending and Ascending reps.

**App areas affected**
- Programme structure → `app/coach/library`, `lib/data/programTemplates.ts`, `0013_exercise_library_and_program_templates.sql`, `0020_workout_builder_v2.sql`, `0057_program_day_weekday_link.sql` (one weekday per day; Peak Week pairs are built as separate days), `0090_program_template_description.sql`.
- Delivery → `lib/data/workouts.ts`, `WorkoutTab.tsx`, `app/_components/workouts/*`.
- Class day to workout → `lib/utils/checkin.ts`, `0024_classes_linked_checkin.sql`, `0071_check_in_booking.sql`.

**Gaps and open questions**
- Format names (AMRAP, EMOM, Tabata, Ladder, Horse Power, YGIG, P-ISO, drop sets, partner formats) must exist as selectable block types; check `ExerciseEditor.tsx` and `exerciseGrouping.ts`.
- The overview's table has Block B and Block C, but the spreadsheet generates Warm-up / Lift / Strong / Conditioning, and members now do either Strong or Conditioning. See SOP 9.
- It links to a PT Distinction funnel; the app is the replacement.

---

## 9. Master Session Generator and session cards

**What the SOP says (workbook, all tabs read)**
- **Sessions are 45 minutes: Lift 12, then either Strong 20 or Conditioning 20** (owner decision, Oct 2026). Members do one of the two, not both. The workbook's *Timings* table still shows a 60-minute breakdown (intro 1, warm-up 4, changeover 2, lift 12, changeover 2, "build + burn" 30, wrap-up 2, which adds to 53, not 60) and the sheet labels Strong and Conditioning 30 min each. Those are out of date. The old table also treated Strong and Conditioning as one 30-minute "build + burn" slot, so that wording likely needs to change.
- **Fit check:** 12 (lift) + 20 (strong or conditioning) = 32 minutes, leaving about 13 for intro, warm-up, changeovers and wrap-up. That fits 45.
- **The session cards show both** Strong and Conditioning panels on one card, which fits: the member sees both options and chooses as they go. Each panel is two 10-minute blocks, and the member can switch panel after the first one.
- **Session Generator tab:** one block each for Lift, Strong and Conditioning, with a column group per day (Monday–Saturday). Each slot is a **movement pattern**, and the coach picks the exercise from the Exercise List (video link looked up automatically).
  - **Lift:** squat / bench / deadlift variation (weeks 9–11 are the actual lift), then an upper pull, upper push or knee-dominant accessory; 3 sets, reps 12–8 / 8–6 / 5–3, 90s rest.
  - **Strong:** primary slot (hip dominant, upper pull or knee dominant, barbell) plus a no-barbell slot or direct ab/core; then **Upper** (chest & triceps, back & biceps, or delts & core) and **Lower** (quad, glutes or hamstrings) build pairs. Formats change by week band (P AMRAP, ECC, DESC-15s, P-ISO, Heavy Ecc, P Ladder, YGIG 100, Drop Sets, Mech-Drop, EMOM).
  - **Conditioning:** two blocks of up to 4 exercises; the format per week band and day (AMRAP, Big Chipper, Ladder, Time Killer, Circuit, EMOM, Horse Power, Tabata 20s, Descending Reps).
- **Exercise List tab:** about 20 category columns with an exercise name and YouTube link each: upper pull / push, knee- / hip-dominant (each barbell or not), core, six "build" groups, conditioning (94), warm-up (47). A second "11Exercise List" tab is an older or alternate list.
- **Warm Ups tab:** warm-up circuits per lift (squat, bench, deadlift) with 30s, 10-rep and distance prescriptions.
- **Monday–Saturday tabs and Peak Week:** these lay out the printable day card from the generator. Peak Week (week 12) is hand-written (see below).
- **Session cards (three PNGs, Week 12):**
  - **Mon/Thu:** warm-up (ski, figure-of-4, banded BOR, goblet squat, 30s each); lift (back squat ×3 8 or 3/5RM, DB BOR 8, 90s rest); strong (dead hang max time; DB OH press + backward lunge ×3 ×10, or neutral-grip press-up + sprinter bridge); conditioning (2000m row or ski, or 4000m bike, as fast as possible).
  - **Tue/Fri:** warm-up (bike, band pull-aparts, walking lunge chest opener, bench press); lift (bench press 8 or 3/5RM, split squat 5 each side, 90s rest); **Block B** (farmer carries max distance: M 30kg, W 17.5kg; goblet squat + Russian twist ×3–4 ×10, 90s rest); strong 10-minute AMRAP (BB curl, lat raise, OH cable tricep extension, incline DB row 15 each, plank hold 40s); conditioning 10-minute AMRAP (row/ski 40s, push press 20, burpee 8–12, sit-ups 40s, forward lunges 6 each side).
  - **Wed/Sat:** warm-up (ski, glute bridge, high plank to down dog, BB RDL); lift (deadlift ×3 8 or 3/5RM, incline DB press 8, rest); strong (chin-up ×1 max; cyclist squat + weighted crunch, or DB Z press + spider curl ×3); conditioning (30s:30s ×8 row, ski or bike for max distance, "press menu to save score").
- **Problems in the workbook:**
  - A lookup in G6 points at `#REF!`.
  - Several video-link formulas look up the wrong cell or row (for example Q13/Q14, and the Thursday and Friday conditioning links read column Y).
  - Rep cells for the Strong format use a fixed lookup against one cell (H13 / R13) rather than their own row.
  - It is labelled "Make Copy!", so cells are meant to be filled per cohort.

**App areas affected**
- Exercise library and videos → `lib/data/exerciseLibrary.ts`, `app/coach/library`, `0016_advanced_exercise_library.sql`, `0009_exercise_video_link.sql`.
- Slot-by-pattern programme builder → `lib/data/programTemplates.ts`, library builder components.
- Session display and sections (warm-up / lift / strong / conditioning) → `WorkoutTab.tsx`, `ProgramDayList.tsx`, `FocusOverlay.tsx`; check `0020_workout_builder_v2.sql` for sections.
- Muscle grouping → `app/_components/workouts/muscleGroups.ts`.
- Score capture for the 30s:30s test → `BigDogTab.tsx` / `lib/data/bigDog.ts`.
- Time budgets per block (12 / 20 / 20) → a per-block duration on a programme day, if wanted.
- **Strong / conditioning choice during the workout** → a programme day holds Strong and Conditioning, each as two 10-minute blocks. The member picks per block in the workout screen (`WorkoutTab.tsx`, `FocusOverlay.tsx`), and may switch after block one. Logging (`lib/data/workouts.ts`, `workout_logs`) and class check-in (`lib/utils/checkin.ts`) must accept a session where any mix of the four blocks was done, and where the member skips the others. Check how `0020_workout_builder_v2.sql` models sections and whether a log records which blocks were done.

**Gaps and open questions**
- The generator's selection logic is spreadsheet-only; the app has no pattern-slot picker.
- Barbell vs no-barbell flags per exercise, build-group tags and a warm-up library by lift would be needed.
- Block names differ between the 12-week overview (Block A/B/C), the generator (Lift / Strong / Conditioning) and the Tue/Fri card (Block B inside).

---

## 10. Conditioning Programming Guide

**What the SOP says**
- Start with the energy system: **Aerobic** (low intensity, work longer than 3 min, 1:1–1:3 work:rest, about 6/10, conversational), **Lactic** (moderate, 30s–3 min, 1:3–1:5), **Alactic** (high, 5–10s, 1:12–1:20).
- Aerobic work: cyclical (bike, rower, ski, run, skipping), low skill, core / holds.
- Anaerobic work can be more technical but needs a regression for lower skill.
- Keep it fun, effective and simple; don't confuse entertainment with effectiveness.
- Before programming ask: which system, what pace, do the exercises support it, is it right for the skill level, how to progress / regress, will it work in the session. **A session is 45 minutes and conditioning is a 20-minute option made of two 10-minute blocks (the member can switch between Strong and Conditioning after the first block).**

**App areas affected**
- Guidance inside the programme builder → `app/coach/library/_components`, `ExerciseEditor.tsx`.
- Optional tags on exercises (cyclical, low skill, core / hold) and conditioning blocks (energy system) → `lib/data/exerciseLibrary.ts`, `0016_advanced_exercise_library.sql`.

**Gaps and open questions**
- Guidance only. The 45-minute check in the guide now fits the session; conditioning is two 10-minute blocks, so work:rest and rounds should be sized to 10 minutes each (a member may do one or both).

---

## 11. At-Risk Reporting → Red Flag Tracker (coach-side report)

**Built (Oct 2026, migration 0098):** the Red Flag report is the first view under Classes > Reports. It follows the SOP: Monday to Sunday weeks, attended fewer than 2 classes, or 2+ late cancels or no-shows (thresholds editable), new starters / members on hold / ended members left out (a hold can now be set under Credits & plan), the team's Contact made / Reason / Tier / Coach columns saved per week and never overwritten, a six-week grid, and last week's list written automatically each morning. A "full member" is an ongoing plan (a fixed-length challenge does not count). A late cancel is a cancelled booking whose credit was not given back. The notes below are the original SOP summary.

**Decision:** the Red Flag Tracker is a **report available coach-side in the app**. The Google Sheet and Apps Script described in the automation SOP are the reference behaviour, not something to keep running.

**What the SOPs say**
- *Manual (old):* download TeamUp's attendance report, keep members with 0–1 attendances and members with 2+ late cancels, copy to a weekly tab and a Master tab, then contact them.
- *Automated (new, v1.0, 2 Oct 2026):* every Sunday 10–11pm the tracker pulls data straight from TeamUp and builds the list for Monday. Differences:
  - **Only classes actually attended count.** TeamUp's report counted all bookings (attended + late cancel + no-show), so no-shows looked fine; the automated list is longer and more accurate.
  - **Included:** genuine members for that week. **Excluded automatically:** members who joined during or after the week, members on hold at any point that week, cancelled members. Trial-to-paid mid-week counts as existing.
  - **Week:** Monday to Sunday.
  - **Two lists per week:**
    - Left: attended **fewer than 2** classes (0 or 1), fewest first.
    - Right: **2+ late cancels or 2+ no-shows**; the number shown is late cancels plus no-shows, most first.
  - **Thresholds (2, 2, 2) are changeable.**
  - **MASTER view:** members flagged for low attendance in any of the last **6 weeks** who are still active today (not cancelled or on hold); one column per week; cell = 0, 1, IN (2 or more) or blank (not a covered member that week); sorted by this week's count then 6-week total. MASTER tracks low attendance only.
  - **Team columns (people fill these in):** CONTACT MADE, REASON FOR ABSENCE, RED FLAG TIER, COACH. The automation never overwrites a weekly tab or touches these.
- *Team tiers:* **Red** (no response, no valid reason, or the same reason for weeks); **Amber** (reason given but frequently absent, keep an eye on them); **Green** (valid reason, will return, e.g. holiday). The "Contacted" default is No; use N/A if the reason is already known.
- *Contact:* coaching app first if they respond there, otherwise email; a **phone call is often most effective** because red-flag members are usually disengaged from the app too. Call structure: obstacles, motivation / new goals, scheduling around work, a game plan. Scripts for a call and a message are provided. **Red members are discussed in the weekly team meeting.**

**App areas affected**
- Where it lives: coach-side report, with the existing Reports tab in Classes as the likely home (`app/coach/reports/page.tsx` redirects to `/coach/classes?tab=reports`; `app/coach/classes/_components/ReportsPane.tsx`, `lib/data/reports.ts`). A link from the coach dashboard's "members to check" (`lib/data/coachDashboard.ts`) is natural.
- **Attended and no-show are already recorded** per booking: `bookings.attended`, `bookings.no_show` (`0005_memberships_attendance.sql`, `0041_booking_no_show.sql`).
- **Late cancel is not stored as its own field.** It is a cancelled booking inside the cut-off with no refund entry in `credits_ledger` (see `0064_booking_rules.sql`, `0067_apply_cancellation_cutoff.sql`). The report needs a stored flag or a rule to infer it.
- **Who counts as an active member that week:** `client_memberships` (`started_at`, `ended_at`) gives joined and cancelled; **there is no "on hold" concept in the app** (found nothing).
- **Team columns** (contacted, reason, tier, coach) need new storage per member per week. `lib/data/coachReviews.ts` (`0087_coach_reviews.sql`) is worth checking for fit.
- **MASTER** can be computed from the last 6 weeks of bookings; no extra table is strictly needed unless history is snapshotted.
- **Timing:** existing crons run daily (`vercel.json`); a Sunday-night job would be new. Weeks should use the gym's timezone (`gyms.timezone` exists) rather than UTC, which the sheet used.
- **Access:** must follow RLS and gym scoping (`resolveScopingGymId` in `lib/data/coach.ts`).
- Contacting members → `app/coach/messages`, communications.

**Open questions (need an owner answer before building)**
1. **On hold:** add a hold status for memberships, or treat paused / ended memberships as the exclusion?
2. **Late cancel:** same as the app's rule (cancelled inside the cut-off, no refund), or defined differently from TeamUp's report?
3. **Snapshot or live:** save each week's list on Sunday night, or compute on demand?
4. **Visibility:** every coach sees the whole gym's list, or only their own members, with management seeing all?
5. **Thresholds:** editable in coach settings?
6. **TeamUp:** does the sheet and script retire once the app owns attendance, or run side by side?

---

## 12. Onboarding a New Member After the Challenge

**What the SOP says**
After the six-week challenge, confirm contract length (3, 6 or 12 months), then three systems:
1. **Ontraport:** find them under Active Trial Lists, review purchases, confirm the card on file, create a **subscription** (examples: £167 12-month, £197 6-month), start the upcoming Monday, no invoice emails; add the tags "Member" and "[Metric] New Member".
2. **PT Distinction:** add to the full-members group with "Copy Group Content to Client's Account" = Yes; they receive the lifestyle questionnaire and goal-setting form.
3. **TeamUp:** add the Full Members membership starting the **Saturday before they start**, total £0 (no payment taken in TeamUp), leave "Defer adding payment information" unticked, checkout; remove the challenge membership if it blocks booking.

**App areas affected**
- Membership change → `lib/data/memberships.ts` (`startMembership`, `endMembership`, `assignMembership`), `app/coach/memberships`, `PackageManager.tsx`, `0055_credit_buckets_and_packs.sql`, `0088_membership_panel.sql`.
- Questionnaire and goals → `lib/data/onboarding.ts` (`completeOnboarding`, `completeShortOnboarding`), `OnboardingFlow.tsx`, `lib/starterForms.ts`, `lib/data/forms.ts`, `app/join/[token]/page.tsx`, `app/api/join`.
- New-member review → `getClientsNeedingReview`, `ReviewQueue.tsx`, `NewMember` in `coachDashboard.ts`.
- Credit top-ups → `app/api/cron/replenish-memberships`, `expire-credits`.
- **Off-app:** Ontraport billing (card, subscription, tags, price) and the PT Distinction group copy. CLAUDE.md says no payment processor; billing stays outside the app.

**Gaps and open questions**
- Contract length (3/6/12 months) and "starts the Saturday before" dates; check whether `membership_packages` supports term and aligned start dates.
- No single "convert challenge member to full member" action; today it's end one membership, start another.
- Three systems updated by hand; the app could become the single record for membership state.

---

## 13. Booking App (TeamUp) — staff and member instructions

**What the SOPs say**
- **Signup:** member opens the welcome email, registers (email verification, password, name, gender, date of birth), downloads the TeamUp app. Staff then find them in the Customer List.
- **Memberships:** add a **6-Week Challenge** (start Saturday afternoon unless otherwise; end = start + 6 weeks + 1 day buffer; don't change uses or price), or **Full / Premium** (start Saturday, £0 price, "Defer adding payment" unticked).
- Cancel a membership (now or on a date); delete a member (also cancels memberships).
- **Subtract a credit:** Record Extra Usages. **Add a credit:** add an **"Extra Session"** membership (valid 7 days, 1 session a week).
- **Member side:** book from the schedule (**waiver on first booking**), see bookings under Attendances, leave class to cancel.
- **Cancellation:** free until **3 hours before**; later cancels lose the credit. **11pm–5am doesn't count** toward the 3 hours, so a 6am session must be cancelled by 11pm the night before.
- **Waiting list:** a queue; when a spot opens the first member is added, emailed, and has **30 minutes** to accept or decline before it passes on. Unlimited waiting lists with no credit impact.
- **Booking window:** full members **2 weeks 5 days** ahead, challenge members **2 weeks**.
- The £0 price shown in the app is for setup only.

**App areas affected**
- Booking, cut-off and blackout → `lib/utils/cancelDeadline.ts` (default blackout 23:00–05:00), `0064_booking_rules.sql`, `0067_apply_cancellation_cutoff.sql`, `0069_gym_booking_settings.sql`, `lib/data/classes.ts`, `ClassesArea.tsx`, `app/coach/classes`.
- Advance window → `membership_packages.advance_booking_days` (`0064_booking_rules.sql`); needs 19 days (full) and 14 days (challenge). Confirm what's set.
- Waiting list → `lib/data/classes.ts`, `SessionsView.tsx`, `0003_booking_credit_rpcs.sql`; `cancel_booking` in `0064` promotes the earliest waitlisted member automatically. The **30-minute accept window** needs checking.
- Credits add / subtract with reason → `lib/data/memberships.ts` (`grantCreditPack`, `removeCredits`), `credits_ledger` (`0043_credits_ledger_readable_reasons.sql`), `CreditsTab.tsx`, `ClientCreditsTab.tsx`. Matches the append-only ledger rule in CLAUDE.md.
- Coach booking and cancelling on behalf → `0062_coach_book_class.sql`, `0089_coach_cancel_booking.sql`.
- Challenge end date rule → `startMembership(clientId, packageId, start, end)`.
- Delete member → `app/api/coach`, `0048_deletion_requests.sql`.
- First-booking waiver → not found; check whether a form could do it (`lib/data/forms.ts`).

**Gaps and open questions**
- Confirm the 30-minute waiting-list window and that the gym's cut-off setting is 3 hours.
- "Extra Session" (7 days, 1 session) maps to a credit pack or one-off credit; confirm which.
- The SOP says "11–5"; the app default is 23:00–05:00.
- The app is replacing TeamUp; the TeamUp-specific steps (registration link, app download) are off-app.

---

## 14. Intro Session SOP (delivery)

**What the SOP says**
A Saturday-morning group onboarding for new trialists and challengers (meet and greet at **11.00am**). Aim: a great first impression, everyone set up on the apps, and a baseline measurement.

*Before the session*
- Open the Calendly attendee list; load the Intro Session presentation on the TV; lay out benches; put **Welcome Packs** (training diary + water bottle) on the Front Desk; have measuring tape and pad out.

*Flow*
1. **Meet and greet** at the front desk: handshake, name, hand out the Welcome Pack. No hands in pockets, hoods, coffee or phones.
2. **Welcome** (slides 1–2): what the morning covers (values and rules, how everything works and app set-up, a taste of training, then measurements).
3. **Ice breaker:** dowel reaction circle game; whoever drops the dowel introduces themselves, their goal and why.
4. **Presentation** (slides 3–22):
   - **Values:** community, professional service, committed to improving people's lives, knowledgeable, approachable and friendly (community is the most important).
   - **What's included:** personal coach, goal-specific training programme, group coaching (up to **3 sessions a week**), nutrition guidance, body composition measurements, member education (members site).
   - **Your coach:** assigned in the coaching app, direct point of contact, messages a few times a week.
   - **Etiquette:** everyone equal, keep the gym tidy, limit phone use (members record training on the coaching app).
   - **The session:** one coach leads, **max 12 per session, 6 rigs, paired up**; coach explains each block and sets the timer; after a couple of sessions members take control of their own weights and recording.
   - **Example session** (shown on the TV): **Warm Up, Block A** (main compound lift: squat, deadlift or bench), **Block B** (accessories, core, corrective, single-limb), **Block C** (choice: **conditioning** to get out of breath, or **strong**, a body-part finisher).
   - **Booking app:** must book every session; capacity is enforced, no booking = can't train; one day's recovery between sessions is recommended; cancel with as much notice as possible. Live exercise: everyone books **the coming Tuesday 7.30pm**, then cancels it (head icon > name > My Activities > Bookings > cancel).
   - **Coaching app:** record measurements (logbook > Results tracking > Add), complete the **accountability sheet** (sleep, steps, water), message the coach.
   - **Members area:** nutrition and training videos and PDFs; register from the "complete your registration" email; add a phone shortcut; keep apps in a "Ballistic" folder.
   - **Equipment tour,** then **Consistency** (show up, work hard, follow nutrition, sleep, interact with your coach).
   - **Training taste:** a short **10-minute block** (warm-up with the **100m ski erg game**) so they know what to expect and the coach can check technique.
   - **Summary:** book 3 sessions for next week, watch the first nutrition video (setting up your diet), keep a food diary and accountability sheet daily.
   - **Measurements, goal setting:** while waiting their turn each person completes a short **goal-setting task** in the coaching app (goal, why, how).
5. **Measurements**, one person at a time: **weight** (shoes off), **circumferences** (chest, hips, waist), **3 photos** (front, side, back, arms by side; top off if they're comfortable, fine if not). Recorded on a notepad.
6. **Leaving:** any questions; watch for **today's email about setting up their diet**; start booking next week's sessions.

**App areas affected**
- Baseline measurements → `lib/data/progress.ts`, `ProgressTab.tsx` (weight, chest/waist/hips, 3 progress photos), `lib/data/bodyScans.ts` (if InBody is also done), `0084_body_scans.sql`. The SOP records on **paper then types them in**; a coach entering them directly on a member's profile (tablet at the intro) would replace the notepad.
- Setting members up on apps: the join link and sign-up flow → `app/join/[token]/page.tsx`, `app/api/join`, `lib/data/onboarding.ts`, `0083_onboarding.sql`, `app/coach/_components/JoinLinkCard.tsx`. Install prompts → `InstallBanner.tsx`, `useInstall.ts`, `PushPrompt.tsx`.
- Booking and cancelling practice → `ClassesArea.tsx`, `lib/data/classes.ts`; the live Tuesday 7.30pm exercise needs a Tuesday 7.30pm class on the timetable. **Capacity (12) and 6 rigs** → `classes.capacity`, `0094_class_booking_counts.sql`; **rig pairing is not modelled**.
- Goal-setting task → `lib/starterForms.ts` has only the PAR-Q and a lifestyle intake; **no goal-setting form** (SOP 2 and SOP 12 also reference goal setting). Forms → `app/coach/forms`, `lib/data/forms.ts`, `FormsTab.tsx`. Goals also live in the profile (`goal` fields, `lib/data/clientProfile.ts`).
- Accountability sheet → `AccountabilityTracker.tsx`, `lib/utils/accountability.ts` (in-app; the SOP's Google Sheet is replaced).
- Members area and "first nutrition video" → Education (`EducationTab.tsx`, `lib/data/education.ts`, `0018`, `0026`).
- Example session on the TV: the presentation shows the Warm Up / Block A / B / C format; the app's workout screen and builder are the live version (`WorkoutTab.tsx`, `app/_components/workouts/*`, `0091_workout_sections.sql`, `0095_workout_block_choices.sql`).
- Welcome pack, seating, equipment tour, ice breaker: physical, **off-app**. The presentation itself is a slide deck, not in the app.
- "Email today about setting up their diet" → a scheduled or triggered message (`lib/data/communications.ts`, `lib/broadcastMessages.ts`, `lib/data/messageTemplates.ts`, `0097_broadcasts_audience_repeat_templates.sql`, `app/api/cron/send-communications`); SOP 4's nutrition set-up applies after.

**Gaps and open questions**
- **Session structure is out of date in the slides.** The presentation says Warm Up / Block A / B / C with a choice only at Block C. The owner's current structure (see Decisions and SOP 9) is a **45-minute session: warm-up, 12-minute Lift, then Strong or Conditioning in two 10-minute blocks that members can switch between**. Slides 7–8 and 19 ("a short ten minute block", "our first block is slightly longer") should be reworded when the content moves into the app.
- The intro SOP names the booking app **FIT** (and "Legit Fit" appears in the booking SOP); the booking system is now this app or TeamUp, so the slide and the practice-booking steps need updating whichever is used.
- **Value list:** "committed to improving people's lives, knowledgeable and approachable and friendly" is listed as five items; check wording.
- A one-off Saturday **Intro Session** class could be a class row with `specific_date` (`0070_one_off_sessions.sql`), with booking replacing Calendly. Today Calendly is the attendee list and is **off-app**.
- Whether intro measurements should be entered on the member's profile in the app instead of paper (and then re-typed).
- "Max 12 per session / 6 rigs, paired" — enforced capacity exists; rig assignment does not.

---

## 15. Intro Session Admin (pre and post)

**What the SOP says**
Intro admin makes Saturday run smoothly and gets each trialist onto the coaching app and the email funnel, to improve results and conversion to full membership.

*Pre intro (earlier in the week)*
1. Open the Calendly list of people attending and write them on the **Intro Register** (Google Doc); use it to tick off each step and cross-reference names and emails in Ontraport, TeamUp and PTD.
2. **TeamUp downloaded?** Customers > Customer List > search name. If they aren't there, text them (junk-folder check, template in the **SALES TEXT** notes).
3. **Coaching app downloaded and two-way messaging on?** PTD > Groups > **Holding Funnel** > View Members. Text anyone missing. For those present, open the profile > Edit Client > turn on **Two-Way Messaging**, for every attendee.
4. **Welcome email sent?** (only if a trialist says they didn't get it) Ontraport > Contacts > **Active Trialists** > open the trialist > View Details > Contact Log > find "Welcome {name}", green tick = opened. If not opened, text them.

*Post intro (after the session)*
1. **Ontraport:** in Active Trialists, tick everyone who attended and add the tag **Intro Session Complete**.
2. **PTD:** Holding Funnel > View Members > open each attendee > Groups > **remove from Holding Funnel** and **add to one of the coach's "Active Trial Members" groups**, keeping "Copy group content to client's account" ticked, so they can see measurements.
3. **TeamUp:** Customer List > Add Membership > **6-Week Challenge**, start date typically Saturday afternoon, otherwise end date = 6 weeks + 1 day, don't change uses or price, Save > Checkout.

*Troubleshooting:* if someone is struggling with the apps, don't hold up the group; sort it out at the end.

**App areas affected**
- **The register, the Holding Funnel and "Active Trial Members" groups** are the app's **client list and groups** → `app/coach/clients`, `app/coach/_components/GroupsManager.tsx`, `lib/data/clientGroups.ts`, `0030_client_groups.sql`. A "Holding" status for booked-but-not-yet-attended intros has no equivalent; a group could play that role.
- **"Has the trialist installed and signed in?"** → a member who has accepted the join link exists as a client (`app/join/[token]/page.tsx`, `app/api/join`, `lib/data/onboarding.ts`); `last_active` and push subscriptions (`0010_client_last_active.sql`, `0060_push_subscriptions.sql`) show if they've opened the app. Join-link management → `JoinLinkCard.tsx`.
- **Messaging on:** the app's chat has no per-member "two-way messaging" switch that I found (`lib/data/chat.ts`, `0002`, `0014`, `0040`); likely always on, so this step disappears.
- **6-Week Challenge membership** → `lib/data/memberships.ts` (`startMembership(clientId, packageId, start, end)`), `membership_packages` (challenge package, `advance_booking_days` 14), `app/coach/memberships`; **end date = start + 6 weeks + 1 day** is a rule worth encoding. Same step as SOP 13 ("Add a 6-Week Challenge Subscription").
- **Pre-intro reminders and the SALES TEXT** → text messages are off-app; an in-app/email message could replace them (`lib/data/communications.ts`, `lib/email.ts`, `0039_communications_email_channel.sql`, `lib/push.ts`).
- **Intro Session Complete tag** (Ontraport) → closest in-app equivalent is a status or group change; Ontraport tagging stays **off-app** (also used for the email funnel).
- **New-member review** → `getClientsNeedingReview`, `ReviewQueue.tsx`, and the new-member signals in `coachDashboard.ts` (`NewMember`).

**Gaps and open questions**
- Three systems (Ontraport, PTD groups, TeamUp) plus the Intro Register are updated by hand per attendee. In the app, **one "intro complete" action** could move the member into the coach's trial group and start the 6-week challenge membership together; Ontraport tagging would still be manual.
- No concept of intro status (booked, attended, no-show, converted) or an intro register; today it is a Google Doc.
- Whether Calendly stays the booking tool for intros or a one-off Saturday class replaces it (see SOP 14).
- Email funnel (welcome email and diet-set-up email) is **Ontraport**; the app would only replace it if you move the funnel in-house.
- The SALES TEXT template lives in PTD notes, not in the exports.

---

## Cross-cutting observations

- **One weekly rhythm:** Sunday 9am check-in message, Wednesday nudge, Sunday-night red-flag run, Monday review, Saturday membership starts. Existing scheduler: `lib/data/communications.ts`, `app/api/cron/*`, `vercel.json`.
- **Third-party tools named in the SOPs** (PT Distinction, Ontraport, TeamUp, MyFitnessPal, Calendly, Google Sheets): the app overlaps PT Distinction (coaching), TeamUp (booking) and MyFitnessPal (food diary). Ontraport (billing, tags) and Calendly (measurements) aren't replaced. Decide per tool whether the app is the system of record.
- **Terminology to align:** "challenge", "full" and "premium" member → packages / tiers; "Big Dog" is already in code; "Client Overview", "Red Flag Tracker" and "Accountability Sheet" are sheets whose features exist only partly.
- **Template-gym leftovers** in the exports: "Steel Habitat", "Steel", "Gymownr". Replace with Ballistic Performance wherever content is copied into the app.
- **Source files:** Conditioning Programming Guide, 12 Week Training Overview, Member Standard Board, Weekly Check-In Struggle-Solution Framework, Weekly Check-In Process, Setting Member Nutrition Targets, Nutrition Calculations (Gymownr), InBody Measurements (two identical copies), Challenge Check-In Process, Onboarding a New Member After the Challenge, Nutrition Course slide scripts, At Risk Reporting, Red Flag Tracker SOP – Automation (.docx), How To Use The Booking App, Booking app Instructions (Team Up), Master Session Generator (.xlsx, 11 tabs), three session-card PNGs, Intro Session SOP, and Intro Session Admin (Pre and Post).
