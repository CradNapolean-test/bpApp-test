'use client';

import { useEffect, useRef, useState } from 'react';
import { ScanBarcode } from 'lucide-react';
import { Button } from '@/app/_components/Button';
import { EmptyState } from '@/app/_components/EmptyState';
import { useAction } from '@/app/_components/useAction';
import { useConfirm } from '@/app/_components/ConfirmDialog';
import { inputCls } from '@/app/_components/ui';
import { correctScannedFood, listMemberAddedFoods, searchAllFoodsForCoach, searchScannedFoods, setFoodHidden, setFoodServings } from '@/lib/data/foods';
import type { FoodAddition, FoodRow } from '@/lib/data/types';
import { BARCODE_FOOD_BRAND_MAX, BARCODE_FOOD_NAME_MAX, productText, readBarcodeFood, type BarcodeFoodText } from '@/lib/utils/barcodeFoods';
import { MAX_SERVINGS, cleanServings, unitText, type ServingDraft } from '@/lib/utils/foodUnits';

// Per 100 g, which is how packaging reads (the database keeps it per gram).
const per100 = (n: number) => Math.round(n * 1000) / 10;

type ListedFood = FoodRow & { addition?: FoodAddition | null };

// "Typed in by Sam Smith on 20 Nov" / "Scanned by ..." (migration 0173). Shown only for members of this coach's gym (the database decides).
function addedLine(a: FoodAddition): string {
  const when = new Date(a.added_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  return `${a.typed ? 'Typed in from the pack' : 'Scanned'} by ${a.adder_name ?? 'a member'} on ${when}`;
}

// A coach corrects a scanned product's name, brand and figures per 100 g. The shared list has one food per barcode, so every member at
// every gym gets the correction, and days that already include it count the corrected figures. Checked as the member's form checks them.
function CorrectEditor({ food, onDone, onCancel }: { food: FoodRow; onDone: () => void; onCancel: () => void }) {
  const { run, busy } = useAction();
  const [text, setText] = useState<BarcodeFoodText>(() => productText(food));
  const [error, setError] = useState<string | null>(null);
  const set = (key: 'name' | 'brand' | 'protein' | 'carbs' | 'fat') => (e: React.ChangeEvent<HTMLInputElement>) => {
    setError(null);
    setText((t) => ({ ...t, [key]: e.target.value }));
  };
  const preview = readBarcodeFood(text);

  async function save() {
    const read = readBarcodeFood(text);
    if (!read.ok) return setError(read.error);
    const { name, brand, protein, carbs, fat } = read.fields;
    await run(() => correctScannedFood(food.id, { name, brand, protein, carbs, fat }), { success: 'Product corrected for everyone.', refresh: false, onDone });
  }

  return (
    <div className="mt-2 space-y-2 rounded-xl bg-black/[.03] p-3 dark:bg-white/5">
      <p className="text-xs text-zinc-500">
        Fix what the pack says, per 100 g. Every member gets the change, at both gyms, and days that already include this product count the
        corrected figures.
      </p>
      <div className="grid gap-1.5 sm:grid-cols-2">
        <input value={text.name} onChange={set('name')} maxLength={BARCODE_FOOD_NAME_MAX} aria-label="Product name" placeholder="Name" className={inputCls} />
        <input value={text.brand} onChange={set('brand')} maxLength={BARCODE_FOOD_BRAND_MAX} aria-label="Brand" placeholder="Brand (optional)" className={inputCls} />
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {(['protein', 'carbs', 'fat'] as const).map((key) => (
          <label key={key} className="flex items-center gap-1 text-xs text-zinc-500">
            <input value={text[key]} onChange={set(key)} inputMode="decimal" aria-label={`${key} per 100 g`} className={`${inputCls} !w-20 text-center`} />
            g {key}
          </label>
        ))}
        <span className="text-xs text-zinc-500">per 100 g{preview.ok ? ` · ${Math.round(preview.per100.calories)} kcal` : ''}</span>
      </div>
      {error && <p className="text-xs font-semibold text-danger">{error}</p>}
      <div className="flex gap-2">
        <Button variant="primary" size="sm" disabled={busy} onClick={save}>
          Save correction
        </Button>
        <Button variant="outline" size="sm" disabled={busy} onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

// What a food's servings are, as a coach edits them: "1 egg = 50 g". The database keeps them on the food, so every member sees the change.
function ServingsEditor({ food, onDone, onCancel }: { food: FoodRow; onDone: () => void; onCancel: () => void }) {
  const { run, busy } = useAction();
  const [rows, setRows] = useState<ServingDraft[]>(
    (food.serving_options ?? []).map((o) => ({ label: o.label, grams: String(o.grams), isDefault: o.default === true }))
  );
  const [error, setError] = useState<string | null>(null);
  const set = (i: number, patch: Partial<ServingDraft>) => {
    setError(null);
    setRows((prev) => prev.map((r, j) => (j === i ? { ...r, ...patch } : patch.isDefault ? { ...r, isDefault: false } : r)));
  };

  async function save(clear: boolean) {
    const cleaned = clear ? null : cleanServings(rows);
    if (cleaned && !cleaned.ok) return setError(cleaned.error);
    await run(() => setFoodServings(food.id, cleaned && cleaned.ok && cleaned.options.length > 0 ? cleaned.options : null), {
      success: 'Servings saved.',
      refresh: false,
      onDone,
    });
  }

  return (
    <div className="mt-2 space-y-2 rounded-xl bg-black/[.03] p-3 dark:bg-white/5">
      <p className="text-xs text-zinc-500">
        What one serving of this food is, e.g. egg = 50 g. Members pick from these; grams is always there too. The default one shows first.
      </p>
      {rows.map((r, i) => (
        <div key={i} className="flex flex-wrap items-center gap-1.5">
          <input
            value={r.label}
            onChange={(e) => set(i, { label: e.target.value })}
            placeholder="egg"
            aria-label="Serving name"
            maxLength={30}
            className={`${inputCls} !w-32`}
          />
          <span className="text-xs text-zinc-500">=</span>
          <input
            value={r.grams}
            onChange={(e) => set(i, { grams: e.target.value })}
            inputMode="decimal"
            placeholder="50"
            aria-label="Grams in one serving"
            className={`${inputCls} !w-20 text-center`}
          />
          <span className="text-xs text-zinc-500">g</span>
          <label className="flex items-center gap-1 text-xs text-zinc-500">
            <input type="radio" name={`default-${food.id}`} checked={r.isDefault} onChange={() => set(i, { isDefault: true })} />
            default
          </label>
          <button type="button" className="text-xs text-zinc-400 hover:text-danger" onClick={() => setRows((prev) => prev.filter((_, j) => j !== i))}>
            Remove
          </button>
        </div>
      ))}
      {rows.length < MAX_SERVINGS && (
        <button type="button" className="text-xs text-accent hover:underline" onClick={() => setRows((prev) => [...prev, { label: '', grams: '', isDefault: prev.length === 0 }])}>
          + Add a serving
        </button>
      )}
      {error && <p className="text-xs font-semibold text-danger">{error}</p>}
      <div className="flex gap-2">
        <Button variant="primary" size="sm" disabled={busy} onClick={() => save(false)}>
          Save
        </Button>
        {(food.serving_options?.length ?? 0) > 0 && (
          <Button variant="outline" size="sm" disabled={busy} onClick={() => save(true)}>
            Clear all
          </Button>
        )}
        <Button variant="outline" size="sm" disabled={busy} onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

// Foods that members added by scanning a barcode (M12), or typed in from the pack when nobody had the product (owner's list item 6, 0173).
// The first one for a product is shared with everyone, so a wrong entry stays wrong until a coach corrects it or takes it off the list.
// Hiding removes it from every member's search, favourites and scans; it can be brought back.
const SCOPES = { scanned: 'Scanned products', members: 'Added by members', all: 'All foods' } as const;
type Scope = keyof typeof SCOPES;

export function FoodsPane() {
  const [query, setQuery] = useState('');
  const [foods, setFoods] = useState<ListedFood[] | null>(null);
  const [failed, setFailed] = useState(false);
  // Scanned products, the ones this gym's members typed in (newest first, to check), or every food (to set the servings on an egg).
  const [scope, setScope] = useState<Scope>('scanned');
  // The food whose servings or figures are open, and which.
  const [editing, setEditing] = useState<string | null>(null);
  const [correcting, setCorrecting] = useState<string | null>(null);
  const [reloads, setReloads] = useState(0);
  const { run, busy } = useAction();
  const confirm = useConfirm();
  const latest = useRef(0);

  // Looks up after a short pause in typing, and ignores an answer that arrives after a newer search was sent.
  useEffect(() => {
    const ticket = ++latest.current;
    const timer = setTimeout(() => {
      (scope === 'all'
        ? query.trim().length >= 2
          ? searchAllFoodsForCoach(query)
          : Promise.resolve([])
        : scope === 'members'
          ? listMemberAddedFoods(query)
          : searchScannedFoods(query)
      )
        .then((rows: ListedFood[]) => {
          if (ticket !== latest.current) return;
          setFailed(false);
          setFoods(rows);
        })
        .catch(() => {
          if (ticket !== latest.current) return;
          setFailed(true);
          setFoods((prev) => prev ?? []);
        });
    }, 250);
    return () => clearTimeout(timer);
  }, [query, reloads, scope]);

  async function toggle(food: FoodRow) {
    const hide = !food.hidden;
    if (hide) {
      const sure = await confirm({
        title: `Hide ${food.name}?`,
        body: 'Members will no longer find it by search or by scanning its barcode, and it leaves their favourites. Days that already include it keep it.',
        confirmLabel: 'Hide it',
      });
      if (!sure) return;
    }
    await run(() => setFoodHidden(food.id, hide), {
      success: hide ? 'Hidden from members.' : 'Back on the food list.',
      refresh: false,
      onDone: () => setReloads((n) => n + 1),
    });
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-extrabold text-black dark:text-zinc-50">Foods</h2>
        <p className="mt-1 max-w-3xl text-sm text-zinc-500 dark:text-zinc-400">
          Set the servings a food comes in (1 egg, 1 rasher, 1 tbsp) so members can log by serving instead of grams. Products members scanned, or typed in
          from the pack when nobody had them, also show here and are shared with every member; if one has the wrong numbers, correct it, or hide it so
          nobody logs it by mistake.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {(Object.keys(SCOPES) as Scope[]).map((sc) => (
            <button
              key={sc}
              type="button"
              onClick={() => {
                setScope(sc);
                setFoods(null);
                setEditing(null);
                setCorrecting(null);
              }}
              aria-pressed={scope === sc}
              className={`h-11 rounded-full px-4 text-sm font-bold ${
                scope === sc
                  ? 'bg-[#1d1d1b] text-white dark:bg-zinc-100 dark:text-[#1d1d1b]'
                  : 'border border-black/[.14] bg-card text-black hover:bg-black/[.03] dark:border-white/15 dark:text-zinc-50'
              }`}
            >
              {SCOPES[sc]}
            </button>
          ))}
        </div>
      </div>
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={scope === 'all' ? 'Search any food (2+ letters)' : 'Search by name, brand or barcode'}
        aria-label="Search foods"
        className="h-11 w-full rounded-xl border border-black/[.16] bg-card px-3.5 text-base sm:max-w-md sm:text-[15px] dark:border-white/15"
      />
      {failed && <p className="text-sm text-danger">Could not load the foods. Try again in a moment.</p>}
      {foods === null ? (
        <p className="text-sm text-zinc-500">Loading…</p>
      ) : foods.length === 0 ? (
        <EmptyState
          icon={ScanBarcode}
          title={query.trim() ? 'No food matches that' : scope === 'all' ? 'Search for a food' : scope === 'members' ? 'No products added by members yet' : 'No scanned foods yet'}
          hint={
            scope === 'all'
              ? 'Type at least two letters.'
              : scope === 'members'
                ? 'Products your gym’s members type in from the pack, when nobody had them yet, appear here newest first.'
                : 'Products appear here once a member scans their barcode.'
          }
        />
      ) : (
        <ul className="divide-y divide-black/[.07] overflow-hidden rounded-[20px] border border-black/[.08] bg-card dark:divide-white/10 dark:border-white/10">
          {foods.map((f) => (
            <li key={f.id} data-stagger className="px-5 py-3 sm:px-6">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2">
                    <span className={`truncate text-[15px] font-bold ${f.hidden ? 'text-zinc-400 line-through' : 'text-black dark:text-zinc-50'}`}>{f.name}</span>
                    <span
                      className={`inline-flex h-5 items-center rounded-full px-2 text-[11px] font-extrabold ${
                        f.source === 'scan' ? 'bg-accent-soft text-accent' : 'bg-black/[.06] text-zinc-600 dark:bg-white/10 dark:text-zinc-300'
                      }`}
                    >
                      {f.source === 'scan' ? (f.addition?.typed ? 'Typed in' : 'Barcode') : 'Built in'}
                    </span>
                  </p>
                  <p className="text-[13px] text-zinc-500 dark:text-zinc-400">
                    {f.brand ? `${f.brand} · ` : ''}per 100 g: {per100(f.protein)} protein · {per100(f.carbs)} carbs · {per100(f.fat)} fat
                    {f.barcode ? ` · ${f.barcode}` : ''}
                  </p>
                  {f.addition && <p className="text-[13px] text-zinc-500 dark:text-zinc-400">{addedLine(f.addition)}</p>}
                  <p className="text-[13px] text-zinc-500 dark:text-zinc-400">
                    Servings:{' '}
                    {f.serving_options?.length
                      ? f.serving_options.map((o) => `${unitText(o)}${o.default ? ' (default)' : ''}`).join(', ')
                      : 'none (grams only)'}
                  </p>
                  {f.hidden && <p className="text-xs font-medium text-warning">Hidden from members</p>}
                </div>
                <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
                  {!f.hidden && f.source === 'scan' && (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={busy}
                      onClick={() => {
                        setEditing(null);
                        setCorrecting(correcting === f.id ? null : f.id);
                      }}
                    >
                      Correct
                    </Button>
                  )}
                  {!f.hidden && (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={busy}
                      onClick={() => {
                        setCorrecting(null);
                        setEditing(editing === f.id ? null : f.id);
                      }}
                    >
                      Servings
                    </Button>
                  )}
                  {f.source === 'scan' && (
                    <Button variant={f.hidden ? 'outline' : 'danger'} size="sm" disabled={busy} onClick={() => toggle(f)}>
                      {f.hidden ? 'Show again' : 'Hide'}
                    </Button>
                  )}
                </div>
              </div>
              {correcting === f.id && (
                <CorrectEditor
                  key={f.id}
                  food={f}
                  onCancel={() => setCorrecting(null)}
                  onDone={() => {
                    setCorrecting(null);
                    setReloads((n) => n + 1);
                  }}
                />
              )}
              {editing === f.id && (
                <ServingsEditor
                  food={f}
                  onCancel={() => setEditing(null)}
                  onDone={() => {
                    setEditing(null);
                    setReloads((n) => n + 1);
                  }}
                />
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
