-- New accounts default to the dark theme, matching the Ballistic Performance app design.
-- Existing accounts keep whatever they have (a stored 'system' can't be told apart from a
-- deliberate choice), and anyone can still switch in Account settings.
alter table profiles alter column theme_preference set default 'dark';
