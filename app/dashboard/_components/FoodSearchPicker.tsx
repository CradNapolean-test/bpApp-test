'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Star } from 'lucide-react';
import { Button } from '@/app/_components/Button';
import { EmptyState } from '@/app/_components/EmptyState';
import { searchFoods } from '@/lib/data/foods';
import { createClient } from '@/lib/supabase/client';
import { dayCalories } from '@/lib/calculations';
import { FOOD_LIMITS, checkFoodNumber, firstFoodProblem } from '@/lib/foodLimits';
import type { PairSuggestion } from '@/lib/foodPairs';
import type { FoodRow, RecipeRow } from '@/lib/data/types';
import { SEARCH_LIMIT, groupFoodResults, moreLikeThis } from '@/lib/utils/foodResults';
import { EMPTY_OWN_FOOD, OWN_FOOD_NAME_MAX, isOwnFood, readOwnFood, type OwnFoodRow, type OwnFoodText } from '@/lib/utils/ownFoods';
import { MAX_UNIT_LABEL, countFromGrams, defaultUnit, gramsFromCount, parseUnitInput, startingAmount, unitText, unitsFor, type FoodUnit, type OwnUnitRow } from '@/lib/utils/foodUnits';

const UNIT_PRESETS = [0.5, 1, 2, 3];

// ml-sized units (under 5 g each) preset and step in bigger counts than a rasher or a slice.
const isSmallUnit = (u: FoodUnit) => u.grams < 5;
const UNIT_COUNT_PRESETS = [0.5, 1, 2, 3];
const SMALL_UNIT_PRESETS = [100, 200, 250, 330];

// A result's calories and protein for `amount` (grams, or portions for a food counted by the portion). Protein is what tells a
// 0% yogurt from a full-fat one at a glance (NU7); under 10 g it keeps one decimal so 0.4 g does not read as none.
function kcalAndProtein(food: FoodRow, amount: number): string {
  const kcal = Math.round(dayCalories(food.protein * amount, food.carbs * amount, food.fat * amount));
  const protein = food.protein * amount;
  return `${kcal} kcal · ${protein >= 10 ? Math.round(protein) : Math.round(protein * 10) / 10} g protein`;
}

// "per 100 g · 165 kcal · 31 g protein": what a food is per its own serving (the pack's) when it has one, else per 100 g, else per its unit.
function perLine(food: FoodRow): string {
  const stated = defaultUnit(unitsFor(food, []));
  if (stated && !isSmallUnit(stated)) return `per ${unitText(stated)} · ${kcalAndProtein(food, stated.grams)}`;
  return food.portion === '1 gram' ? `per 100 g · ${kcalAndProtein(food, 100)}` : `per ${food.portion} · ${kcalAndProtein(food, 1)}`;
}

// One result in a list (search, favourites, recently logged, usually with): the food's name with its calories and protein, nothing else,
// so 5 or 6 fit on a phone screen (D23b, NU8: every result used to carry its whole amount picker, about 150px each). Tapping it opens the
// amount step. `more` is the other rows for the same product (D23a), shown under it on request.
function FoodResultItem({
  food,
  onPick,
  more,
  nested = false,
}: {
  food: FoodRow;
  onPick: (food: FoodRow) => void;
  more?: { count: number; open: boolean; onToggle: () => void };
  nested?: boolean;
}) {
  return (
    <li className={nested ? 'pl-3' : undefined}>
      <button
        type="button"
        onClick={() => onPick(food)}
        className="flex min-h-12 w-full items-center justify-between gap-3 rounded-lg py-2 text-left transition-colors hover:bg-black/[.03] dark:hover:bg-white/[.04]"
      >
        <span className="min-w-0">
          {/* Two lines, like the phone: UK table names put what matters last ("Chicken, breast, grilled without skin, meat only"), so one
              cut-off line hid whether a food was raw or cooked. */}
          <span className="line-clamp-2 break-words text-sm font-medium text-black dark:text-zinc-50">{food.name}</span>
          <span className="block text-xs text-zinc-500">
            {isOwnFood(food) && <span className="mr-1 rounded bg-accent-soft px-1 py-px text-[10px] font-bold text-accent">My food</span>}
            {perLine(food)}
          </span>
        </span>
        <ChevronRight aria-hidden className="h-4 w-4 shrink-0 text-zinc-400" />
      </button>
      {more && (
        <button type="button" aria-expanded={more.open} onClick={more.onToggle} className="mb-1.5 min-h-8 text-xs font-semibold text-accent hover:underline">
          {more.open ? 'Hide the others' : moreLikeThis(more.count)}
        </button>
      )}
    </li>
  );
}

// The second step after tapping a food: how much (serving menu, own serving, quick amounts, the number), then Add. Back returns to the
// list as it was.
function FoodAmountStep({
  food,
  initialQty,
  onAdd,
  onBack,
  isFavorite,
  onToggleFavorite,
  units = [],
  onSaveUnit,
  onDeleteUnit,
  onRemoveOwn,
}: {
  food: FoodRow;
  initialQty: number;
  onAdd: (food: FoodRow, qty: number) => void;
  onBack: () => void;
  // For the member's own food (NU18): takes it off their list; resolves to a message when it could not.
  onRemoveOwn?: () => Promise<string | null>;
  isFavorite?: boolean;
  onToggleFavorite?: (food: FoodRow, isFavorite: boolean) => void;
  // Units for this food (built-in and the member's own), shown next to grams. What is added is always grams.
  units?: FoodUnit[];
  onSaveUnit?: (foodId: string, label: string, grams: number) => Promise<string | null>;
  onDeleteUnit?: (key: string) => void;
}) {
  const [qty, setQty] = useState(initialQty);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const onQtyChange = (value: number) => setQty(Math.max(0, value));
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
    return stated && initialQty === stated.grams ? stated.key : null;
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
    `min-h-8 rounded-full border px-2.5 py-1 text-xs transition-colors ${
      active
        ? 'border-accent bg-accent-soft text-accent'
        : 'border-black/10 text-zinc-500 hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/5'
    }`;

  return (
    <div className="space-y-3">
      <button type="button" onClick={onBack} className="flex min-h-9 items-center gap-1 text-sm font-semibold text-accent">
        <ChevronLeft aria-hidden className="h-4 w-4" /> Back to results
      </button>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="break-words text-[15px] font-bold text-black dark:text-zinc-50">{food.name}</p>
          <p className="text-xs text-zinc-500">
            {unit && !small ? `per ${unitText(unit)} · ${kcalAndProtein(food, unit.grams)}` : perLine(food)}
          </p>
        </div>
        {onToggleFavorite && (
          <button
            type="button"
            onClick={() => onToggleFavorite(food, !isFavorite)}
            aria-label={isFavorite ? 'Remove favorite' : 'Add favorite'}
            aria-pressed={isFavorite}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-zinc-400 hover:text-amber-500"
          >
            <Star className={`h-5 w-5 ${isFavorite ? 'fill-amber-400 text-amber-400' : ''}`} />
          </button>
        )}
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
            className="max-w-full rounded-lg border border-black/[.16] bg-transparent px-2 py-1.5 text-sm dark:border-white/10"
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
              className="w-24 rounded-lg border border-black/[.16] bg-transparent px-2 py-1 text-sm dark:border-white/10"
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
              className="w-16 rounded-lg border border-black/[.16] bg-transparent px-2 py-1 text-center text-sm dark:border-white/10"
            />
            <span className="text-zinc-500">g</span>
            <Button variant="outline" size="sm" onClick={saveNewUnit}>
              Save
            </Button>
          </div>
          {unitError && <p className="text-xs font-semibold text-danger">{unitError}</p>}
        </div>
      )}

      {presets.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {presets.map((p) => (
            <button
              key={p}
              type="button"
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
      )}

      <div className="flex items-center gap-1.5">
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setDraft(null);
            setShown(shown - step);
          }}
          aria-label="Decrease quantity"
          className="!p-0 flex h-10 w-10 items-center justify-center"
        >
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
          className="h-10 w-20 rounded-lg border border-black/[.16] bg-transparent px-2 text-center text-base dark:border-white/10"
        />
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setDraft(null);
            setShown(shown + step);
          }}
          aria-label="Increase quantity"
          className="!p-0 flex h-10 w-10 items-center justify-center"
        >
          +
        </Button>
        {isPerGram && <span className="text-xs text-zinc-500">{unit ? `× ${unit.label} = ${Math.round(qty)} g` : 'g'}</span>}
      </div>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        <span className="font-semibold text-black dark:text-zinc-50">{Math.round(calories)} kcal</span> · {Math.round(protein)}P / {Math.round(carbs)}C /{' '}
        {Math.round(fat)}F
      </p>
      {qtyProblem && <p className="text-xs font-semibold text-danger">{qtyProblem}</p>}
      <Button variant="primary" className="w-full" disabled={!(qty > 0) || qtyProblem != null} onClick={() => onAdd(food, qty)}>
        Add
      </Button>
      {onRemoveOwn && (
        <div className="space-y-1 text-center">
          <button
            type="button"
            onClick={async () => setRemoveError(await onRemoveOwn())}
            className="min-h-9 text-xs font-semibold text-zinc-500 hover:text-danger"
          >
            Remove from my foods
          </button>
          <p className="text-[11px] text-zinc-400">Anything already logged with it stays as it is.</p>
          {removeError && <p className="text-xs font-semibold text-danger">{removeError}</p>}
        </div>
      )}
    </div>
  );
}

// "A food of your own" (NU18): name, what one serving is (and its weight, if known), and the protein, carbs and fat in it. Saved private to
// the member and their gym's coaches, then straight on to how much to add.
function OwnFoodForm({ initialName, onSave, onCancel }: { initialName: string; onSave: (row: OwnFoodRow) => Promise<string | null>; onCancel: () => void }) {
  const [text, setText] = useState<OwnFoodText>({ ...EMPTY_OWN_FOOD, name: initialName });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const set = (key: keyof OwnFoodText) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setText((t) => ({ ...t, [key]: e.target.value }));
    setError(null);
  };
  const preview = readOwnFood(text);
  const serving = text.serving.trim() || 'serving';

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const read = readOwnFood(text);
    if (!read.ok) return setError(read.error);
    setSaving(true);
    const failure = await onSave(read.row);
    setSaving(false);
    if (failure) setError(failure);
  }

  const inputCls = 'w-full rounded-xl border border-black/[.16] bg-transparent px-3 py-2 text-base dark:border-white/10';
  const labelCls = 'block space-y-1';
  const captionCls = 'text-xs font-medium text-zinc-500';
  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <button type="button" onClick={onCancel} className="flex min-h-9 items-center gap-1 text-sm font-semibold text-accent">
        <ChevronLeft aria-hidden className="h-4 w-4" /> Back
      </button>
      <div>
        <p className="text-[15px] font-bold text-black dark:text-zinc-50">A food of your own</p>
        <p className="text-xs text-zinc-500">
          For something you have often that is not in the list, like a café wrap. Save it once with the figures for one serving. Only you and
          the coaches at your gym can see it.
        </p>
      </div>
      <label className={labelCls}>
        <span className={captionCls}>Name</span>
        <input type="text" value={text.name} onChange={set('name')} maxLength={OWN_FOOD_NAME_MAX} placeholder="Café chicken wrap" className={inputCls} />
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className={labelCls}>
          <span className={captionCls}>One serving is 1…</span>
          <input type="text" value={text.serving} onChange={set('serving')} maxLength={MAX_UNIT_LABEL} placeholder="wrap" className={inputCls} />
        </label>
        <label className={labelCls}>
          <span className={captionCls}>It weighs (g, if known)</span>
          <input type="number" inputMode="decimal" min={0} value={text.grams} onChange={set('grams')} placeholder="optional" className={inputCls} />
        </label>
      </div>
      <p className={captionCls}>In one {serving}</p>
      <div className="grid grid-cols-3 gap-1.5">
        <input type="number" inputMode="decimal" min={0} value={text.protein} onChange={set('protein')} placeholder="protein g" aria-label="Protein in grams" className={inputCls} />
        <input type="number" inputMode="decimal" min={0} value={text.carbs} onChange={set('carbs')} placeholder="carbs g" aria-label="Carbs in grams" className={inputCls} />
        <input type="number" inputMode="decimal" min={0} value={text.fat} onChange={set('fat')} placeholder="fat g" aria-label="Fat in grams" className={inputCls} />
      </div>
      {preview.ok && (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          <span className="font-semibold text-black dark:text-zinc-50">{Math.round(preview.perServing.calories)} kcal</span> per {serving}
        </p>
      )}
      {error && <p className="text-xs font-semibold text-danger">{error}</p>}
      <Button type="submit" variant="primary" className="w-full" disabled={saving}>
        Save to my foods
      </Button>
    </form>
  );
}

function QuickAddForm({ onAdd }: { onAdd: (fields: { name: string; calories: number | null; protein: number | null; carbs: number | null; fat: number | null }) => unknown }) {
  const [name, setName] = useState('');
  const [calories, setCalories] = useState('');
  const [protein, setProtein] = useState('');
  const [carbs, setCarbs] = useState('');
  const [fat, setFat] = useState('');
  const inputCls = 'w-full rounded-xl border border-black/[.16] bg-transparent px-3 py-2 text-sm dark:border-white/10';
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
    <form onSubmit={handleSubmit} className="rounded-[20px] border border-black/[.08] bg-card p-3 dark:border-white/10">
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
  // Near-duplicate products shown as one result per brand and product, the rest behind "N more like this" (D23a).
  const groups = useMemo(() => groupFoodResults(results), [results]);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const toggleGroup = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  // The food tapped in a list, and the amount its step starts at (D23b). The list, query and results stay as they were for "Back".
  const [picked, setPicked] = useState<{ food: FoodRow; qty: number } | null>(null);
  const pick = (food: FoodRow, qty = startingAmount(food)) => setPicked({ food, qty });
  // ...and where the list was scrolled to: the list is not on screen while a food (or the own-food form) is open, so the position the
  // list reported last is kept when it goes, and put back when it comes back ("Back to results" lands on the result that was tapped, not
  // the top of 40 or more results). Any other list starts at the top.
  const listScroll = useRef(0);
  const backTo = useRef(0);
  const onListScroll = (e: React.UIEvent<HTMLElement>) => {
    listScroll.current = e.currentTarget.scrollTop;
  };
  const keepListScroll = useCallback((el: HTMLElement | null) => {
    if (!el) return;
    el.scrollTop = backTo.current;
    listScroll.current = backTo.current;
    backTo.current = 0;
  }, []);
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
        const { data, error } = await createClient().rpc('search_foods', { p_query: q, p_limit: SEARCH_LIMIT }).abortSignal(controller.signal);
        if (!error) foods = (data ?? []) as FoodRow[];
      } catch {
        // aborted or offline: handled below
      }
      if (id !== latest.current) return; // a newer search has taken over
      if (foods === null) {
        try {
          foods = await searchFoods(q, SEARCH_LIMIT);
        } catch {
          foods = [];
        }
        if (id !== latest.current) return;
      }
      setResults(foods);
      setExpanded(new Set());
      setIsPending(false);
    }, 200);
  }

  // A member's own foods (NU18): listed before anything is typed, found in search, saved here and removed from the amount step.
  const [ownFoods, setOwnFoods] = useState<FoodRow[]>([]);
  // The "A food of your own" form, with the name to start from (what was searched for, when nothing was found).
  const [creating, setCreating] = useState<{ name: string } | null>(null);
  useEffect(() => {
    if (picked || creating) backTo.current = listScroll.current;
  }, [picked, creating]);

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
      const [units, foods] = await Promise.all([
        supabase.from('member_food_units').select('id, food_id, label, grams').eq('client_id', auth.user.id),
        // The member's own foods (NU18), by name; removed ones are hidden.
        supabase.from('foods').select('*').eq('owner_id', auth.user.id).eq('hidden', false).order('name').limit(200),
      ]);
      if (cancelled) return;
      if (units.data) setOwnUnits(units.data.map((r) => ({ ...r, grams: Number(r.grams) })) as OwnUnitRow[]);
      if (foods.data) setOwnFoods(foods.data as FoodRow[]);
    })().catch(() => {
      // units and own foods are a convenience: without them the picker still works in grams, and own foods still come up in search
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function saveOwnFood(row: OwnFoodRow): Promise<string | null> {
    if (!userId) return 'Could not save that food. Try again.';
    const { data, error } = await createClient()
      .from('foods')
      .insert({ ...row, source: 'own', owner_id: userId })
      .select('*')
      .single();
    if (error || !data) return 'Could not save that food. Try again.';
    const food = data as FoodRow;
    setOwnFoods((prev) => [food, ...prev]);
    setCreating(null);
    // Straight on to how much, so it can be added now.
    setPicked({ food, qty: startingAmount(food) });
    return null;
  }

  async function removeOwnFood(food: FoodRow): Promise<string | null> {
    const { data, error } = await createClient().rpc('remove_own_food', { p_food_id: food.id });
    if (error || data !== true) return 'Could not remove that food. Try again.';
    setOwnFoods((prev) => prev.filter((f) => f.id !== food.id));
    setResults((prev) => prev.filter((f) => f.id !== food.id));
    setPicked(null);
    return null;
  }

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
      <div className="rounded-[20px] border border-black/[.08] bg-card p-3 dark:border-white/10">
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
                    className="w-14 rounded-lg border border-black/[.16] bg-transparent px-2 py-1 text-center text-sm dark:border-white/10"
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

  // Tap a food, then choose the amount (D23b): the amount step replaces the list, and "Back to results" brings the list back as it was
  // (query, results, open groups and scroll position).
  if (picked) {
    return (
      <div className="rounded-[20px] border border-black/[.08] bg-card p-3 dark:border-white/10">
        <FoodAmountStep
          key={picked.food.id}
          food={picked.food}
          initialQty={picked.qty}
          onAdd={onAdd}
          onBack={() => setPicked(null)}
          isFavorite={favoriteIds?.has(picked.food.id) ?? false}
          onToggleFavorite={onToggleFavorite}
          {...unitProps(picked.food)}
          onRemoveOwn={isOwnFood(picked.food) && picked.food.owner_id === userId ? () => removeOwnFood(picked.food) : undefined}
        />
      </div>
    );
  }

  if (creating) {
    return (
      <div className="rounded-[20px] border border-black/[.08] bg-card p-3 dark:border-white/10">
        <OwnFoodForm initialName={creating.name} onSave={saveOwnFood} onCancel={() => setCreating(null)} />
      </div>
    );
  }

  const shortcutList = (title: string, foods: FoodRow[], qtyOf: (food: FoodRow) => number = startingAmount) => (
    <div>
      <p className="px-0.5 text-xs font-semibold text-zinc-500">{title}</p>
      <ul className="divide-y divide-black/5 dark:divide-white/5">
        {foods.map((food) => (
          <FoodResultItem key={food.id} food={food} onPick={(f) => pick(f, qtyOf(f))} />
        ))}
      </ul>
    </div>
  );

  return (
    <div className="rounded-[20px] border border-black/[.08] bg-card p-3 dark:border-white/10">
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
        className="w-full rounded-xl border border-black/[.16] bg-transparent px-3.5 py-2.5 text-base dark:border-white/10"
        value={query}
        onChange={(e) => handleQueryChange(e.target.value)}
      />
      {isPending ? (
        <p className="mt-2 text-xs text-zinc-500">Searching…</p>
      ) : (
        query === '' && (
          <button type="button" onClick={() => setCreating({ name: '' })} className="mt-1.5 min-h-9 text-[13px] font-semibold text-accent hover:underline">
            + A food of your own
          </button>
        )
      )}

      {query === '' && !isPending && results.length === 0 && ((goesWith && goesWith.length > 0) || ownFoods.length > 0 || (favorites && favorites.length > 0) || (recentlyLogged && recentlyLogged.length > 0)) ? (
        <div ref={keepListScroll} onScroll={onListScroll} className="mt-2 max-h-[50vh] space-y-3 overflow-y-auto">
          {goesWith && goesWith.length > 0 && shortcutList(
            'Goes with what’s in this meal',
            goesWith.map((g) => g.food),
            (food) => goesWith.find((g) => g.food.id === food.id)?.portions ?? startingAmount(food)
          )}
          {ownFoods.length > 0 && shortcutList('My foods', ownFoods)}
          {favorites && favorites.length > 0 && shortcutList('Favorites', favorites)}
          {recentlyLogged && recentlyLogged.length > 0 && shortcutList('Recently logged', recentlyLogged)}
        </div>
      ) : (
        <ul ref={keepListScroll} onScroll={onListScroll} className="mt-2 max-h-[50vh] divide-y divide-black/5 overflow-y-auto dark:divide-white/5">
          {groups.map(({ food: shown, others }) => {
            const open = expanded.has(shown.id);
            return [shown, ...(open ? others : [])].map((food, i) => (
              <FoodResultItem
                key={food.id}
                food={food}
                onPick={(f) => pick(f)}
                nested={i > 0}
                more={i === 0 && others.length > 0 ? { count: others.length, open, onToggle: () => toggleGroup(shown.id) } : undefined}
              />
            ));
          })}
          {!isPending && results.length === 0 && (
            <li>
              <EmptyState compact title={query.trim().length >= 2 ? `No results for "${query.trim()}"` : query ? 'Keep typing…' : 'Start typing to search foods'} />
              {query.trim().length >= 2 && (
                <button type="button" onClick={() => setCreating({ name: query.trim() })} className="mx-auto mb-2 block min-h-9 text-[13px] font-semibold text-accent hover:underline">
                  Save &ldquo;{query.trim()}&rdquo; as a food of your own
                </button>
              )}
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
