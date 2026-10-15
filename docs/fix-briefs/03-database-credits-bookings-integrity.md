# Brief 03: Database: credits, bookings and data integrity (SQL only)

**Goal:** stop the database from losing or inventing credits and bookings, and make the multi-step admin actions all-or-nothing. All changes are **new migrations**. App changes that call these functions are in briefs 04 and 05 (named in each item).

**Migration numbers reserved:** `0132` (classes and bookings), `0133` (credits, rollouts, imports, groups), `0143` (drop direct ledger inserts: **apply only after brief 05 is merged**).
**Read for evidence:** `docs/COACH_OWNER_AUDIT.md` (CH2, CH4, CM9, CL3), `docs/AUDIT_ROUND_2.md` (R5, R33, R26, R27), `docs/MEMBERS_APP_AUDIT.md` (L6).

## Ground rules (same in every brief)

1. Read `CLAUDE.md`. The stack is fixed. `lib/calculations.ts` formulas must not change. The credits ledger is **append-only** (`credits_ledger`); never add a mutable balance column.
2. **Never write to the live database or run seed or stress scripts.** `.env.local` points at the live project. You write migrations and tests; the owner applies them. Test only against a throwaway sandbox project using `supabase/tests/security-audit/_safety.cjs` (`--ref` in `AUDIT_ALLOWED_REFS`). If no sandbox exists, write the checks and say they have not been run.
3. Never edit an existing migration. New files only, idempotent. New `security definer` functions: `set search_path = public`, NULL-safe checks, then `revoke execute ... from public, anon` and grant to `authenticated` only, as `0105` does.
4. `npm test`, `npx tsc --noEmit`, `npm run lint` must pass. Fictional test data only.
5. Stay inside this brief's files. No secrets or personal data. One commit per finding, imperative message, do not push.
6. For each **DECISION Dn** (`12-owner-tasks-and-decisions.md`), implement the recommended default and say so.
7. Finish by appending a `## Status` section to this file (ID, done/partly/skipped, commit, what the owner must check).

## Migration 0132: classes and bookings

### CH2 (database half). Deleting a session destroys booking history (High, DECISION D15)
- **Where:** `lib/data/classes.ts:63` (`deleteClass`: plain `delete`), `supabase/schema.sql:123` (`bookings.class_id` is `ON DELETE CASCADE`), button in `TimetableView.tsx:236-245`.
- **Effect:** one click deletes the session and **every booking ever made for it** (upcoming, past, attended). Credits already spent on upcoming bookings are not refunded (ledger rows stay, `booking_id` becomes null); members get no notification; "sessions done" and the 100/250/500 club progress drop; coach and owner attendance reports lose that history.
- **Default (D15): retire, never delete.**
  1. Add `classes.retired_at timestamptz null`. Make `bookings.class_id` `ON DELETE RESTRICT` (drop and re-add the foreign key).
  2. Add `retire_class(p_class_id uuid)` (`security definer`; coach in that class's gym): for every **future** occurrence with `booked` or `waitlist` bookings, cancel each booking, **refund** its deduction (reuse the logic in `cancel_class_occurrence`, `0105`), and insert the in-app notification; then set `retired_at = now()`. Past bookings and attendance stay untouched.
  3. Make every function that lists or books classes ignore retired ones (`book_class`, `book_class_for_client`, schedule and occurrence functions: grep `from classes`), and make `get_schedule_occurrences`-style functions skip them.
  4. Keep a way to really delete a class that has **no bookings at all** (a mistaken new slot): allow `delete` only when no booking row exists.
- **App follow-up (brief 04):** replace the Delete button with "Retire", showing how many upcoming members will be refunded and told.
- **Check:** retiring a session with 3 future bookings refunds 3 credits, writes 3 notifications, and keeps all past bookings; deleting a session that has any booking is refused by the database.

### R26 (database half). Editing a booked session changes it silently (Medium)
- **Where:** `updateClass` (`lib/data/classes.ts`), `TimetableView.tsx`: moving a 6 am class to 7 am, changing the weekday, or lowering capacity below the number booked saves with no check and no notice.
- **Change:** a `before update` trigger on `classes`: if `capacity` drops below the largest number of `booked` bookings on any **future** date, raise a clear error; an `after update` trigger: when `start_time`, `day_of_week` or `specific_date` change, insert an in-app notification for every member with a future `booked` booking. (Their booking dates for a changed weekday: decide and document; simplest is to refuse a weekday change when future bookings exist and tell the coach to retire the slot and create a new one.)

### SV1. Attendance can be marked for future sessions (Low)
- `mark_attendance` and `mark_attendance_status`: refuse a `booking_date` later than today in the **gym's** timezone (use `gyms.timezone`). A future "attended" counts toward sessions, clubs and rewards. The run-class screen (`/coach/run/<class>/<date>`) has no date guard either; brief 04 shows the message.

### L6. Check-in has no time window (Low-Medium, DECISION D5)
- **Where:** `check_in_booking` (`0071`) only requires today's date. The UI (`CheckInButton.tsx:21-22`) allows 2 minutes before to 15 minutes after the class start; the two disagree.
- **Default (D5):** the server allows **30 minutes before start until 60 minutes after start**, in the gym's timezone; raise `'Check-in opens 30 minutes before the class.'` / `'Check-in has closed.'`. Brief 07 (R17) makes the button follow the same numbers; export the numbers from one place (a comment in the function and a constant the app imports).

## Migration 0133: credits, rollouts, imports, groups

### CH4. Refunds can push a member above their plan's allowance (High, DECISION D1)
- **Where:** `replenish_due_memberships` / `top_up_membership_credits` (`0088`) set the `membership` bucket to exactly `credits_per_week` each Monday (`v_per_week - v_balance`). `cancel_booking`, `cancel_class_occurrence`, `coach_cancel_booking` (all `0105`) refund each deduction into its original bucket with no reference to the reset.
- **Scenario:** 3 credits a week; on Friday the member books next week's session (3 to 2); Monday's reset sets 3 (the spend vanishes); on Tuesday they cancel before the cut-off and are refunded +1: 4 credits on a 3-credit plan. Repeatable weekly.
- **Live state:** run the measuring query below first; on 14 Oct no member was over their allowance (0 rows), so this is latent.
  ```sql
  select b.client_id, b.balance, p.credits_per_week
  from credits_balance_by_bucket b
  join client_memberships m on m.client_id = b.client_id and m.ended_at is null
  join membership_packages p on p.id = m.package_id
  where b.bucket = 'membership' and b.balance > p.credits_per_week;
  ```
- **Default (D1): cap the refund.** When refunding into the `membership` bucket for a member with an **active** plan, refund `least(deduction, credits_per_week - current_membership_balance)` (never negative). Bonus-bucket refunds are unchanged. Apply in all three functions through one shared internal function `refund_booking_credits(p_booking uuid, p_reason text)` so the rule lives in one place. If the owner chooses another rule, only that function changes.
- **Check:** the scenario above ends at 3, not 4; a refund to a member whose balance is below the allowance is full; bonus credits refund in full.

### CM9. Credit grants have no cap, and removal is not atomic (Medium)
- **Where:** `grantCredits` and `grantCreditPack` (`lib/data/classes.ts:170`, `lib/data/memberships.ts:140`) insert straight into `credits_ledger`: any amount, no confirmation; `removeCredits` (`memberships.ts:216`) reads the balance and then inserts, so two coaches can both pass the check.
- **Add:** `grant_credits(p_client uuid, p_amount int, p_reason text, p_expires_at timestamptz)` (coach of the member; amount 1 to 50; reason 1 to 200 characters; writes `granted_by = auth.uid()`; bucket `bonus`) and `remove_credits(p_client uuid, p_amount int, p_reason text)` (takes `pg_advisory_xact_lock` on the member, reads the balance and inserts in one transaction, never below zero, 1 to 50). Also `grant_credit_pack(p_client, p_pack)` that reads the pack row itself.
- **App follow-up (brief 05):** switch the three TypeScript functions to these RPCs.
- **Then migration 0143 (apply only after brief 05 is merged):** drop the coach direct-INSERT policy on `credits_ledger` so the cap cannot be bypassed.
- **Check:** grant of 51 refused; two parallel removals cannot overdraw.

### R5 (database half). A failed "Start a programme" still runs overnight (High)
- **Where:** `lib/data/programTemplates.ts:435-470` (`scheduleProgrammeRollout`) inserts a `programme_rollouts` row, then calls `apply_programme_rollout`. If the apply fails the coach sees an error but the row (applied_at null, start today) stays; the 03:15 UTC `apply-programme-rollouts` job then applies it.
- **Add:** `schedule_programme_rollout(p_template_id uuid, p_program_name text, p_start date, p_audience text, p_client_ids uuid[], p_starts_now boolean)` (`security definer`): validate the template belongs to the caller's gym, that every `p_client_ids` member belongs to **that gym** (`client_gym_id`) and is a client of this coach (unless the caller is a gym admin), that `'all'` is allowed only for a gym admin, insert the row and, if `p_starts_now`, apply it, **all in one transaction** so an error rolls back the insert. Return the number of members affected.
- **Also check `apply_programme_rollout` (`0094`)** for how `audience = 'all'` selects members (about line 161): it must use the member's gym (`client_gym_id(c.id) = v_r.gym_id`), not the coach's active gym.
- **App follow-up (brief 04):** call this function, show the count and ask for confirmation first.

### CL3. Template import is not atomic (Low)
- `importProgramTemplate` (`lib/data/programTemplates.ts`, `templateTransfer.ts`) inserts the template, then each day and exercise one request at a time; a failure leaves a half-built template. Add `import_program_template(p_json jsonb)` that whitelists fields (as the TypeScript does today) and inserts everything in one transaction, with limits (for example at most 20 weeks, 14 days per week, 60 exercises per day). **App follow-up (brief 04).**

### R33. A group used in any broadcast can never be deleted (Medium)
- **Where:** `scheduled_communications.target_group_id` is `ON DELETE SET NULL` (`0031`), but the check added in `0097` requires it to be non-null when `target_type = 'group'`, so the `SET NULL` violates it and the delete fails. Sent broadcasts cannot be deleted in the UI.
- **Change:** drop that check and replace it with one that allows a null group after deletion (`target_type <> 'group' and target_group_id is null` or `target_type = 'group'`); add `target_group_name text` and fill it when a broadcast is created (and backfill from `client_groups.name`) so history can still say which group it was. Make the sender skip a `group` broadcast whose group is gone (a **pending** or repeating one should be cancelled, not sent to nobody or everybody: set `cancelled_at`, add the column if needed). Confirm the sender never treats a null group as "everyone".
- **Check:** delete a group that has a sent broadcast: it succeeds, the history row stays with the saved name; a pending broadcast to that group is cancelled.

## Definition of done

- Three migration files, sandbox checks added (extend `booking-rules-check.cjs`, `rpc-state-change-check.cjs`; add credit and rollout checks), the measuring and pre-flight queries documented.
- `## Status` lists the new functions (name and arguments), which app brief uses each, and the order to apply (`0143` last, after brief 05).

## Status

Branch `fix/03-credits-integrity` (cut from `fix/02-gym-scoping`, so it builds on 0127 to 0131), 11 commits plus this status commit, nothing pushed. Migrations: `0132_classes_bookings_and_refunds.sql`, `0133_credits_rollouts_imports_groups.sql`, `0143_drop_direct_credit_inserts.sql` (**apply last, only after brief 05 is merged and deployed**).

**Not run anywhere yet.** There is no sandbox project and no Postgres on this machine, so none of the SQL has been executed and `credits-integrity-check.cjs` has never been run. What did run: `npm test` (257 pass; 31 new static tests in `supabase/tests/migration-credits.test.ts` that fail without these migrations), `npx tsc --noEmit` (clean), `npm run lint` (0 errors, the same 9 warnings as before). The first real test is applying 0132 and 0133 to the sandbox and running `credits-integrity-check.cjs` (needs `--ref=<sandbox ref>` in `AUDIT_ALLOWED_REFS`; add `--after-0143` once 0143 is applied).

### Findings

| ID | Result | Commit | Notes |
|---|---|---|---|
| CH4 | done (D1 default: cap) | `23204a7` | One shared `refund_booking_credits`. It lives in **0132, not 0133**: `retire_class` (CH2) has to refund, and a function in 0132 cannot rely on one created in a later file. |
| CH2 | done (D15 default: retire, never delete) | `31410a6` | |
| R26 | done | `2b1d04e` | Weekday change refused while anyone is booked (retire and recreate instead). |
| SV1 | done | `0f7e514` | |
| L6 | done (D5 default: 30 min before to 60 min after) | `66d089e` | |
| CM9 | done | `f68f996`, `868cac8` | `0143` drops the coach's direct insert. |
| R5 | done (database half) | `f9b9365` | |
| CL3 | done (database half) | `d7042d5` | |
| R33 | done | `f71391b` | |
| Checks | added, not run | `ce974f1` | `credits-integrity-check.cjs` covers all of the above; `booking-rules-check.cjs` and `rpc-state-change-check.cjs` were not extended (the existing ones still fit: they delete bookings before classes and cancel on future dates). |

### Functions for briefs 04, 05 and 07 (name and arguments)

All signed-in only, `security definer`, `set search_path = public`, revoked from `anon`.

| Function | Who | Returns | App brief |
|---|---|---|---|
| `retire_class(p_class_id uuid)` | coach at the class's (active) gym | jsonb `{cancelled, refunded_credits, already_retired}` | 04 (replace the Delete button; show how many upcoming members will be refunded and told) |
| `schedule_programme_rollout(p_template_id uuid, p_program_name text, p_start date, p_audience text, p_client_ids uuid[], p_starts_now boolean)` | coach; `'all'` for gym admins only | integer: members applied to (now) or reached (later) | 04 (show the count, ask first) |
| `import_program_template(p_json jsonb)` | coach | uuid of the new template | 04 |
| `grant_credits(p_client uuid, p_amount integer, p_reason text, p_expires_at timestamptz default null)` | the member's coach | void | 05 |
| `remove_credits(p_client uuid, p_amount integer, p_reason text)` | the member's coach | void | 05 |
| `grant_credit_pack(p_client uuid, p_pack uuid)` | the member's coach | void | 05 |
| `refund_booking_credits(p_booking uuid, p_reason text)` and the `_import_*` helpers | **nobody** (internal) | | |

New columns: `classes.retired_at`, `scheduled_communications.target_group_name` and `cancelled_at`. Error text to show as it is: "This session has bookings, so it can't be deleted. Retire it instead...", "That session is no longer running", "Members are already booked on upcoming sessions. Retire this slot and create a new one instead.", "N members are already booked on one of the upcoming sessions, so the capacity can't go below that.", "You can't mark attendance for a session that hasn't happened yet.", "Check-in opens 30 minutes before the class." / "Check-in has closed.", "You can give between 1 and 50 credits at a time.", "They only have N credits.", "Only a gym admin can start a programme for everyone.", "A day can have up to 60 exercises." / "A programme can have up to 20 weeks." / "A week can have up to 14 days."

### Before applying: what the owner must do

1. Back up. Apply `0132`, then `0133` to the sandbox (after `0131`), then run `credits-integrity-check.cjs`. Apply to live one file at a time. **Do not apply `0143` until brief 05 is deployed** (until then the app writes to `credits_ledger` itself and every grant and removal would fail); then apply it and run the check again with `--after-0143`.
2. Run these **read-only** queries on live first:

```sql
-- CH4 measuring query: members over their plan's allowance today (the brief measured 0 rows on 14 Oct)
select b.client_id, b.balance, p.credits_per_week
from credits_balance_by_bucket b
join client_memberships m on m.client_id = b.client_id and m.ended_at is null
join membership_packages p on p.id = m.package_id
where b.bucket = 'membership' and b.balance > p.credits_per_week;

-- CH2: future bookings per session (what retiring each would refund and tell), and the foreign keys that will be replaced
select c.id, c.name, c.day_of_week,
       count(*) filter (where b.booking_date >= current_date and b.status in ('booked','waitlist')) as future_bookings,
       count(b.id) as all_bookings
from public.classes c left join public.bookings b on b.class_id = c.id group by 1, 2, 3 order by 4 desc;
select conname, pg_get_constraintdef(oid) from pg_constraint where conrelid = 'public.bookings'::regclass and contype = 'f';

-- R26: sessions where a capacity or weekday change would be refused right now
select c.id, c.name, c.capacity, max(x.booked) as most_booked_on_one_date
from public.classes c
join (select class_id, booking_date, count(*) filter (where status = 'booked') as booked
      from public.bookings where booking_date >= current_date group by 1, 2) x on x.class_id = c.id
group by 1, 2, 3 order by 4 desc;

-- SV1: attendance already marked for a date that has not happened (left alone)
select count(*) from public.bookings b join public.classes c on c.id = b.class_id join public.gyms g on g.id = c.gym_id
where (b.attended or b.no_show) and b.booking_date > (now() at time zone coalesce(g.timezone, 'UTC'))::date;

-- L6: classes with no start time (they keep the day-long check-in window)
select id, name from public.classes where start_time is null;

-- CM9: existing grants the caps would not have allowed, and oversized packs
select client_id, delta, reason, created_at from public.credits_ledger
where granted_by is not null and booking_id is null and (delta > 50 or delta < -50) order by created_at desc;
select id, name, credits from public.credit_packs where credits > 500;

-- R5: rollouts waiting for the overnight job right now (check none is a left-over of a failed attempt)
select r.id, g.name as gym, r.program_name, r.start_date, r.audience, cardinality(r.client_ids) as chosen, r.created_at
from public.programme_rollouts r join public.gyms g on g.id = r.gym_id where r.applied_at is null order by r.start_date;

-- R33: group broadcasts, and how many are still pending
select target_type, count(*) as rows, count(*) filter (where sent_at is null) as pending
from public.scheduled_communications where target_type = 'group' group by 1;

-- 0143: policies and privileges on the ledger today
select polname, polcmd from pg_policy where polrelid = 'public.credits_ledger'::regclass;
```

### Things to know

- **A capped refund writes a zero row** (reason ends "nothing to add: already at the weekly allowance") so the red flag report does not count an on-time cancel as a late one. To make that work, `red_flag_week_stats` (brief 02's 0129 definition) now counts a late cancel as "cancelled, paid for, and no refund row at all (`delta >= 0`)". The coach attendance list in `lib/data/classes.ts` marks a booking refunded when it has a ledger row with `delta > 0`, so for a zero row it correctly says "not refunded".
- **A member with no active plan is refunded in full** (there is no allowance to compare with). Refunds that arrive after a plan ended are unchanged from before; flagging it in case the owner wants them capped or refused (D1).
- **Brief 02's definitions of `book_class_for_client`, `cancel_class_occurrence` and `red_flag_week_stats` were rebuilt from the 0129 / 0130 versions**, keeping everything brief 02 added. `apply_programme_rollout` is untouched: brief 02 already made it null-safe and picks "everyone" by the member's own gym.
- **Retired sessions are still readable.** Their history (and member booking history) keeps the session's name. Every screen that lists sessions to book or run must filter `retired_at is null` (brief 04; there are no SQL schedule functions to change).
- **A deleted-but-booked session is now impossible**, so the TypeScript `deleteClass` fails with the "Retire it instead" message until brief 04 replaces the button. A session with no bookings can still be deleted.
- **R26 also notifies waitlisted members** of a start-time change (the brief said booked).
- **R5 atomicity is by construction:** the insert and the apply are one function, so any error rolls both back. The sandbox script checks the refusals leave no rollout row behind; it cannot force a failure inside the apply.
- **CL3 changes data a little on purpose:** non-https video links and out-of-range numbers in an imported file are left empty instead of failing the import; a % of 1RM exercise without a library entry is refused by name.
- **R33:** the app's "pending broadcasts" lists should hide rows with `cancelled_at` set (briefs 05 and 09). Sent broadcasts still cannot be deleted in the UI (that is a screen change). Email goes out only for rows that were sent, so a cancelled row is never emailed.
- **Locking:** refunds, grants and removals take a per-member lock so they never interleave. The weekly reset (`replenish_due_memberships`, `top_up_membership_credits`) was not changed and does not take it, so a refund landing at the exact moment of the Monday reset can still be off by one credit in rare cases.
- **L6 numbers** (30 and 60 minutes) live in `check_in_booking` only; brief 07 (R17) should export matching constants in the app.

### Hand-offs

- **Brief 04:** `deleteClass` to retire; `scheduleProgrammeRollout` and `importProgramTemplate` to the two new functions; show the new error text; the run-class screen shows the SV1 message; filter retired sessions.
- **Brief 05:** `grantCredits`, `grantCreditPack`, `removeCredits` to the three RPCs. **Merge and deploy before `0143`.**
- **Brief 07:** check-in button follows 30 minutes before to 60 minutes after.
- **Brief 09:** `cancelled_at` on broadcasts; cancelled rows are not sent.
