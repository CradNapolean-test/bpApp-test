# Barcode / Food Database Research

Research only — nothing in this document has been implemented. Saved for reference when/if
the barcode data question gets prioritized.

**Correction:** the first pass of this research wrongly assumed an NZ/AU-based user (inferred
from an email address and a project doc mentioning "UK/NZ" together — a bad inference, not
something the user actually said). The user is UK-based. This version is corrected
throughout — the practical conclusion changes substantially: UK coverage on Open Food Facts
is already strong, so the "regional gap" concern that drove the original recommendations
largely doesn't apply.

## Current state (for context)

- `foods` table: shared global table (`id, name, portion, protein, carbs, fat, barcode`
  nullable+unique), seeded with ~484 curated real-world items, no barcodes in the seed data.
- `lib/openFoodFacts.ts`: client-side camera scan → GET
  `https://world.openfoodfacts.org/api/v0/product/{barcode}.json` (free, no key) → on a hit,
  caches into `foods` via insert-on-conflict-do-nothing (`upsertFoodFromBarcode` in
  `lib/data/foods.ts`, never overwrites an existing cached/seeded row) → falls back to manual
  text search if no match. No bulk sync, no secondary provider, no periodic refresh.

---

## 1. Open Food Facts (current provider) — UK coverage is genuinely strong

Live product counts (August 2026): **United Kingdom ~177,984**, alongside France
(~1,210,547), Germany (~389,228), and the US (~861,533) as Open Food Facts' top-contributing
markets — the UK is one of OFF's best-covered countries, not a weak spot. This is the
opposite framing from the original (wrong) NZ-focused pass of this research, where NZ has
historically had only single-digit active contributors.

**Practical implication:** for a UK-based coach, the barcode data source (OFF) is already
solid for the bulk of everyday UK supermarket products. The known OFF weak spots — small
independent/local brands, homemade items, very recently launched products not yet scanned by
anyone — are edge cases, not a systemic regional gap the way NZ/AU would be.

**Crowd-contribution**: no mechanism to *request* a missing product — passive model only
(users scan/photograph products they personally buy via the OFF app/website). Encouraging
users to contribute directly to OFF on a scan-miss helps the whole ecosystem, but there's no
API call that triggers curation.

**Bulk data**: OFF publishes full nightly-refreshed exports — a MongoDB dump, a
gzip-compressed JSONL export (one product per line), and CSV. Given UK coverage is already
strong, a bulk pre-seed is much lower priority than it would be for a genuinely
under-covered market — worth doing only if a specific pattern of misses shows up in practice
(e.g. own-brand products from a specific UK supermarket chain), not as a general fix.

**Rate limits**: 100 req/min (product GETs), 10 req/min (search), 2 req/min (facet queries);
exceeding risks a 503 or IP ban. Requires a custom `User-Agent` header. Generous for our
per-scan live-lookup volume — unlikely to be hit. (Note: OFF's own site returned 503s
repeatedly during this research session under normal browsing load — worth being aware
occasional service unavailability happens, independent of our own request volume.)

**License**: ODbL (Open Database License) — commercial use explicitly allowed, but carries
**share-alike**: a *derivative database* built from OFF data must also be open. Caching
individual barcode lookups into a private table for the app's own use (what we already do)
is standard practice, but worth flagging as a real term being implicitly agreed to, not
"free with no strings."

## 2. Barcode format (EAN-13 vs UPC-A) — not an issue

Confirmed by reading `BarcodeScanner.tsx`: it calls `react-zxing` with no format restriction,
so the underlying ZXing decoder tries all standard 1D formats by default (EAN-13, EAN-8,
UPC-A, UPC-E, etc.). EAN-13 — the standard format used across the UK and EU (as opposed to
UPC-A, used in the US/Canada) — is already fully supported with zero code change.

## 3. Alternative/supplementary barcode APIs

| API | Resolves barcodes? | Coverage note | Free tier | Paid pricing | Commercial license |
|---|---|---|---|---|---|
| **Nutritionix** | Yes, dedicated UPC endpoint, ~600k+ UPCs, ~92% match rate (US-centric) | Strong US/chain-restaurant; weaker for UK-specific brands | Small free dev tier | ~$1,850/mo | Permitted on paid plans |
| **FatSecret Platform** | Yes, vendor claims &gt;90% global barcode coverage | "Premier Free" gives full non-US access with attribution required — includes UK | Free "Premier Free" (rate-limited, attribution) | "Premier" removes attribution, price on request | Free tier commercially usable with attribution |
| **Edamam Food DB** | Yes, 700k+ UPC/EAN/ITF codes | Global but US-weighted | Free tier exists | ~$19/mo → ~$999/mo | Commercial allowed per tier |
| **USDA FoodData Central** | Partial — GTIN/UPC is a searchable field, not a dedicated endpoint; branded-foods only | US-only — not relevant for a UK user | Free (data.gov key) | N/A | Public domain |
| **UPCitemdb** | Yes, general UPC/EAN (495M+ products) but **not nutrition-focused** — retail metadata (name/image/price) | Global retail catalog, not diet data | 100 req/day free | $29–$149/mo | Commercial allowed |
| **Spoonacular** | Yes, UPC endpoint | US grocery-focused | Free quota | Up to $149/mo | Commercial allowed |

Given UK coverage on OFF is already strong, none of these look necessary as a primary
replacement. FatSecret's free tier (has UK coverage, no cost) is the only one worth
considering even as a fallback, and only if real scan-miss patterns emerge in practice.

## 4. UK-specific official food composition database

- **McCance and Widdowson's Composition of Foods Integrated Dataset (CoFID)** — the UK
  government's official food composition database (replaces the print "McCance &
  Widdowson's"), free, published by Public Health England/OHID. Like NZ's FOODfiles and
  Australia's AUSNUT, this is a *generic* food composition table (e.g. "chicken breast,
  meat, raw"), not barcode-searchable — useful only as a manual nutrient-accuracy reference,
  not a scan-fallback. Worth noting for completeness, not a barcode solution.

## 5. Architecture patterns for "staying up to date"

Live-lookup-with-local-cache (our current model) is the standard lightweight pattern for
small/medium apps, and is explicitly what OFF's own docs recommend (cache by barcode since
data "changes slowly"). Apps with heavier backing (MyFitnessPal, Cronometer, Yuka) typically
layer multiple providers with fallback chains and/or periodically bulk-resync a local mirror
— mitigating occasional crowd-accuracy issues and service downtime rather than a coverage
gap, in the UK's case. Documented OFF weaknesses: limited verification of crowd entries,
occasional 503s under load (observed directly during this research) — mitigated in practice
by treating OFF as one input, sanity-checking results, and falling back to manual entry
(which we already do) rather than trusting a single miss as final.

---

## Recommendation options (ranked, corrected for UK)

1. **Do nothing differently for now.** UK is already one of OFF's best-covered markets —
   there's no clear regional gap to fix. Keep the current live-lookup-with-cache model as-is.
2. **If real scan-miss patterns show up in practice** (e.g. a specific UK supermarket's
   own-brand range, or genuinely homemade/local items), consider a small, *targeted* bulk
   pre-seed from OFF's UK-filtered export rather than a broad one — cheap, and only worth
   doing once there's evidence of an actual gap rather than a hypothetical one.
3. **FatSecret's free "Premier Free" tier as a fallback for OFF misses** — free, commercially
   usable, includes UK coverage — worth trying only if pattern #2 above turns out to be a
   real recurring issue, not proactively.
4. **Not recommended:** CoFID integration for barcode purposes — no barcode field, so it'd
   only help as a manual "generic food" nutrient reference, not a scan-fallback. Paid US-
   centric APIs (Nutritionix, USDA FDC) — not relevant for a UK user base.

## Sources

- [Open Food Facts API documentation](https://openfoodfacts.github.io/openfoodfacts-server/api/)
- [Open Food Facts — Data, API and SDKs](https://world.openfoodfacts.org/data)
- [Open Food Facts — Terms of use, contribution and re-use](https://world.openfoodfacts.org/terms-of-use)
- [Conditions to use the Open Food Facts API (forum)](https://forum.openfoodfacts.org/t/conditions-to-use-the-open-food-facts-api/443)
- [Define a rate-limit policy — GitHub issue](https://github.com/openfoodfacts/openfoodfacts-server/issues/8818)
- [Open Food Facts — country pages listing](https://world.openfoodfacts.org/countries)
- [Open Food Facts — France](https://world.openfoodfacts.org/country/en:france)
- [Open Nutrition Datasets Compared (Nutrola blog)](https://nutrola.app/en/blog/open-nutrition-datasets-compared-usda-openfoodfacts-nutrola)
- [Open food data on the European Data Portal](https://data.europa.eu/en/publications/datastories/open-food-data-european-data-portal)
- [Open Food Hunt rankings (contributors by country)](https://world.openfoodfacts.org/facets/points)
- [Nutritionix API](https://www.nutritionix.com/api)
- [Nutritionix — Database Licensing](https://www.nutritionix.com/database)
- [FatSecret Platform API](https://platform.fatsecret.com/platform-api)
- [FatSecret — Upgrade Your Account](https://platform.fatsecret.com/upgrade-account)
- [Edamam Food and Grocery Database API](https://developer.edamam.com/food-database-api)
- [FoodData Central API Guide (USDA)](https://fdc.nal.usda.gov/api-guide.html)
- [UPCitemdb API](https://www.upcitemdb.com/api)
- [9 UPC Lookup APIs comparison (Geekflare)](https://geekflare.com/dev/upc-lookup-apis/)
- [Spoonacular Food API](https://spoonacular.com/food-api)
- [Open Food Facts — Wikipedia](https://en.wikipedia.org/wiki/Open_Food_Facts)
