-- Progress limits, enforced by the database rather than only by the apps.
--
-- Found while building the member Progress screens (slice 6; see docs/SECURITY_DEFINER_AUDIT.md). Row Level Security
-- already keeps a member inside their own photos, measurements and scans (progress-isolation-check.cjs), but nothing
-- bounded what they could put there: measurement and scan columns were unbounded numbers (a waist of 5000 cm, a body
-- fat of 150%, a negative arm), scan notes had no length limit, and the progress-photos / inbody-scans buckets accepted
-- any file of any type up to the project-wide cap (an HTML file in a bucket a coach later opens by link). The mobile app
-- and the web validate these already; this makes the database say the same thing.
--
-- Every range here matches the one the app uses, so nothing the apps accept is refused. The CHECKs are NOT VALID so rows
-- already stored (on a database that has been in use) are not examined or rejected by this migration; every new or edited
-- row is. Run `alter table ... validate constraint ...` later if wanted.

-- Body measurements, in cm: 10 to 300 (the app's own limits). NULL means not measured.
alter table public.measurement_logs drop constraint if exists measurement_logs_cm_range;
alter table public.measurement_logs
  add constraint measurement_logs_cm_range check (
    (arm   is null or arm   between 10 and 300) and
    (chest is null or chest between 10 and 300) and
    (waist is null or waist between 10 and 300) and
    (hips  is null or hips  between 10 and 300) and
    (quad  is null or quad  between 10 and 300)
  ) not valid;

-- InBody scans: the same ranges as the app, and a note of at most 1000 characters.
alter table public.body_scans drop constraint if exists body_scans_value_ranges;
alter table public.body_scans
  add constraint body_scans_value_ranges check (
    (weight_kg          is null or weight_kg          between 20 and 400) and
    (skeletal_muscle_kg is null or skeletal_muscle_kg between 5  and 100) and
    (body_fat_pct       is null or body_fat_pct       between 2  and 70)  and
    (body_fat_kg        is null or body_fat_kg        between 1  and 250) and
    (visceral_fat_level is null or visceral_fat_level between 1  and 30)  and
    (bmr_kcal           is null or bmr_kcal           between 500 and 5000) and
    (inbody_score       is null or inbody_score       between 20 and 100)
  ) not valid;

alter table public.body_scans drop constraint if exists body_scans_notes_length;
alter table public.body_scans
  add constraint body_scans_notes_length check (notes is null or char_length(notes) <= 1000) not valid;

-- Files: size and type, per bucket. Progress photos are shrunk JPEGs (a few hundred KB); the web keeps the original if a
-- photo cannot be decoded, hence the other image types. A scan printout can also be a PDF (the web uploads those, up to 12 MB).
update storage.buckets
set file_size_limit = 10 * 1024 * 1024,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'image/gif']
where id = 'progress-photos';

update storage.buckets
set file_size_limit = 12 * 1024 * 1024,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'image/gif', 'application/pdf']
where id = 'inbody-scans';
