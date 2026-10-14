-- READ-ONLY pre-flight for migrations 0108-0114.
-- Counts existing rows/files that already break the new limits. Changes nothing: only SELECTs.
-- Run in the Supabase SQL editor (or psql) against the database you plan to migrate.
-- Any count above 0 means that row would be refused the next time someone saves it.

select 'chat_messages.text > 4000 chars' as check_name, count(*) as bad_rows
from public.chat_messages where char_length(text) > 4000
union all
select 'measurement_logs cm outside 10-300', count(*) from public.measurement_logs
where arm not between 10 and 300 or chest not between 10 and 300 or waist not between 10 and 300
   or hips not between 10 and 300 or quad not between 10 and 300
union all
select 'body_scans value outside range', count(*) from public.body_scans
where weight_kg not between 20 and 400 or skeletal_muscle_kg not between 5 and 100
   or body_fat_pct not between 2 and 70 or body_fat_kg not between 1 and 250
   or visceral_fat_level not between 1 and 30 or bmr_kcal not between 500 and 5000
   or inbody_score not between 20 and 100
union all
select 'body_scans.notes > 1000 chars', count(*) from public.body_scans where char_length(notes) > 1000
union all
select 'daily_logs sleep/steps/water/bodyweight out of range', count(*) from public.daily_logs
where sleep not between 0 and 24 or steps not between 0 and 100000
   or water not between 0 and 15 or bodyweight not between 20 and 400
union all
select 'daily_logs.notes > 1000 chars', count(*) from public.daily_logs where char_length(notes) > 1000
union all
select 'client_profiles text too long', count(*) from public.client_profiles
where char_length(name) > 100 or char_length(phone) > 30 or char_length(address) > 300
   or char_length(emergency_contact_name) > 100 or char_length(emergency_contact_phone) > 30
   or char_length(goal_description) > 5000 or char_length(experience) > 2000
   or char_length(health_notes) > 2000
union all
select 'client_profiles height outside 100-250', count(*) from public.client_profiles
where height_cm not between 100 and 250
union all
select 'member_feedback.comment > 1000 chars', count(*) from public.member_feedback where char_length(comment) > 1000
union all
select 'recipes name > 100 or servings outside 1-100', count(*) from public.recipes
where char_length(name) > 100 or servings not between 1 and 100
union all
select 'recipe_ingredients portions outside (0, 10000]', count(*) from public.recipe_ingredients
where not (portions > 0 and portions <= 10000)
union all
select 'meal_plan_entries portions outside (0, 10000]', count(*) from public.meal_plan_entries
where not (portions > 0 and portions <= 10000)
union all
select 'big_dog_results text/value/key out of range', count(*) from public.big_dog_results
where char_length(result_text) > 40 or result_value not between 0 and 100000 or char_length(exercise_key) > 40
union all
select 'food_photo_entries description/estimates out of range', count(*) from public.food_photo_entries
where char_length(description) > 500 or estimated_calories not between 0 and 100000
   or estimated_protein not between 0 and 10000 or estimated_carbs not between 0 and 10000
   or estimated_fat not between 0 and 10000
union all
select 'food_photo_entries file not in owner folder', count(*)
from public.food_photo_entries f join public.daily_logs d on d.id = f.daily_log_id
where split_part(f.storage_path, '/', 1) is distinct from d.client_id::text
union all
select 'food_photo_entries: days with more than 40', count(*) from (
  select daily_log_id from public.food_photo_entries group by 1 having count(*) > 40) x
union all
select 'manual_macro_entries out of range', count(*) from public.manual_macro_entries
where calories not between 0 and 100000 or protein not between 0 and 10000
   or carbs not between 0 and 10000 or fat not between 0 and 10000
union all
select 'manual_macro_entries: days with more than 100', count(*) from (
  select daily_log_id from public.manual_macro_entries group by 1 having count(*) > 100) x
union all
select 'manual_macro_entries under another member''s meal section', count(*)
from public.manual_macro_entries e
join public.daily_logs d on d.id = e.daily_log_id
join public.meal_sections s on s.id = e.meal_section_id
where s.client_id <> d.client_id
union all
select 'food_diary_entries under another member''s meal section', count(*)
from public.food_diary_entries e
join public.daily_logs d on d.id = e.daily_log_id
join public.meal_sections s on s.id = e.meal_section_id
where s.client_id <> d.client_id
union all
select 'foods inserted by scan with name > 200 chars', count(*) from public.foods
where source = 'scan' and char_length(name) > 200
order by bad_rows desc, check_name;

-- Files already stored in the buckets whose size/type limits change. These stay readable;
-- the limits only apply to new uploads. Listed so you know what the new rules would have refused.
select bucket_id,
       count(*) filter (where (metadata->>'size')::bigint > case bucket_id
            when 'voice-notes' then 20971520 when 'inbody-scans' then 12582912 else 10485760 end) as too_big,
       count(*) filter (where metadata->>'mimetype' is null
            or metadata->>'mimetype' not in (
              'image/jpeg','image/png','image/webp','image/heic','image/heif','image/gif',
              'audio/webm','audio/mp4','audio/x-m4a','audio/aac','audio/mpeg','audio/ogg','audio/wav','audio/x-wav',
              'application/pdf')) as odd_type,
       count(*) as total
from storage.objects
where bucket_id in ('chat-photos','voice-notes','progress-photos','inbody-scans','food-photos')
group by bucket_id
order by bucket_id;
