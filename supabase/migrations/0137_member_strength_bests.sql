-- Brief 07 (H5, ST1): a member's best set for every exercise, over all their history.
--
-- The Strength tab worked out personal bests from the sets the page carried. Every set is a row (about 20 a session), and the
-- database returns at most 1,000 rows a request, so past a few months the older sets silently dropped out and a "personal best"
-- could be a lift the member had already beaten. The screens now carry the last 90 days of sets (lib/trainingWindow.ts) and ask
-- this function for the best set per exercise, either over everything (p_before null) or only before a date (the bests the
-- 90-day history has to beat, so a PR flag inside the window is true).
--
-- Same rules as the app: warm-up sets and sets with no load or no reps do not count; the score is the Epley estimated one-rep
-- max (reps 1 = the load, up to 12 reps = load x (1 + reps / 30)), else the load. Exercises are grouped by library id, else by the
-- programme exercise's name, as the Strength tab does. The caller must be the member or their coach (owns_client).
--
-- PRE-FLIGHT: none (a new function; nothing is changed).
-- ROLLBACK: drop function public.member_strength_bests(uuid, timestamptz);

create or replace function public.member_strength_bests(p_client uuid, p_before timestamptz default null)
returns table (exercise_key text, best_load numeric, best_reps integer, best_score numeric, logged_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select distinct on (s.key) s.key, s.load, s.reps, s.score, s.logged_at
  from (
    select coalesce(coalesce(l.exercise_library_id, we.exercise_library_id)::text, 'n:' || lower(we.name)) as key,
           l.actual_load::numeric as load,
           l.actual_reps::integer as reps,
           l.logged_at,
           coalesce(
             case
               when l.actual_reps = 1 then l.actual_load
               when l.actual_reps <= 12 then l.actual_load * (1 + l.actual_reps / 30.0)
             end,
             l.actual_load
           )::numeric as score
    from public.workout_logs l
    left join public.workout_exercises we on we.id = l.exercise_id
    where l.client_id = p_client
      and public.owns_client(p_client)
      and l.set_type is distinct from 'warmup'
      and coalesce(l.actual_load, 0) > 0
      and coalesce(l.actual_reps, 0) > 0
      and (p_before is null or l.logged_at < p_before)
  ) s
  where s.key is not null
  order by s.key, s.score desc, s.logged_at desc;
$$;

revoke execute on function public.member_strength_bests(uuid, timestamptz) from public, anon;
grant execute on function public.member_strength_bests(uuid, timestamptz) to authenticated;
