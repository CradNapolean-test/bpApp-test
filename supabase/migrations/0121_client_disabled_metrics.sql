-- Daily check-in measures a coach has switched off for one member (e.g. steps off, sleep on). Same access
-- pattern as client_disabled_screens (0029): the member can read their own rows so their app knows what to
-- hide, only their coach can write them.

create table if not exists client_disabled_metrics (
  client_id uuid not null references profiles(id) on delete cascade,
  metric text not null check (metric in ('sleep', 'steps', 'water', 'hunger', 'energy', 'motivation', 'stress')),
  primary key (client_id, metric)
);

alter table client_disabled_metrics enable row level security;

drop policy if exists "select own or coached client_disabled_metrics" on client_disabled_metrics;
create policy "select own or coached client_disabled_metrics"
  on client_disabled_metrics for select
  using (owns_client(client_id));

drop policy if exists "coach manages client_disabled_metrics" on client_disabled_metrics;
create policy "coach manages client_disabled_metrics"
  on client_disabled_metrics for all
  using (is_coach_of(client_id))
  with check (is_coach_of(client_id));
