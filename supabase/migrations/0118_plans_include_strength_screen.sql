-- The new Strength screen (load volume and lift progression) sits under Progress. A plan that lists its
-- screens explicitly would hide it, so add it to every plan that already includes the Overview screen.
-- Plans that allow every screen (included_screens is null) already get it.

update membership_packages
set included_screens = included_screens || array['Strength']
where included_screens is not null
  and 'Overview' = any(included_screens)
  and not ('Strength' = any(included_screens));
