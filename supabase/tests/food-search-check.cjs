// Checks the live food search order after migration 0154 (everyday foods first). READ-ONLY: it only calls search_foods and
// counts rows, so it is safe on the real project.
//   node supabase/tests/food-search-check.cjs
// Exit code 1 if any search puts the wrong food first.
const path = require('path');
const root = path.resolve(__dirname, '../..');
require(root + '/node_modules/dotenv').config({ path: root + '/.env.local', quiet: true });
const { createClient } = require(root + '/node_modules/@supabase/supabase-js');

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

// [search, what the first result must be (exact name, or a pattern), words that must NOT be in the top five]
const cases = [
  ['rice', 'Rice, white, long grain, boiled in unsalted water', /\b(red|wild|pudding)\b/i],
  ['egg', 'Eggs, chicken, whole, raw', /\b(duck|quail|yolk|noodles)\b/i],
  ['eggs', 'Eggs, chicken, whole, raw', /\b(duck|quail|yolk)\b/i],
  ['milk', 'Milk, semi-skimmed, pasteurised, average', /\b(sheeps|human|condensed|without milk)\b/i],
  ['mince', /mince/i, /\bpies?\b/i],
  ['pasta', 'Pasta, white, dried, boiled in unsalted water', null],
  ['potato', 'Potatoes, old, boiled in unsalted water, flesh only', /\blard\b/i],
  ['salmon', 'Salmon, farmed, flesh only, raw', /\bwild\b/i],
  ['oats', 'Porridge oats, unfortified', /\bbiscuits?\b/i],
  ['banana', /^Medium Banana/, /\bsplit\b/i],
  ['chicken', 'Chicken, breast, grilled without skin, meat only', /^Eggs/],
  ['chicken breast', 'Chicken Breast', /\bcoated\b/i],
  // the unusual food is still first when it is asked for
  ['duck egg', 'Eggs, duck, whole, raw', null],
  ['mince pie', /mince pie/i, null],
  ['egg noodles', /^Noodles, egg/, null],
];

(async () => {
  const failures = [];
  for (const [query, first, banned] of cases) {
    const { data, error } = await db.rpc('search_foods', { p_query: query, p_limit: 5 });
    if (error) {
      failures.push(`"${query}": ${error.message}`);
      continue;
    }
    const names = (data ?? []).map((f) => f.name.trim());
    const okFirst = typeof first === 'string' ? names[0] === first : first.test(names[0] ?? '');
    const bad = banned ? names.filter((n) => banned.test(n)) : [];
    if (!okFirst) failures.push(`"${query}": first is "${names[0]}", expected ${first}`);
    else if (bad.length) failures.push(`"${query}": top five has ${bad.map((n) => `"${n}"`).join(', ')}`);
    else console.log(`  ok: "${query}" -> ${names[0]}`);
  }

  // A search with symbols in it must not error (0076 put the typed text into a pattern as typed).
  const { error: symbols } = await db.rpc('search_foods', { p_query: 'chicken (grilled', p_limit: 5 });
  if (symbols) failures.push(`a search with a bracket errors: ${symbols.message}`);
  else console.log('  ok: a search with a bracket works');

  const { count } = await db.from('foods').select('id', { count: 'exact', head: true }).not('everyday_rank', 'is', null);
  if (count !== 88) failures.push(`expected 88 everyday foods, found ${count}`);
  else console.log('  ok: 88 everyday foods marked');

  if (failures.length) {
    console.error('\nFAILED:\n  ' + failures.join('\n  '));
    process.exit(1);
  }
  console.log('\nAll food search checks passed.');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
