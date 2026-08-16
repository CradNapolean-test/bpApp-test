-- Membership tiers unlocking different areas: a package can now optionally restrict which
-- screens a client on it can see, layered under (never above) their existing per-client
-- disabled_screens toggles -- the tier sets a ceiling, the per-client list can only restrict
-- further within it. Enforced live off the client's *current* membership on every load (see
-- categories.ts's toEffectiveDisabledScreenSet), not synced/copied at assignment time, so
-- editing a package's included_screens or reassigning a client takes effect immediately.
--
-- null (the default, and every existing package's value) means "no tier restriction" --
-- every DISABLEABLE_SCREENS entry stays available, identical to today's behavior.

alter table membership_packages add column if not exists included_screens text[];
