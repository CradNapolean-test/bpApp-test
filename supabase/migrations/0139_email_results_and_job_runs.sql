-- Email, push and notifications (fix brief 09).
--
--  CM1/R2  A broadcast used to be stamped "email sent" whenever a mail key existed, even when every batch failed. The row now keeps what
--          happened: how many went, how many failed, why, and how many times the daily job has tried. email_sent_at is set only when at
--          least one email really went.
--  Job health  job_runs: one row each time a daily job finishes, so "did the job run today" can be answered from the database instead of
--          being worked out from side effects. The app keeps the last 60 days.
--
-- PRE-FLIGHT (read-only): nothing is rejected; two optional columns are added to existing rows (null) and one new table.
--   -- broadcasts the old code stamped as emailed (they cannot be told apart from real sends, so they are left as they are):
--   select count(*) from public.scheduled_communications where email_sent_at is not null;
-- Re-runnable.

alter table public.scheduled_communications
  add column if not exists email_sent_count integer,
  add column if not exists email_failed_count integer,
  add column if not exists email_error text,
  add column if not exists email_attempts integer not null default 0,
  add column if not exists email_last_attempt_at timestamptz;

alter table public.scheduled_communications drop constraint if exists scheduled_communications_email_error_length;
alter table public.scheduled_communications
  add constraint scheduled_communications_email_error_length check (email_error is null or char_length(email_error) <= 300);

create table if not exists public.job_runs (
  id bigint generated always as identity primary key,
  job text not null,
  ran_at timestamptz not null default now(),
  ok boolean not null,
  detail text,
  constraint job_runs_detail_length check (detail is null or char_length(detail) <= 500)
);

create index if not exists job_runs_job_ran_at_idx on public.job_runs (job, ran_at desc);

-- Written and read with the service role only (the daily jobs, the SQL editor): no policy, so the API sees nothing.
alter table public.job_runs enable row level security;
revoke all on table public.job_runs from anon, authenticated;
