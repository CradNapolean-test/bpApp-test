-- Phase 5: Barcode scanning — lets a client's own session cache a newly-scanned product
-- into the shared foods table (Open Food Facts lookups happen client-side; the result is
-- upserted so the next scan/search of the same barcode is instant). Existing rows are never
-- overwritten by this policy — lib/data/foods.ts's upsertFoodFromBarcode does
-- ON CONFLICT (barcode) DO NOTHING, so this only ever inserts brand-new barcodes.
create policy "authenticated users add foods"
  on foods for insert
  to authenticated
  with check (true);
