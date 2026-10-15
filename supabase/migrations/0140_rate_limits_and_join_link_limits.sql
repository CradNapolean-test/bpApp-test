-- Security hardening (fix brief 10).
--
--  M7  The public sign-up endpoint (/api/join) had no limits. This adds:
--        rate_limits + rate_limit_hit(): one counter per (key, time window), bumped atomically, so the app can say "5 attempts per address
--        per hour" and "50 per link per day" without an outside service. Nothing identifies a person: the key is a hash.
--        onboarding_links.max_uses_per_day (default 50) and expires_at (default none): a coach's reusable link can be capped and can run out.
--      The same counters limit the AI food-photo route (M13) and "Download my data" (D13).
--
-- PRE-FLIGHT (read-only; nothing is rejected, the new columns are defaulted):
--   select count(*) as links, count(*) filter (where active) as active_links from public.onboarding_links;
-- Re-runnable.

create table if not exists public.rate_limits (
  key text not null,
  window_start timestamptz not null,
  count integer not null default 0,
  primary key (key, window_start),
  constraint rate_limits_key_length check (char_length(key) <= 200)
);

create index if not exists rate_limits_window_idx on public.rate_limits (window_start);

-- Closed to the API: written and read only through rate_limit_hit by the server (service role).
alter table public.rate_limits enable row level security;
revoke all on table public.rate_limits from anon, authenticated;

-- Counts one more use of `p_key` in the window that starts at `p_window_start` and answers how many there have been in it, this one
-- included. The caller decides what is too many. Old windows are swept now and then (about one call in fifty) so the table stays small.
create or replace function public.rate_limit_hit(p_key text, p_window_start timestamptz, p_window_seconds integer)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  if p_key is null or p_key = '' or p_window_start is null then
    raise exception 'A key and a window are required';
  end if;

  insert into rate_limits as r (key, window_start, count)
  values (p_key, p_window_start, 1)
  on conflict (key, window_start) do update set count = r.count + 1
  returning r.count into v_count;

  if random() < 0.02 then
    delete from rate_limits where window_start < now() - interval '2 days';
  end if;

  return v_count;
end;
$$;

revoke execute on function public.rate_limit_hit(text, timestamptz, integer) from public, anon, authenticated;
grant execute on function public.rate_limit_hit(text, timestamptz, integer) to service_role;

-- A coach's sign-up link: how many sign-ups a day it allows (the app counts them with rate_limit_hit), and an optional end date.
alter table public.onboarding_links add column if not exists max_uses_per_day integer not null default 50;
alter table public.onboarding_links add column if not exists expires_at timestamptz;

alter table public.onboarding_links drop constraint if exists onboarding_links_max_uses_range;
alter table public.onboarding_links
  add constraint onboarding_links_max_uses_range check (max_uses_per_day between 1 and 1000);
