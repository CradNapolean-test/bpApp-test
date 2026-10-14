-- Nutrition goal (fat loss / muscle gain) and setting (steady / moderate / aggressive) replace the
-- 1/2/3 tier in the calorie engine. The setting sets the rate of bodyweight change, which sets the
-- daily calories. The old tier column is kept (nothing reads it any more) so existing rows and
-- scripts are untouched; existing clients are mapped 1 -> steady, 2 -> moderate, 3 -> aggressive.
alter table public.client_profiles
  add column if not exists nutrition_goal text not null default 'fat_loss'
    check (nutrition_goal in ('fat_loss', 'muscle_gain')),
  add column if not exists nutrition_setting text not null default 'steady'
    check (nutrition_setting in ('steady', 'moderate', 'aggressive'));

update public.client_profiles
set nutrition_setting = case tier when 2 then 'moderate' when 3 then 'aggressive' else 'steady' end;

comment on column public.client_profiles.tier is 'Deprecated: replaced by nutrition_setting. Not read by the app.';
