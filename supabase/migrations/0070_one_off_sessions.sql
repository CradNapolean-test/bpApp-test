-- One-off sessions: a class row with specific_date set happens on that date only (day_of_week is
-- kept as that date's weekday so check-in matching still works). Rows with specific_date null are
-- the usual weekly recurring slots. Booking/cancel functions key on (class_id, booking_date), so
-- they need no change.

alter table public.classes add column if not exists specific_date date;

create index if not exists classes_specific_date_idx on public.classes (gym_id, specific_date)
  where specific_date is not null;
