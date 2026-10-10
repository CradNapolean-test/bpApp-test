-- Adds the 'owner' account type (the business owner, who sits above the gyms and is not a coach).
-- Run this on its own, then run 0103. Postgres will not let a new enum value be used in the same
-- transaction that adds it, so the owner tables, functions and policies are in 0103.

alter type user_role add value if not exists 'owner';
