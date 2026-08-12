-- Coach-private per-client journal: Notes/Goals/Injuries for the new CoachClientWorkspace
-- Info tab. One table, `kind` discriminates the three UI sections (mirrors the
-- meal_plan_entries.section / daily_logs.day_type pattern already used elsewhere in this
-- schema for "one list, several near-identical variants").
create table client_journal_entries (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references profiles(id) on delete cascade,
  coach_id uuid not null references profiles(id),
  kind text not null check (kind in ('note', 'goal', 'injury')),
  body text not null,
  created_at timestamptz default now()
);

alter table client_journal_entries enable row level security;

-- First table in the schema where the client has zero access on every operation. Every
-- other coach-only "for all" policy (workout_programs, credits_ledger) is paired with a
-- separate owns_client() select policy that still lets the client read; this one has no
-- client-matching policy at all, so RLS's default-deny means the client gets zero rows,
-- no explicit "deny" needed.
create policy "coach manages own client_journal_entries"
  on client_journal_entries for all
  using (is_coach_of(client_id))
  with check (is_coach_of(client_id) and coach_id = auth.uid());
