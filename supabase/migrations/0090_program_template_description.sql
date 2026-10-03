-- A short description on programme templates ("4 weeks, 3 days a week, fat loss") so a library of
-- templates is easy to tell apart.
alter table program_templates add column if not exists description text;
