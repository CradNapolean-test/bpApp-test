-- Owners: hide the daily check-in (Weekly Log) from members on ongoing (full-time) plans. It stays for
-- challenge plans, which have a set length. Done as data so it is visible and editable in the plan
-- editor (Classes > Packages > "Screens this tier can access"); a plan can tick it back on any time.
--
-- Only plans that currently allow every screen (included_screens is null) and have no set length are
-- touched; a plan someone has already customised is left alone. Forms stays on so assigned forms
-- (onboarding, check-in questionnaires) can still be completed.

update membership_packages
set included_screens = array[
  'Food Tracking', 'Meal Planner', 'Recipes', 'Workout', 'Activity', 'Forms',
  'Education', 'Insights', 'Overview', 'Progress & Photos', 'Body Scans'
]
where duration_weeks is null
  and included_screens is null;
