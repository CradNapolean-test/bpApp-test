-- Brief 07 (R16, R22): two small columns.
--
-- gyms.referral_url (R16, DECISION D7): the page a member shares to refer a friend. The Refer a Friend screen had the Salford Quays site
-- hard-coded for every member, so Worsley members shared the wrong gym and no referral could be credited. The screen now reads the
-- member's own gym and is hidden while this is empty. Members can read it (every signed-in user can read gyms, 0052); only a gym admin
-- can set it, through the settings field brief 08 adds. Until then the owner sets it in SQL:
--   update public.gyms set referral_url = 'https://example.com/refer' where id = '<gym id>';
--
-- client_profiles.consented_at (R22): when the member agreed to the privacy policy and terms during onboarding. Onboarding collected
-- health notes and an emergency contact with no consent step. It is written by the member's own onboarding save, so it is member-writable;
-- the column-level trigger from brief 01 (M10) should let a member set it but never clear it, like onboarding_completed_at.
--
-- PRE-FLIGHT: none (two new nullable columns; nothing existing is changed).
-- ROLLBACK:
--   alter table public.gyms drop column referral_url;
--   alter table public.client_profiles drop column consented_at;

alter table public.gyms add column if not exists referral_url text;

alter table public.gyms drop constraint if exists gyms_referral_url_https;
alter table public.gyms
  add constraint gyms_referral_url_https
  check (referral_url is null or (referral_url ~* '^https://' and char_length(referral_url) <= 500));

alter table public.client_profiles add column if not exists consented_at timestamptz;
