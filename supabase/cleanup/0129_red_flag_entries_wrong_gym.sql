-- CLEAN-UP for migration 0129 (R36). NOT a migration: nothing here runs automatically. Review every result with the owner first.
--
-- Before 0129, opening the Red Flags tab filed a coach's members under the coach's ACTIVE gym, so a coach who works in two gyms
-- left copies of their members' entries under the wrong gym (live: 187 rows; the week of 5 Oct had 38 entries under Worsley, a gym
-- with no members). 0129 stops new ones. This script finds the old ones and splits them into three groups:
--
--   A  no coach input, and the same member/week already has an entry under their own gym  -> a pure duplicate: safe to delete
--   B  no coach input, and no entry exists under their own gym for that week              -> the flag is real but filed under
--                                                                                          the wrong gym: MOVE it, do not delete
--   C  the team has recorded something (contacted, reason, tier, or a follow-up coach other than the member's own coach)
--                                                                                       -> review by hand, never touched here
--
-- "Coach input" means any of: contacted <> 'no', a non-blank reason, a tier, or coach_id different from the member's coach.
-- Run STEP 1 first (counts), then STEP 2 (the rows), then, only after review, the commented statements in STEP 3, one at a time,
-- inside a transaction you can roll back. Take a backup first.

-- ---------------------------------------------------------------------------------------------------------------------
-- STEP 1. Counts (read-only).
-- ---------------------------------------------------------------------------------------------------------------------
with wrong as (
  select
    e.*,
    public.client_gym_id(e.client_id) as member_gym,
    (
      e.contacted <> 'no'
      or nullif(btrim(coalesce(e.reason, '')), '') is not null
      or e.tier is not null
      or e.coach_id is distinct from (select p.coach_id from public.profiles p where p.id = e.client_id)
    ) as has_input
  from public.red_flag_entries e
  where e.gym_id is distinct from public.client_gym_id(e.client_id)
),
classified as (
  select
    w.*,
    case
      when w.has_input then 'C review by hand'
      when exists (
        select 1 from public.red_flag_entries r
        where r.gym_id = w.member_gym and r.week_start = w.week_start and r.client_id = w.client_id
      ) then 'A duplicate, safe to delete'
      else 'B move to the member''s gym'
    end as action
  from wrong w
)
select action, count(*) as entries, count(distinct client_id) as members
from classified
group by action
order by action;

-- ---------------------------------------------------------------------------------------------------------------------
-- STEP 2. The rows behind those counts (read-only). Keep this output for the record.
-- ---------------------------------------------------------------------------------------------------------------------
with wrong as (
  select
    e.*,
    public.client_gym_id(e.client_id) as member_gym,
    (
      e.contacted <> 'no'
      or nullif(btrim(coalesce(e.reason, '')), '') is not null
      or e.tier is not null
      or e.coach_id is distinct from (select p.coach_id from public.profiles p where p.id = e.client_id)
    ) as has_input
  from public.red_flag_entries e
  where e.gym_id is distinct from public.client_gym_id(e.client_id)
)
select
  case
    when w.has_input then 'C review by hand'
    when exists (
      select 1 from public.red_flag_entries r
      where r.gym_id = w.member_gym and r.week_start = w.week_start and r.client_id = w.client_id
    ) then 'A duplicate, safe to delete'
    else 'B move to the member''s gym'
  end as action,
  w.id as entry_id,
  w.week_start,
  gf.name as filed_under_gym,
  gm.name as members_own_gym,
  w.client_id,
  w.contacted, w.reason, w.tier, w.coach_id
from wrong w
left join public.gyms gf on gf.id = w.gym_id
left join public.gyms gm on gm.id = w.member_gym
order by action, w.week_start desc, filed_under_gym;

-- ---------------------------------------------------------------------------------------------------------------------
-- STEP 3. The changes. Commented out on purpose. Run one at a time, check the row count it reports against STEP 1, then COMMIT.
-- ---------------------------------------------------------------------------------------------------------------------

-- begin;
--
-- -- Group B first: move the entries that have no copy under the member's own gym.
-- update public.red_flag_entries e
-- set gym_id = public.client_gym_id(e.client_id), updated_at = now()
-- where e.gym_id is distinct from public.client_gym_id(e.client_id)
--   and public.client_gym_id(e.client_id) is not null
--   and e.contacted = 'no'
--   and nullif(btrim(coalesce(e.reason, '')), '') is null
--   and e.tier is null
--   and e.coach_id is not distinct from (select p.coach_id from public.profiles p where p.id = e.client_id)
--   and not exists (
--     select 1 from public.red_flag_entries r
--     where r.gym_id = public.client_gym_id(e.client_id) and r.week_start = e.week_start and r.client_id = e.client_id
--   );
--
-- -- Group A: delete the pure duplicates (run AFTER the move above, which cannot create new duplicates).
-- delete from public.red_flag_entries e
-- where e.gym_id is distinct from public.client_gym_id(e.client_id)
--   and e.contacted = 'no'
--   and nullif(btrim(coalesce(e.reason, '')), '') is null
--   and e.tier is null
--   and e.coach_id is not distinct from (select p.coach_id from public.profiles p where p.id = e.client_id)
--   and exists (
--     select 1 from public.red_flag_entries r
--     where r.gym_id = public.client_gym_id(e.client_id) and r.week_start = e.week_start and r.client_id = e.client_id
--   );
--
-- -- Mark the moved weeks as generated for the member's gym, so the report does not say "not generated" for them.
-- insert into public.red_flag_week_runs (gym_id, week_start)
-- select distinct gym_id, week_start from public.red_flag_entries
-- on conflict (gym_id, week_start) do nothing;
--
-- -- Look at STEP 1 again: only group C should remain. Then:
-- -- commit;   -- or: rollback;
