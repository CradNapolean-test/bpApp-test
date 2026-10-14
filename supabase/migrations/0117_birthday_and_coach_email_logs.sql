-- Two small server-only logs. Both are written and read only by server code using the service role, so
-- row level security is on with NO policies: members and coaches cannot read or write them directly.

-- One row per member per year: stops the daily birthday cron sending twice if it runs again.
create table if not exists birthday_emails_sent (
  client_id uuid not null references profiles(id) on delete cascade,
  year integer not null,
  sent_at timestamptz not null default now(),
  primary key (client_id, year)
);
alter table birthday_emails_sent enable row level security;

-- Emails a member sends their coach from the app: audit trail and the rate limit (see lib/data/coachEmail.ts).
create table if not exists coach_email_log (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references profiles(id) on delete cascade,
  coach_id uuid references profiles(id) on delete set null,
  sent_at timestamptz not null default now()
);
create index if not exists coach_email_log_client_recent on coach_email_log (client_id, sent_at desc);
alter table coach_email_log enable row level security;
