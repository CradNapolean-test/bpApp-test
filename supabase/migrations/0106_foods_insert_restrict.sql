-- Found while building the mobile food diary (see docs/SECURITY_DEFINER_AUDIT.md, finding on the foods table).
--
-- 0004 let ANY authenticated member insert ANY row into the shared foods table ("with check (true)") so a barcode
-- scan could cache a product. The result: a member can add a fake "Chicken Breast" with made-up macros that every
-- other member and coach then sees in search (scanned items rank above the original seed).
--
-- The only legitimate writer is the barcode cache, which always inserts a barcoded, per-gram, source = 'scan' row
-- with plausible macros. Restrict inserts to exactly that. This stops fake generic foods and absurd values.
--
-- NOT fixed here: a member can still pre-register a WRONG product under a real barcode nobody has scanned yet (the
-- first insert for a barcode wins). Closing that needs the Open Food Facts lookup to run server-side (an Edge Function
-- inserting with the service role), which is a larger change.

drop policy if exists "authenticated users add foods" on public.foods;

create policy "authenticated users cache scanned foods"
  on public.foods for insert
  to authenticated
  with check (
    source = 'scan'
    and barcode is not null
    and barcode ~ '^[0-9]{6,14}$'
    and portion = '1 gram'
    and char_length(name) between 1 and 200
    and protein between 0 and 1
    and carbs between 0 and 1
    and fat between 0 and 1
    and coalesce(fibre, 0) between 0 and 1
    and protein + carbs + fat <= 1.05
    and coalesce(hidden, false) = false
  );
