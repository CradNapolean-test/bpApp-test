-- Challenge check-in prompts on the coach dashboard: during week 3 and the final week of a fixed-length plan (the
-- 6 week challenge) the member's coach is asked to check in with them. Marking it done reuses coach_reviews with
-- two new kinds; ref is the membership id, so each challenge run is prompted once.

alter table public.coach_reviews drop constraint if exists coach_reviews_kind_check;
alter table public.coach_reviews
  add constraint coach_reviews_kind_check
  check (kind in ('week', 'diary_day', 'form', 'challenge_week3', 'challenge_final'));
