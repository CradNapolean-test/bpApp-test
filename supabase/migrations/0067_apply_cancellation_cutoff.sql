-- Apply the 3-hour cancellation cutoff to every existing class (and so every existing booking,
-- since the refund deadline is derived from the class at cancel time). Classes created before
-- 0064 kept the old 12-hour default; only those still on 12 are changed, so a class whose
-- cutoff was set to something else on purpose is left alone.
update classes set cutoff_hours = 3 where cutoff_hours = 12;
