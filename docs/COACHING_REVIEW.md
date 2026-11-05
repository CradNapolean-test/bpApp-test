# Coaching review: the coach side, as a coach uses it

A usability review of the coach side (is it easy, cluttered, specific, helpful), written from a coach's point of
view. Correctness and security are covered separately in `COACH_OWNER_AUDIT.md` and `AUDIT_ROUND_2.md`.

## How this was done

- **4 November 2026:** read from the screen code (dashboard, Clients, a member's pages, Classes, Messages, Library,
  Business, Settings).
- **5 November 2026:** walked through live in the browser, signed in as coach Brad at Salford Quays, at tablet
  width (800px) and phone width (375px). Member used for the deep dive: Member A (active, full week of check-ins,
  programme running). Read-only: nothing was saved, marked, booked or sent, and no message thread was opened.

Not seen live: injuries on the class roster (no member in today's classes had any) and desktop width (1280px+).

## Overall

Strong and specific. The dashboard tells a coach what needs them today, and a member's Overview is a good snapshot.
The live walk-through showed the biggest gaps are where the app stops just short of the coaching itself:

- reviewing a check-in is a tick box, not a reply;
- opening a member's workout shows the plan, not what they lifted;
- several headline numbers look reassuring when they should be a warning;
- "who needs me?" is answered in three places with three different counts.

## What works well

- **Dashboard "To do".** Messages, new members, check-ins, meal photos, forms and peak week scores are grouped with
  counts. "Members to check in on" gives a reason chip and a Message button. "Up next" with a big time and booked
  count is exactly right for the start of a shift.
- **A member's Overview.** Plan, credits, goal, a "Needs you" list and this week's tiles coloured against the gym's
  targets, all on one screen.
- **Run this class.** Clean, large attended / no-show buttons, each member's block picks ("Strong, then Strong ·
  Lower body") and last weights. Show on TV is one tap.
- **Insights tab.** "Their real-world maintenance calories" and "Is their weight stalling?" are genuinely useful
  coaching answers (see item 8: they deserve to be more visible).
- **Targets.** The nutrition plan previews calories, macros, BMR and TDEE live.
- **Messages.** The "Needs reply" filter (4 for Brad) is the right default question.

## Fixed on 5 November 2026 (items 1 to 3)

Checked in the browser as Brad on Member A; nothing was sent or marked during the check.

- **1. Check-in reply.** The "Mark this week as reviewed" button is gone from the top. The week now ends with
  "Reply to {first name}": what the coach types goes to the member's chat headed "Your check-in, week of 26 Oct:"
  and marks the week reviewed in one go, with "Mark reviewed without a reply" beside it. It only appears once the
  week has loaded. A reviewed week shows "Week reviewed · Undo" at the top. (`WeeklyLogTab.tsx` `CheckinReply`,
  `lib/checkinReply.ts`)
- **2. Logged sets in the coach's workout view.** Each exercise in the builder now has a green "Logged Thu 5 Nov ·
  1 · 6 × 60kg …" line underneath; warm-ups read "✓ Done", bodyweight sets read "15 reps". (`ExerciseEditor.tsx`
  `renderBuilderExtra`, `WorkoutTab.tsx`)
- **3. Misleading numbers.**
  - Overview tiles say how many of this week's days each average comes from ("1 of 4 days · target 1,892"), amber
    when it is not every day.
  - Check-in: target under average calories and protein, a red "No food logged on any of the 7 days." banner (amber
    when some days are missing), and each day chip shows its calories or "no food" under the dot.
  - Weight: "Moving away from goal" in red with "9.0kg further from the goal than at the start. Check the start
    weight is right…" on the Overview and on Progress → Summary (coach only). (`lib/weightGoal.ts`)
  - Dashboard: the "Out of credits · Weekly allowance used up" reason is removed from "Members to check in on".
  - Steps in the check-in table read "9,929" (and "7.5k" / "11.5k" in the narrow low / high columns).

Not changed: the day dot's own colour rule (sleep, steps, water) is the owner's spec and is shared with the member
phone app; the calories line under it is coach-only.

## What to change, most important first

### 1. Reviewing a check-in is a tick box, not a conversation (confirmed live) — fixed, see above

On Member A's week of 26 Oct, "Mark this week as reviewed" sits at the top, and was tappable while the week still said
"Loading this week…". The page ends with Sunday's notes: there is nowhere to write a response, and the member never
sees that their week was looked at (`app/dashboard/_components/WeeklyLogTab.tsx:711`). Food diaries have a feedback
thread; the weekly check-in does not.

Suggestion: a "Reply and mark reviewed" box at the bottom of the week that posts to the member's chat.

### 2. A coach cannot see what the member lifted (new, live) — fixed, see above

Member A's Thursday card says "9/18 logged". Opening it shows the builder: drag handles, "3 × 8-10", "+ Exercise",
"+ Instructions". The sets she logged are hidden in coach view (`app/dashboard/_components/WorkoutTab.tsx:1379`,
`!isCoachView`); only her previous session shows. Block results show as a badge, but individual lifts do not.

Suggestion: in coach view, show the member's logged sets under each exercise (read-only), and keep editing behind
an "Edit workout" switch. Run this class already shows "Last weights" well; the member page should too.

### 3. Numbers that look fine but should be a warning (new, live) — fixed, see above

All from Member A:

- **Calories from one day.** Overview tile: "Calories (avg) 1,682 · Target 1,892". Nutrition says "1 of 7 days
  logged". The tile does not say it is one day, so it reads as a good week.
- **Green days with no food.** Week of 26 Oct: 7 days checked in, 0 days of food logged, and all seven day dots
  are green (one amber). The coach sees a green week of a member who logged no food.
- **Weight going the wrong way.** Start 78.5kg, now 87.5kg, goal 70kg. Overview says "0% to goal" and "+9.0kg since
  start"; Progress says "0% there · 17.5kg to go". Nothing flags it, whether it is a real gain or a wrong start
  weight.
- **Out-of-credits false alarm.** Dashboard "Members to check in on" lists Member A as "Out of credits · Weekly allowance
  used up". She is Green, active today and attending: using her weekly allowance is good news, not a reason to call.

Suggestion: show "from N days" next to any average, colour a day only on what was logged, flag weight moving away
from goal, and drop "allowance used up" from the check-in list (keep "out of credits" for pack members only).

### 4. Injuries do not follow the member onto the floor (from code)

Notes has an "Injuries & Limitations" section (`app/coach/_components/workspace/NotesTab.tsx:14`), but neither the
session roster nor Run this class shows it, and the Overview shows only the latest two notes of any kind
(`app/dashboard/_components/CoachMemberOverview.tsx:304`). Not seen live: nobody in today's classes had an injury
recorded.

Suggestion: pin injuries on the Overview, and show a small flag beside the name on the roster and in Run this class.

### 5. Follow-up lists disagree with each other (confirmed live, with numbers)

On the same afternoon:

| Where | What it says |
|---|---|
| Dashboard "New members to review" | 2 |
| Clients banner | 4 new members to review (includes Member C and Member D, other coaches' members, not labelled as such) |
| Clients "New to review" filter | 2 |
| Dashboard "Members to check in on" | 5 |
| Clients "Gone quiet" filter | 7 |
| Dashboard "Weekly check-ins to review" | "6 members", badge 11 (one row per week, so Member A appears twice) |
| Classes → Reports → Red flags | 5 to contact |

Member B shows the problem in one member: Green and "Active yesterday" in Clients, red-flagged for 0 classes
in Red flags, and absent from "Members to check in on".

Two red-flagged members show only as **"Member"**, with no name, so they cannot be contacted.

Suggestion: one follow-up list with reasons (quiet, missed classes, no food, red flag), one count everywhere, and
every row named and labelled with whose member it is.

### 6. The same thing has different names (confirmed live)

- Check-in: "Weekly check-ins" (dashboard), "Check-in" (section), "Daily check-in" (tab), "Weekly Log" (screens
  list and page title).
- Status: "Green / Amber / Red" (Clients), "Running okay" (member page).
- "Overview" means the coach's member Overview, but in "Screens for this member" it means the member's Summary
  page. The same list uses "Progress & Photos" for what the coach's tab calls "Photos".
- "Plans" tab, "+ Add package" button.
- The dashboard's "Reviewed" button looks like a status pill, not an action: a coach can read the list as "already
  reviewed". "Mark reviewed" would be clearer.

### 7. Targets are buried (confirmed live)

On Profile → Details the order is: goal and weights, 13 screen tick boxes, 7 check-in measure tick boxes, "Ask
them" to confirm details, targets override, password reset link, height, and only then the nutrition plan. On a
phone, Profile is not on the bottom bar at all.

Suggestion: put the nutrition plan first; move screens, measures and the reset link under a "Member's app" heading.

### 8. Progress: seven tabs, the best answers hidden (revised after live check)

Summary, Charts, Insights, Strength, Photos, Body scans, Big Dog. On a phone, Photos is cut off and Body scans and
Big Dog are off-screen. Summary and Charts overlap. Insights is different and valuable (maintenance calories,
"is their weight stalling?") but sits two levels deep.

Suggestion: merge Summary and Charts into one Trends page, and put the Insights answers on the Overview.

## Other findings from the live walkthrough

### Bugs

- **Settings back arrow does nothing on a phone.** It is a plain icon, not a button or link
  (`app/coach/settings/_components/CoachSettingsShell.tsx:78`).
- **"Next class" shows one that has already happened.** Member A's Overview at 4pm: "Next: Thu 5 Nov 6:45am", a class
  she attended that morning. It compares dates, not times.
- **Finished sessions today look untouched.** The 6:45am and 9:30am sessions show neither "to mark" nor "Marked"
  until tomorrow, and the roster still offers "Cancel this session" for a class that finished hours ago.
- **Unformatted number.** Check-in table shows steps as "9928.6"; the card above shows "9,929".

### Clutter

- **Member page header.** Member A's name and avatar appear twice in the first 200px, and there are three ways to
  message her (header icon, "Chat", "Message").
- **Workout day cards.** The weekday appears three times per card (MON chip, "Monday" title, "Mon" dropdown), and the
  day dropdown is always visible. The card's summary picks the warm-up ("BIKE · GOBLET SQUAT") rather than the main
  lifts.
- **Clients page** has two "…" menus; **Library** template rows have a chevron, "Edit" and "…" each.
- **Red flags** has its own gym picker under the header's gym switcher.

### Missing prompts

- **The member's own notes are hidden one day at a time.** Member A wrote "Feeling unwell today - cold" on Fri 30 Oct
  and "Unwell" on Sat and Sun, but the week summary does not mention it: the coach only sees each note by tapping
  that day. A "Their notes this week" list at the top of the check-in would put context next to the numbers before
  the coach replies.
- **Programme ending.** Member A is on "Week 3 of 3" of her programme with nothing queued, and nothing on the dashboard or
  Overview says so.
- **Peak week scores.** 11 to verify across 3 members, but no verify action in the list: the coach opens each
  member in turn.
- **Nutrition opens on today** (empty at 4pm) rather than the last day with food.

### Phone layout (375px)

- Dashboard to-do titles and summaries are cut off ("Weekly check-ins to revi…", "5 of 5 flagged members not co…").
- The floating + button covers the last to-do row's count.
- Member "Needs you" rows cut off the date ("Check-in to review: week of 26 …").
- Progress tab row and the chart's metric pills run off the screen.
- Messages is not on the bottom bar (it is the header icon) while Library and Business are. For a coach, messages
  are daily and Library weekly; worth reconsidering.

### Business for a regular coach

Brad does not see the owner's Overview tab, but can "+ Add package" and Edit the gym's plans (6 Week Challenge,
Classes Only Tier, Big Dog). Decide whether floor coaches should change gym-wide plans.

## Data clean-up seen while reviewing

Brad's real lists include test records: members "Test" (112 credits, 6 Week Challenge, flagged NEW) and
"test@example.com"; templates "Test" and "test 2". They show up in counts, to-do lists and red flags. A member with
no name set shows as their email ("ryan@ballisticperformance.co.uk"); worth checking whether that is a real member
or a staff test account. "Test" also reads "Never logged" on the dashboard but "Active 30d ago" in
Clients, so the two screens use different ideas of "active".

## Clutter verdict

The top level is lean: five bottom-bar items plus the header message icon, Settings under the avatar. The clutter
is inside a member's pages (repeated name and message buttons, builder controls on every workout card, seven
Progress tabs, the mixed Details page) and in follow-ups split across Dashboard, Clients and Classes with counts
that disagree.

## Still to check

- Desktop width (1280px+), where the member pages use a left menu instead of the bottom bar.
- Injury flags with a member who has one recorded and is booked into a class.
