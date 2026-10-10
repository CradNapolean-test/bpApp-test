# Owner side: plan

Status: plan only, nothing built. Comes after the coaching side (decision from the owner).

## What exists today

- `gyms`, `coach_gym_memberships (coach_id, gym_id, is_gym_admin)`, `profiles.gym_id` as the coach's active gym, and clients with a fixed home `gym_id` (0052, 0056).
- A coach can belong to several gyms and switch (`GymSwitcher`, `switch_active_gym`). A gym admin can already see the Business hub (`getBusinessOverview`, plans, packs, events, rewards, feedback) and `GymAdminSection` (rename gym, booking rules, make a coach admin, add a coach).
- Coach accounts and gyms are still created by script (`npm run create-coach`, `create-gym`).
- Everything is scoped to one gym at a time. Nothing shows both gyms together.

## What the owner needs

1. One overview of both gyms, with deeper reports.
2. Create coach accounts, assign them to a gym (or both), and manage them.
3. Manage gym settings.

## Decision: a separate owner role, not "a coach who is admin of both gyms"

An admin coach is also on the coaching rota and sees member data. The owner wants a business view, so:

- `profiles.role = 'owner'` with an `organisations` row (`organisations(id, name)`, `gyms.organisation_id`, `profiles.organisation_id`).
- RLS helper `is_owner_of_gym(gym_id)`: the owner's organisation owns that gym.
- The owner reads **aggregates through security-definer RPCs**, not raw client rows (food diaries, photos, chat stay private to coaches). The owner can drill from a number to a member's name and plan, but not into their messages or diaries unless that is wanted later.
- Login routes owner accounts to `/owner`. An owner who also coaches can be given a coach account too (two logins, or a switch later).

## Phases

### 1. Foundation
- Migration: organisations, `owner` role, `is_owner_of_gym`, owner read policies on gyms, coach memberships and the aggregate RPCs.
- `/owner` shell: phone bottom bar (Overview, Reports, Team, Gyms) and desktop sidebar, same look as the coach side. Gym filter at the top: All gyms, or one.
- Seed: make the current owner an `owner` of the organisation containing both gyms (script, like `create-gym`).

### 2. Overview (both gyms)
Per gym side by side, plus a combined total:
- Members, on a plan, with no plan, new this month, left this month (plan ended, not renewed).
- Attendance this month against last month; average class fill; busiest and quietest sessions.
- Red flag counts from the weekly tracker; sessions still unmarked.
- Plan mix and an estimated monthly recurring revenue (plan price x members; there is no payment processor, so it is an estimate and labelled as one).
- Credits outstanding (a liability number the owner will want).
- Coach table: members each, check-in rate, members to review.
Reuses `getBusinessOverview`, `getCoachReport` and `getRedFlagReport`, which need a gym argument (they read the active gym today).

### 3. Deeper reports
- Retention: members by month joined, still active after 1, 3 and 6 months.
- Attendance trend by week, by gym and by time slot; no-shows and late cancels by gym.
- Coach comparison: member count, attendance, check-ins, response time on messages.
- Period comparison (7 / 30 / 90 days against the period before), same pattern as coach Reports.
- CSV export of each table.

### 4. Team (coach accounts)
- Add a coach: name, email, gym(s), admin yes/no. A server action using the admin client creates the auth user and sends an invite email so the coach sets their own password (the owner never sees or sets a password).
- Edit: change gyms, make or remove gym admin, switch a coach to the other gym.
- Deactivate: block login, keep history, reassign their members to another coach in one step.
- Guardrails: only an owner can do this; each action is checked in the database function, not only in the UI; an audit log row per change.

### 5. Gym settings (owner, any gym)
- Name, timezone, address, logo and brand colour.
- Booking rules (cancel cut-off, no-show handling, waitlist), red flag thresholds, default check-in reminder.
- Plans and credit packs per gym, with a "copy to the other gym" action (like the education course copy).
- Create a new gym (replaces `create-gym`).
- Gym admins keep their current settings screen for their own gym.

## Build order and size
1 then 2 first (about one session each); the owner gets a useful screen as soon as phase 2 lands. 4 before 3 if getting coach accounts off scripts matters more than reports. 5 last.

## Decisions from the owner (Oct 2026)
1. The owner is not a coach. They need to **read coaches' messages with members** to check coaches are checking in with people properly and to find ways to improve how they do it (see Phase 3).
2. The owner **can open a member's profile** (read access to profiles, programme, check-ins and progress). Food diary and photos stay coach-only. Chat is readable by the owner, read-only, for the message review above.
3. **Exercise library and education are shared across both gyms**; **plans and credit packs are per gym**.
4. **Payments are taken elsewhere**, so there are no revenue or takings figures. The Overview shows plan counts and members, not money.
5. No staff levels below coach for now.
6. No weekly summary email for now.

## What these change in the phases
- Phase 1 also needs organisation-level libraries: exercise library and education become organisation-wide instead of per gym (today they are gym-shared, 0054, and copied by hand between gyms). Plans and packs stay per gym.
- Phase 2 loses the revenue estimate. It keeps credits outstanding only if the owner wants it.
- Phase 3 gains a **Coach messages review** (read-only):
  - Pick a coach, see their conversations, newest first, and open any thread (read only; the owner never sends from it).
  - Quick signals to find what to read: members the coach has not messaged in 7 / 14 / 30 days, members who wrote and are still waiting for a reply, average reply time, messages per member per week.
  - **Feedback to the coach:** the owner can add a private note on a conversation or a single message ("great check-in", "ask about sleep next time"). The coach sees these in a "Feedback from the owner" list; members never do.
  - Tidy filters: by coach, gym, member, date range, and "no coach message this week".
  - Members are told in the terms/privacy page that messages may be reviewed by the gym owner (wording to check before launch).
  - Database: a read policy on `chat_messages` and `chat_threads` for `is_owner_of_gym`, and a small `message_feedback` table (owner writes, coach reads).
- Phase 4 and 5 unchanged, except "copy plans to the other gym" stays optional.
- Owner gets read access to member profiles through the same gym-wide read rules the coach side already uses, scoped by `is_owner_of_gym`.

## Build log

**Phase 1 (foundation), built.** Migrations `0102_owner_role.sql` (run alone: adds the `owner` value) then `0103_owner_foundation.sql` (organisations, `gyms.organisation_id`, `profiles.organisation_id`, `is_owner`, `my_org_id`, `is_owner_of_gym`, owner read policies, `is_same_gym_as_client` now also true for the owner of the member's gym, and the `owner_gyms_overview()` RPC). `npm run create-owner -- --email=...` creates the login and puts all gyms into one organisation. Sign-in sends owners to `/owner`, which shows both gyms (members, coaches and how many members each has) with an All gyms / one gym filter.

Not in phase 1, still to do:
- Owner nav for the next sections (Reports, Coach messages, Team, Gyms) as they are built.
- A read-only member profile for the owner. `/coach/clients/[id]` is coach-only today; the database already lets the owner read the data.
- Exercise library and education shared across both gyms (organisation-wide); plans and credit packs stay per gym.
