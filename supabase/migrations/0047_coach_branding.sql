-- Coach branding: logo upload. Public bucket (unlike progress-photos) -- a coach's logo is
-- shown to every one of their own clients in the app chrome, not sensitive the way a body
-- photo is, so a public URL is simpler than signed-URL plumbing for something meant to be
-- visible everywhere.
insert into storage.buckets (id, name, public)
values ('coach-branding', 'coach-branding', true)
on conflict (id) do nothing;

-- Objects uploaded at path "{coach_id}/{filename}" -- direct auth.uid() comparison (not the
-- is_self/is_coach_of helpers, which are about a *client* relationship) since this is just
-- "does this coach own this folder".
create policy "coach uploads own logo"
  on storage.objects for insert
  with check (
    bucket_id = 'coach-branding'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "coach replaces own logo"
  on storage.objects for update
  using (
    bucket_id = 'coach-branding'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "coach deletes own logo"
  on storage.objects for delete
  using (
    bucket_id = 'coach-branding'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
-- No select policy needed -- the bucket is public, so getPublicUrl() works for any viewer
-- (client or coach) without an RLS check.

-- profiles has no general update policy (deliberately -- it also holds role/coach_id), so
-- this needs its own narrow security-definer RPC, same pattern as set_display_name (0042).
alter table profiles add column logo_path text;

create or replace function public.set_logo_path(p_path text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update profiles set logo_path = p_path where id = auth.uid();
end;
$$;

grant execute on function public.set_logo_path(text) to authenticated;
