-- Members can log their own peak week scores. A score is stored as one number (result_value: kg,
-- reps, seconds or metres); the level is worked out from the standards by the app and re-checked
-- on the server. A member's own rows are flagged self_reported and never count towards a T-shirt
-- tier -- a coach verifies a score by recording their own (verified) row.

alter table public.big_dog_results add column if not exists result_value numeric;
alter table public.big_dog_results add column if not exists self_reported boolean not null default false;

-- A member can add rows for themselves, only flagged as self-reported.
drop policy if exists "member logs own big_dog_results" on public.big_dog_results;
create policy "member logs own big_dog_results"
  on public.big_dog_results for insert
  with check (public.is_self(client_id) and self_reported);

-- ...and delete their own self-reported rows (a mistyped score), but never a coach's.
drop policy if exists "member deletes own self-reported big_dog_results" on public.big_dog_results;
create policy "member deletes own self-reported big_dog_results"
  on public.big_dog_results for delete
  using (public.is_self(client_id) and self_reported);
