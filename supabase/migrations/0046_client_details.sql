-- Comprehensive client details: contact/personal fields the client fills in about themselves
-- (same visibility/RLS shape as every other Setup field), plus coach-only admin fields for
-- business record-keeping. Split by who edits what, same pattern already established by
-- checkin_reminder_days (coach-only) vs. name/gender/age (client-owned) on this same table.

-- ============ Client-editable contact/personal fields ============
-- Deliberately not touching the existing `age` column -- it feeds lib/calculations.ts's BMR
-- formula directly, which CLAUDE.md calls out as already-validated and not to be re-derived.
-- date_of_birth is a separate, purely-administrative field.
alter table client_profiles
  add column phone text,
  add column emergency_contact_name text,
  add column emergency_contact_phone text,
  add column address text,
  add column date_of_birth date;

-- No RLS change needed -- covered by the existing "client updates own client_profiles" policy.

-- ============ Coach-only admin fields ============
-- Structured (not freeform client_journal_entries) since join date/referral source are
-- single values a coach would want to sort/filter the roster by, not a repeatable list.
alter table client_profiles
  add column join_date date,
  add column referral_source text,
  add column admin_notes text;

-- client_profiles' existing update policy is is_self(client_id) with no column-level split,
-- so without this, a client could edit these coach-only fields through their own Setup save.
-- Narrow security-definer RPC, same pattern as set_checkin_reminder_days (0011) and
-- set_nutrition_tracking_mode (0034).
create or replace function public.set_client_admin_details(
  p_client_id uuid,
  p_join_date date,
  p_referral_source text,
  p_admin_notes text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_coach_of(p_client_id) then
    raise exception 'Not authorized';
  end if;
  update client_profiles
  set join_date = p_join_date,
      referral_source = nullif(trim(p_referral_source), ''),
      admin_notes = nullif(trim(p_admin_notes), '')
  where client_id = p_client_id;
end;
$$;

grant execute on function public.set_client_admin_details(uuid, date, text, text) to authenticated;
