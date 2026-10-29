// A scan should be a plain product number, but some packs carry a retailer label with the number buried in text
// (e.g. "COLA5000129396980V1"). Take the product number out of it: the longest run of 8-14 digits.
// (Same rule as the web FoodEntryTools; shared so web and mobile cannot drift.)
export function extractBarcode(raw: string): string {
  const trimmed = raw.trim();
  if (/^\d{6,14}$/.test(trimmed)) return trimmed;
  const runs = trimmed.match(/\d{8,14}/g);
  if (!runs) return trimmed;
  return runs.sort((a, b) => b.length - a.length)[0];
}

// The same product can be written several ways: a phone scan of a UPC-A gives 12 digits, an EAN-13 gives 13 (often
// with leading zeros), an EAN-8 gives 8, and Open Food Facts pads some codes with zeros. Compare on the digits
// only, trying the usual padded lengths, so a scan matches however the food was stored.
export function barcodeVariants(barcode: string): string[] {
  const digits = barcode.replace(/\D/g, '');
  const stripped = digits.replace(/^0+/, '') || digits;
  const variants = new Set<string>([barcode, digits, stripped]);
  for (const len of [8, 12, 13, 14]) {
    if (stripped.length <= len) variants.add(stripped.padStart(len, '0'));
  }
  return [...variants];
}
