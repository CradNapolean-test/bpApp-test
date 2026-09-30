-- Members can already insert and update their own workout_logs; deleting was never allowed, so a
-- mistyped set could not be removed. Own rows only.

create policy "client deletes own workout_logs"
  on public.workout_logs for delete
  using (public.is_self(client_id));
