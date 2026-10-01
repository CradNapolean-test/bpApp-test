-- Onboarding for new members: a shareable coach sign-up link, the extra answers the onboarding
-- flow collects, and a "needs coach review" flag so a coach checks the automatically-calculated
-- plan of every new member.

-- One reusable sign-up link per coach (e.g. emailed by Ontraport after someone buys). The token is
-- the secret; the coach can switch the link off. Anyone arriving via a valid token can create their
-- own login, which is attached to that coach and their gym -- nothing else (no membership/credits).
create table if not exists public.onboarding_links (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null unique references public.profiles(id) on delete cascade,
  token text not null unique,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.onboarding_links enable row level security;

drop policy if exists "coach reads own onboarding link" on public.onboarding_links;
create policy "coach reads own onboarding link"
  on public.onboarding_links for select using (coach_id = auth.uid());

drop policy if exists "coach creates own onboarding link" on public.onboarding_links;
create policy "coach creates own onboarding link"
  on public.onboarding_links for insert with check (coach_id = auth.uid());

drop policy if exists "coach updates own onboarding link" on public.onboarding_links;
create policy "coach updates own onboarding link"
  on public.onboarding_links for update using (coach_id = auth.uid());

-- What onboarding collects beyond the existing profile fields.
alter table public.client_profiles
  add column if not exists height_cm numeric,
  add column if not exists body_fat_estimated boolean not null default false,
  add column if not exists health_notes text,
  add column if not exists onboarding_completed_at timestamptz,
  add column if not exists needs_coach_review boolean not null default false,
  add column if not exists review_reasons text[] not null default '{}';

-- Everyone who is already a member skips onboarding.
update public.client_profiles set onboarding_completed_at = now() where onboarding_completed_at is null;
