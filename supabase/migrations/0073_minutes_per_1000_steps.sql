-- How long a member takes to walk 1,000 steps. The Activity swap screen starts from it instead of
-- asking again every visit. Member-owned: the existing "client updates own client_profiles" policy
-- already covers it.

alter table public.client_profiles
  add column if not exists minutes_per_1000_steps numeric(4, 1) not null default 10
  check (minutes_per_1000_steps > 0 and minutes_per_1000_steps <= 60);
