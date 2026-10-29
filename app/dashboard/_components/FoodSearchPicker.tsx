'use client';

import { useEffect, useRef, useState } from 'react';
import { Star } from 'lucide-react';
import { Button } from '@/app/_components/Button';
import { EmptyState } from '@/app/_components/EmptyState';
import { searchFoods } from '@/lib/data/foods';
import { createClient } from '@/lib/supabase/client';
import { dayCalories } from '@/lib/calculations';
import { FOOD_LIMITS, checkFoodNumber, firstFoodProblem } from '@/lib/foodLimits';
import type { PairSuggestion } from '@/lib/foodPairs';
import type { FoodRow, RecipeRow } from '@/lib/data/types';
import { MAX_UNIT_LABEL, countFromGrams, defaultUnit, gramsFromCount, parseUnitInput, startingAmount, unitText, unitsFor, type FoodUnit, type OwnUnitRow } from '@/lib/utils/foodUnits';

const UNIT_PRESETS = [0.5, 1, 2, 3];

// ml-sized units (under 5 g each) preset and step in bigger counts than a rasher or a slice.
const isSmallUnit = (u: FoodUnit) => u.grams < 5;
const UNIT_COUNT_PRESETS = [0.5, 1, 2, 3];
const SMALL_UNIT_PRESETS = [100, 200, 250, 330];

// Shared by the search-results list and the Favorites/Recently Logged lists shown before a
// query is typed -- same grams/units quantity picker either way, just a different source list.
function FoodResultRow({
  food,
  qty,
  onQtyChange,
  onAdd,
  isFavorite,
  onToggleFavorite,
  units = [],
  onSaveUnit,
  onDeleteUnit,
}: {
  food: FoodRow;
  qty: number;
  onQtyChange: (value: number) => void;
  onAdd: (food: FoodRow, qty: number) => void;
  isFavorite?: boolean;
  onToggleFavorite?: (food: FoodRow, isFavorite: boolean) => void;
  // Units for this food (built-in and the member's own), shown as buttons next to grams. What is added is always grams.
  units?: FoodUnit[];
  onSaveUnit?: (foodId: string, label: string, grams: number) => Promise<string | null>;
  onDeleteUnit?: (key: string) => void;
}) {
  // Most foods are stored per-1g (see docs/PROJECT_SPEC.md food data notes), so the quantity
  // field means grams and defaults to a plausible serving. A handful of foods without a known
  // gram weight (e.g. "1 Egg") keep their original per-unit values, so the field means a count
  // of that unit instead.
  const isPerGram = food.portion === '1 gram';
  // What the box shows while it is being typed in: lets it be emptied (counts as 0) and lets a
  // number starting with 1 be typed without jumping to a minimum. Reset to the real value on blur.
  const [draft, setDraft] = useState<string | null>(null);
  // Starts on the food's own serving when the amount is exactly one of it (not for a usual-amount suggestion, which is its own weight).
  const [unitKey, setUnitKey] = useState<string | null>(() => {
    const stated = defaultUnit(units);
    return stated && qty === stated.grams ? stated.key : null;
  });
  const [addingUnit, setAddingUnit] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [newGrams, setNewGrams] = useState('');
  const [unitError, setUnitError] = useState<string | null>(null);
  const unit = units.find((u) => u.key === unitKey) ?? null;

  // With a unit chosen the box counts that unit (2 rasher); qty stays grams for the caller.
  const small = unit ? isSmallUnit(unit) : false;
  const step = unit ? (small ? 10 : 0.5) : isPerGram ? 5 : 0.25;
  const shown = unit ? countFromGrams(qty, unit) : qty;
  const presets = unit ? (small ? SMALL_UNIT_PRESETS : UNIT_COUNT_PRESETS) : isPerGram ? [] : UNIT_PRESETS;
  const setShown = (value: number) => onQtyChange(unit ? gramsFromCount(Math.max(0, value), unit) : value);

  function chooseUnit(next: FoodUnit | null) {
    setUnitKey(next?.key ?? null);
    setDraft(null);
    // Choosing a unit starts at one of it (250 ml for a millilitre unit); going back to grams keeps the weight as it is.
    if (next) onQtyChange(gramsFromCount(isSmallUnit(next) ? 250 : 1, next));
  }

  async function saveNewUnit() {
    const parsed = parseUnitInput(newLabel, newGrams);
    if (!parsed.ok) return setUnitError(parsed.error);
    const failure = await onSaveUnit?.(food.id, parsed.label, parsed.grams);
    if (failure) return setUnitError(failure);
    setUnitError(null);
    setAddingUnit(false);
    setNewLabel('');
    setNewGrams('');
  }

  const protein = food.protein * qty;
  const carbs = food.carbs * qty;
  const fat = food.fat * qty;
  const calories = dayCalories(protein, carbs, fat);
  const maxQty = isPerGram ? FOOD_LIMITS.grams : FOOD_LIMITS.portions;
  const qtyProblem = qty > 0 ? checkFoodNumber(qty, isPerGram ? 'grams' : 'portions') : null;
  const chip = (active: boolean) =>
    `rounded-full border px-2 py-0.5 text-xs transition-colors ${
      active
        ? 'border-accent bg-accent-soft text-accent'
        : 'border-black/10 text-zinc-500 hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/5'
    }`;

  return (
    <li className="space-y-2 py-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5 text-sm">
          {onToggleFavorite && (
            <button
              type="button"
              onClick={() => onToggleFavorite(food, !isFavorite)}
              aria-label={isFavorite ? 'Remove favorite' : 'Add favorite'}
              className="shrink-0 text-zinc-400 hover:text-amber-500"
            >
              <Star className={`h-3.5 w-3.5 ${isFavorite ? 'fill-amber-400 text-amber-400' : ''}`} />
            </button>
          )}
          <div className="min-w-0">
            <p className="truncate font-medium text-black dark:text-zinc-50">{food.name}</p>
            <p className="text-xs text-zinc-500">
              {unit && !small
                ? `per ${unitText(unit)} · ${Math.round(dayCalories(food.protein * unit.grams, food.carbs * unit.grams, food.fat * unit.grams))} kcal`
                : isPerGram
                  ? `per 100 g · ${Math.round(dayCalories(food.protein * 100, food.carbs * 100, food.fat * 100))} kcal`
                  : `per ${food.portion}`}
            </p>
          </div>
        </div>
        <Button variant="primary" size="sm" disabled={!(qty > 0) || qtyProblem != null} onClick={() => onAdd(food, qty)}>
          Add
        </Button>
      </div>

      {isPerGram && onSaveUnit && (
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-xs text-zinc-500" htmlFor={`serving-${food.id}`}>
            Serving
          </label>
          <select
            id={`serving-${food.id}`}
            value={unitKey ?? ''}
            onChange={(e) => chooseUnit(units.find((u) => u.key === e.target.value) ?? null)}
            className="max-w-full rounded-md border border-black/10 bg-transparent px-2 py-1 text-sm dark:border-white/10"
          >
            <option value="">grams (g)</option>
            {units.map((u) => (
              <option key={u.key} value={u.key}>
                {unitText(u)}
              </option>
            ))}
          </select>
          {unit?.own && onDeleteUnit && (
            <button
              type="button"
              onClick={() => {
                onDeleteUnit(unit.key);
                setUnitKey(null);
              }}
              className="text-xs text-zinc-400 hover:text-danger"
            >
              Remove
            </button>
          )}
          <button type="button" onClick={() => setAddingUnit((v) => !v)} className="text-xs text-accent hover:underline">
            {addingUnit ? 'Cancel' : '+ Own serving'}
          </button>
        </div>
      )}

      {addingUnit && (
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <span className="text-zinc-500">1</span>
            <input
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder="rasher"
              maxLength={MAX_UNIT_LABEL}
              aria-label="Unit name"
              className="w-24 rounded-md border border-black/10 bg-transparent px-2 py-1 text-sm dark:border-white/10"
            />
            <span className="text-zinc-500">=</span>
            <input
              type="number"
              inputMode="decimal"
              min={0}
              value={newGrams}
              onChange={(e) => setNewGrams(e.target.value)}
              placeholder="25"
              aria-label="Grams in one"
              className="w-16 rounded-md border border-black/10 bg-transparent px-2 py-1 text-center text-sm dark:border-white/10"
            />
            <span className="text-zinc-500">g</span>
            <Button variant="outline" size="sm" onClick={saveNewUnit}>
              Save
            </Button>
          </div>
          {unitError && <p className="text-xs font-semibold text-danger">{unitError}</p>}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-1.5">
        {presets.map((p) => (
          <button
            key={p}
            onClick={() => {
              setDraft(null);
              setShown(p);
            }}
            className={chip(shown === p)}
          >
            {unit ? `${p} ${unit.label}` : isPerGram ? `${p}g` : `${p}×`}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-1.5">
        <Button variant="outline" size="sm" onClick={() => {
            setDraft(null);
            setShown(shown - step);
          }} aria-label="Decrease quantity" className="!p-0 flex h-8 w-8 items-center justify-center">
          −
        </Button>
        <input
          type="number"
          inputMode="decimal"
          min={0}
          max={unit ? undefined : maxQty}
          step={step}
          value={draft ?? String(shown)}
          onChange={(e) => {
            setDraft(e.target.value);
            setShown(e.target.value === '' ? 0 : Number(e.target.value));
          }}
          onBlur={() => setDraft(null)}
          aria-label={unit ? unit.label : isPerGram ? 'Grams' : 'Quantity'}
          className="w-16 rounded-md border border-black/10 bg-transparent px-2 py-1 text-center text-sm dark:border-white/10"
        />
        <Button variant="outline" size="sm" onClick={() => {
            setDraft(null);
            setShown(shown + step);
          }} aria-label="Increase quantity" className="!p-0 flex h-8 w-8 items-center justify-center">
          +
        </Button>
        {isPerGram && <span className="text-xs text-zinc-500">{unit ? `× ${unit.label} = ${Math.round(qty)} g` : 'g'}</span>}
        <span className="ml-1 text-xs text-zinc-500">
          {Math.round(calories)} kcal · {Math.round(protein)}P / {Math.round(carbs)}C / {Math.round(fat)}F
        </span>
      </div>
      {qtyProblem && <p className="text-xs font-semibold text-danger">{qtyProblem}</p>}
    </li>
  );
}

function QuickAddForm({ onAdd }: { onAdd: (fields: { name: string; calories: number | null; protein: number | null; carbs: number | null; fat: number | null }) => unknown }) {
  const [name, setName] = useState('');
  const [calories, setCalories] = useState('');
  const [protein, setProtein] = useState('');
  const [carbs, setCarbs] = useState('');
  const [fat, setFat] = useState('');
  const inputCls = 'w-full rounded-md border border-black/10 bg-transparent px-2.5 py-1.5 text-sm dark:border-white/10';
  // Each figure is optional, but whatever is typed has to be a sensible number (FS3, FS6).
  const problem = firstFoodProblem([
    checkFoodNumber(calories, 'kcal', { allowBlank: true }),
    checkFoodNumber(protein, 'grams', { allowBlank: true }),
    checkFoodNumber(carbs, 'grams', { allowBlank: true }),
    checkFoodNumber(fat, 'grams', { allowBlank: true }),
  ]);
  const canSubmit = Boolean(name.trim() && (calories || protein || carbs || fat)) && problem == null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    const result = await onAdd({
      name: name.trim(),
      calories: calories === '' ? null : Number(calories),
      protein: protein === '' ? null : Number(protein),
      carbs: carbs === '' ? null : Number(carbs),
      fat: fat === '' ? null : Number(fat),
    });
    // A failed add keeps what was typed (FS5).
    if (result === false) return;
    setName('');
    setCalories('');
    setProtein('');
    setCarbs('');
    setFat('');
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-2xl border border-black/[.05] bg-card p-3 shadow-[0_1px_2px_rgba(0,0,0,.02)] dark:border-white/10">
      <p className="mb-2 text-xs text-zinc-500">
        For something not in the food database — a restaurant meal, an estimate. Calories or macros (whatever you know).
      </p>
      <div className="space-y-2">
        <input type="text" placeholder="What is it?" value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
          <input type="number" inputMode="decimal" min={0} max={FOOD_LIMITS.kcal} placeholder="kcal" aria-label="Calories" value={calories} onChange={(e) => setCalories(e.target.value)} className={inputCls} />
          <input type="number" inputMode="decimal" min={0} max={FOOD_LIMITS.grams} placeholder="protein g" aria-label="Protein in grams" value={protein} onChange={(e) => setProtein(e.target.value)} className={inputCls} />
          <input type="number" inputMode="decimal" min={0} max={FOOD_LIMITS.grams} placeholder="carbs g" aria-label="Carbs in grams" value={carbs} onChange={(e) => setCarbs(e.target.value)} className={inputCls} />
          <input type="number" inputMode="decimal" min={0} max={FOOD_LIMITS.grams} placeholder="fat g" aria-label="Fat in grams" value={fat} onChange={(e) => setFat(e.target.value)} className={inputCls} />
        </div>
        {problem && <p className="text-xs font-semibold text-danger">{problem}</p>}
        <Button type="submit" variant="primary" size="sm" disabled={!canSubmit}>
          Add
        </Button>
      </div>
    </form>
  );
}

export function FoodSearchPicker({
  onAdd,
  recipes,
  onAddRecipe,
  onAddQuickAdd,
  goesWith,
  favorites,
  recentlyLogged,
  favoriteIds,
  onToggleFavorite,
}: {
  onAdd: (food: FoodRow, grams: number) => unknown;
  // When provided (even empty), a "Foods / Recipes" toggle appears so the same picker can
  // fan a saved recipe out into diary/meal-plan entries instead of one food at a time.
  recipes?: RecipeRow[];
  onAddRecipe?: (recipeId: string, servings: number) => unknown;
  // Quick Add tab only appears when provided -- the Meal Planner also uses this picker (no
  // "date-specific logging" concept there, so quick-add wouldn't make sense) while Food
  // Tracking does.
  onAddQuickAdd?: (fields: { name: string; calories: number | null; protein: number | null; carbs: number | null; fat: number | null }) => unknown;
  // Foods the member usually eats with what is already in this meal, each with the amount they usually have; shown first, before a query
  // is typed. Food Tracking only, like the lists below.
  goesWith?: PairSuggestion[];
  // Favorites/Recently Logged only appear (before a query is typed) when provided -- same
  // "Meal Planner has no per-client favoriting concept wired up" reasoning as Quick Add above.
  favorites?: FoodRow[];
  recentlyLogged?: FoodRow[];
  favoriteIds?: Set<string>;
  onToggleFavorite?: (food: FoodRow, isFavorite: boolean) => void;
}) {
  const [mode, setMode] = useState<'foods' | 'recipes' | 'quick_add'>('foods');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<FoodRow[]>([]);
  const [grams, setGrams] = useState<Record<string, number>>({});
  const [servings, setServings] = useState<Record<string, number>>({});
  const [isPending, setIsPending] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abort = useRef<AbortController | null>(null);
  const latest = useRef(0);

  // Searches go straight from the phone to the database (one hop, no server-action queue), start
  // 200 ms after the last keystroke, cancel the request they replace, and ignore any answer that is
  // no longer the latest -- typing "porridge" is one search, not eight queued ones. If the direct
  // call fails for any reason it falls back to the server-side search.
  function handleQueryChange(value: string) {
    setQuery(value);
    if (timer.current) clearTimeout(timer.current);
    abort.current?.abort();
    const q = value.trim();
    const id = ++latest.current;
    if (q.length < 2) {
      setResults([]);
      setIsPending(false);
      return;
    }
    setIsPending(true);
    timer.current = setTimeout(async () => {
      const controller = new AbortController();
      abort.current = controller;
      let foods: FoodRow[] | null = null;
      try {
        const { data, error } = await createClient().rpc('search_foods', { p_query: q, p_limit: 25 }).abortSignal(controller.signal);
        if (!error) foods = (data ?? []) as FoodRow[];
      } catch {
        // aborted or offline: handled below
      }
      if (id !== latest.current) return; // a newer search has taken over
      if (foods === null) {
        try {
          foods = await searchFoods(q);
        } catch {
          foods = [];
        }
        if (id !== latest.current) return;
      }
      setResults(foods);
      setIsPending(false);
    }, 200);
  }

  // The member's own units (private to them), loaded once; built-in ones come with each food.
  const [ownUnits, setOwnUnits] = useState<OwnUnitRow[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const { data: auth } = await supabase.auth.getUser();
      if (cancelled || !auth.user) return;
      setUserId(auth.user.id);
      const { data } = await supabase.from('member_food_units').select('id, food_id, label, grams').eq('client_id', auth.user.id);
      if (!cancelled && data) setOwnUnits(data.map((r) => ({ ...r, grams: Number(r.grams) })) as OwnUnitRow[]);
    })().catch(() => {
      // units are a convenience: without them the picker still works in grams
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function saveUnit(foodId: string, label: string, gramsInOne: number): Promise<string | null> {
    if (!userId) return 'Could not save that unit. Try again.';
    const { data, error } = await createClient()
      .from('member_food_units')
      .insert({ client_id: userId, food_id: foodId, label, grams: gramsInOne })
      .select('id, food_id, label, grams')
      .single();
    if (error || !data) {
      if (error?.code === '23505') return 'You already have a unit with that name for this food.';
      return error?.message.includes('most units') ? error.message : 'Could not save that unit. Try again.';
    }
    setOwnUnits((u) => [...u, { ...data, grams: Number(data.grams) } as OwnUnitRow]);
    return null;
  }

  function deleteUnit(key: string) {
    setOwnUnits((u) => u.filter((x) => x.id !== key));
    void createClient().from('member_food_units').delete().eq('id', key);
  }

  const unitProps = (food: FoodRow) => ({ units: unitsFor(food, ownUnits), onSaveUnit: saveUnit, onDeleteUnit: deleteUnit });

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      abort.current?.abort();
    },
    []
  );

  const modes: ('foods' | 'recipes' | 'quick_add')[] = [
    'foods',
    ...(recipes ? (['recipes'] as const) : []),
    ...(onAddQuickAdd ? (['quick_add'] as const) : []),
  ];

  if (onAddQuickAdd && mode === 'quick_add') {
    return (
      <div className="space-y-2">
        <div className="flex gap-1 rounded-xl bg-black/5 p-1 dark:bg-white/5">
          {modes.map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`flex-1 rounded-md px-3 py-1 text-xs font-medium capitalize transition-colors ${
                mode === m ? 'bg-[var(--background)] text-black shadow-[0_1px_3px_rgba(0,0,0,.1)] dark:text-zinc-50' : 'text-zinc-500 hover:text-black dark:hover:text-zinc-300'
              }`}
            >
              {m === 'quick_add' ? 'Quick Add' : m}
            </button>
          ))}
        </div>
        <QuickAddForm onAdd={onAddQuickAdd} />
      </div>
    );
  }

  if (recipes && mode === 'recipes') {
    return (
      <div className="rounded-2xl border border-black/[.05] bg-card p-3 shadow-[0_1px_2px_rgba(0,0,0,.02)] dark:border-white/10">
        <div className="flex gap-1 rounded-xl bg-black/5 p-1 dark:bg-white/5">
          {modes.map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`flex-1 rounded-md px-3 py-1 text-xs font-medium capitalize transition-colors ${
                mode === m ? 'bg-[var(--background)] text-black shadow-[0_1px_3px_rgba(0,0,0,.1)] dark:text-zinc-50' : 'text-zinc-500 hover:text-black dark:hover:text-zinc-300'
              }`}
            >
              {m === 'quick_add' ? 'Quick Add' : m}
            </button>
          ))}
        </div>
        <ul className="mt-2 max-h-64 divide-y divide-black/5 overflow-y-auto dark:divide-white/5">
          {recipes.map((recipe) => {
            const s = servings[recipe.id] ?? 1;
            return (
              <li key={recipe.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                <span className="font-medium text-black dark:text-zinc-50">{recipe.name}</span>
                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    min={0.25}
                    max={FOOD_LIMITS.portions}
                    step={0.25}
                    value={s}
                    onChange={(e) => setServings((v) => ({ ...v, [recipe.id]: e.target.value === '' ? 0 : Math.max(0, Number(e.target.value)) }))}
                    aria-label="Servings"
                    className="w-14 rounded-md border border-black/10 bg-transparent px-2 py-1 text-center text-sm dark:border-white/10"
                  />
                  <span className="text-xs text-zinc-500">servings</span>
                  <Button variant="primary" size="sm" disabled={!(s > 0) || s > FOOD_LIMITS.portions} onClick={() => onAddRecipe?.(recipe.id, s)}>
                    Add
                  </Button>
                </div>
              </li>
            );
          })}
          {recipes.length === 0 && <EmptyState compact title="No recipes yet — build one under Recipes." />}
        </ul>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-black/[.05] bg-card p-3 shadow-[0_1px_2px_rgba(0,0,0,.02)] dark:border-white/10">
      {modes.length > 1 && (
        <div className="mb-2 flex gap-1 rounded-xl bg-black/5 p-1 dark:bg-white/5">
          {modes.map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`flex-1 rounded-md px-3 py-1 text-xs font-medium capitalize transition-colors ${
                mode === m ? 'bg-[var(--background)] text-black shadow-[0_1px_3px_rgba(0,0,0,.1)] dark:text-zinc-50' : 'text-zinc-500 hover:text-black dark:hover:text-zinc-300'
              }`}
            >
              {m === 'quick_add' ? 'Quick Add' : m}
            </button>
          ))}
        </div>
      )}
      {/* No search fires on focus: swapping the list under a fingertip the instant the box is tapped
          makes some phone browsers drop the keyboard. Results appear as soon as something is typed;
          until then the favourites / recently logged lists (or a prompt) are shown. */}
      <input
        type="text"
        inputMode="search"
        enterKeyHint="search"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        placeholder="Search foods…"
        className="w-full rounded-md border border-black/10 bg-transparent px-3 py-2 text-base dark:border-white/10"
        value={query}
        onChange={(e) => handleQueryChange(e.target.value)}
      />
      {isPending && <p className="mt-2 text-xs text-zinc-500">Searching…</p>}

      {query === '' && !isPending && results.length === 0 && ((goesWith && goesWith.length > 0) || (favorites && favorites.length > 0) || (recentlyLogged && recentlyLogged.length > 0)) ? (
        <div className="mt-2 max-h-80 space-y-3 overflow-y-auto">
          {goesWith && goesWith.length > 0 && (
            <div>
              <p className="px-0.5 text-xs font-semibold text-zinc-500">Goes with what&apos;s in this meal</p>
              <ul className="divide-y divide-black/5 dark:divide-white/5">
                {goesWith.map(({ food, portions }) => (
                  <FoodResultRow
                    key={food.id}
                    food={food}
                    qty={grams[food.id] ?? portions}
                    onQtyChange={(v) => setGrams((g) => ({ ...g, [food.id]: Math.max(0, v) }))}
                    onAdd={onAdd}
                    isFavorite={favoriteIds?.has(food.id) ?? false}
                    onToggleFavorite={onToggleFavorite}
                    {...unitProps(food)}
                  />
                ))}
              </ul>
            </div>
          )}
          {favorites && favorites.length > 0 && (
            <div>
              <p className="px-0.5 text-xs font-semibold text-zinc-500">Favorites</p>
              <ul className="divide-y divide-black/5 dark:divide-white/5">
                {favorites.map((food) => (
                  <FoodResultRow
                    key={food.id}
                    food={food}
                    qty={grams[food.id] ?? startingAmount(food)}
                    onQtyChange={(v) => setGrams((g) => ({ ...g, [food.id]: Math.max(0, v) }))}
                    onAdd={onAdd}
                    isFavorite={favoriteIds?.has(food.id) ?? true}
                    onToggleFavorite={onToggleFavorite}
                    {...unitProps(food)}
                  />
                ))}
              </ul>
            </div>
          )}
          {recentlyLogged && recentlyLogged.length > 0 && (
            <div>
              <p className="px-0.5 text-xs font-semibold text-zinc-500">Recently logged</p>
              <ul className="divide-y divide-black/5 dark:divide-white/5">
                {recentlyLogged.map((food) => (
                  <FoodResultRow
                    key={food.id}
                    food={food}
                    qty={grams[food.id] ?? startingAmount(food)}
                    onQtyChange={(v) => setGrams((g) => ({ ...g, [food.id]: Math.max(0, v) }))}
                    onAdd={onAdd}
                    isFavorite={favoriteIds?.has(food.id) ?? false}
                    onToggleFavorite={onToggleFavorite}
                    {...unitProps(food)}
                  />
                ))}
              </ul>
            </div>
          )}
        </div>
      ) : (
        <ul className="mt-2 max-h-80 divide-y divide-black/5 overflow-y-auto dark:divide-white/5">
          {results.map((food) => (
            <FoodResultRow
              key={food.id}
              food={food}
              qty={grams[food.id] ?? startingAmount(food)}
              onQtyChange={(v) => setGrams((g) => ({ ...g, [food.id]: Math.max(0, v) }))}
              onAdd={onAdd}
              isFavorite={favoriteIds?.has(food.id) ?? false}
              onToggleFavorite={onToggleFavorite}
              {...unitProps(food)}
            />
          ))}
          {!isPending && results.length === 0 && (
            <li>
              <EmptyState compact title={query.trim().length >= 2 ? `No results for "${query.trim()}"` : query ? 'Keep typing…' : 'Start typing to search foods'} />
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
