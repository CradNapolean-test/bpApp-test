-- Optional demo link per exercise (YouTube/Vimeo/direct video/GIF URL) so clients can check
-- their form. Rides on the existing workout_exercises RLS policies -- no policy changes.

alter table workout_exercises add column video_url text;
