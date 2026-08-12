-- Bug fix: 0035 defined select/insert/delete policies on food_photo_entries but forgot
-- update -- RLS default-denies any command with no matching policy, so
-- updateFoodPhotoMacros's UPDATE silently matched zero rows (no error, since a plain
-- .update() call doesn't report affected-row count), and a client's manual macro entry for
-- an unestimated photo never actually saved. Confirmed live: saved values reverted to
-- "No estimate" on reload. Same is_self-via-daily_logs join as the insert/delete policies.
create policy "client updates own food_photo_entries"
  on food_photo_entries for update
  using (
    exists (
      select 1 from daily_logs
      where daily_logs.id = food_photo_entries.daily_log_id
      and is_self(daily_logs.client_id)
    )
  );
