'use client';

import { useEffect, useRef, useState } from 'react';
import { ScanBarcode } from 'lucide-react';
import { Button } from '@/app/_components/Button';
import { EmptyState } from '@/app/_components/EmptyState';
import { useAction } from '@/app/_components/useAction';
import { useConfirm } from '@/app/_components/ConfirmDialog';
import { inputCls } from '@/app/_components/ui';
import { searchAllFoodsForCoach, searchScannedFoods, setFoodHidden, setFoodServings } from '@/lib/data/foods';
import type { FoodRow } from '@/lib/data/types';
import { MAX_SERVINGS, cleanServings, unitText, type ServingDraft } from '@/lib/utils/foodUnits';

// Per 100 g, which is how packaging reads (the database keeps it per gram).
const per100 = (n: number) => Math.round(n * 1000) / 10;

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

// Foods that members added by scanning a barcode (M12). The first scan of a product is cached for everyone, so a wrong entry stays wrong
// until someone takes it off the list. Hiding removes it from every member's search, favourites and scans; it can be brought back.
export function FoodsPane() {
  const [query, setQuery] = useState('');
  const [foods, setFoods] = useState<FoodRow[] | null>(null);
  const [failed, setFailed] = useState(false);
  // Scanned products only, or every food (to set the servings on an egg or a rasher of bacon).
  const [scope, setScope] = useState<'scanned' | 'all'>('scanned');
  const [editing, setEditing] = useState<string | null>(null);
  const [reloads, setReloads] = useState(0);
  const { run, busy } = useAction();
  const confirm = useConfirm();
  const latest = useRef(0);

  // Looks up after a short pause in typing, and ignores an answer that arrives after a newer search was sent.
  useEffect(() => {
    const ticket = ++latest.current;
    const timer = setTimeout(() => {
      (scope === 'all' ? (query.trim().length >= 2 ? searchAllFoodsForCoach(query) : Promise.resolve([])) : searchScannedFoods(query))
        .then((rows) => {
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
        <h2 className="text-base font-bold text-black dark:text-zinc-50">Foods</h2>
        <p className="mt-1 text-sm text-zinc-500">
          Set the servings a food comes in (1 egg, 1 rasher, 1 tbsp) so members can log by serving instead of grams. Products members scanned also show here; if one
          has the wrong numbers, hide it so nobody logs it by mistake.
        </p>
        <div className="mt-2 flex gap-1.5">
          {(['scanned', 'all'] as const).map((sc) => (
            <button
              key={sc}
              type="button"
              onClick={() => {
                setScope(sc);
                setFoods(null);
                setEditing(null);
              }}
              className={`rounded-full border px-2.5 py-0.5 text-xs ${
                scope === sc ? 'border-accent bg-accent-soft text-accent' : 'border-black/10 text-zinc-500 dark:border-white/10'
              }`}
            >
              {sc === 'scanned' ? 'Scanned products' : 'All foods'}
            </button>
          ))}
        </div>
      </div>
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={scope === 'all' ? 'Search any food (2+ letters)' : 'Search by name or barcode'}
        aria-label="Search scanned foods"
        className={inputCls}
      />
      {failed && <p className="text-sm text-danger">Could not load the foods. Try again in a moment.</p>}
      {foods === null ? (
        <p className="text-sm text-zinc-500">Loading…</p>
      ) : foods.length === 0 ? (
        <EmptyState icon={ScanBarcode} title={query.trim() ? 'No food matches that' : scope === 'all' ? 'Search for a food' : 'No scanned foods yet'} hint={scope === 'all' ? 'Type at least two letters.' : 'Products appear here once a member scans their barcode.'} />
      ) : (
        <ul className="divide-y divide-black/[.05] rounded-2xl border border-black/[.05] bg-card dark:divide-white/10 dark:border-white/10">
          {foods.map((f) => (
            <li key={f.id} className="p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className={`truncate text-sm font-semibold ${f.hidden ? 'text-zinc-400 line-through' : 'text-black dark:text-zinc-50'}`}>{f.name}</p>
                  <p className="text-xs text-zinc-500">
                    per 100 g: {per100(f.protein)} protein · {per100(f.carbs)} carbs · {per100(f.fat)} fat
                    {f.barcode ? ` · ${f.barcode}` : ''}
                  </p>
                  <p className="text-xs text-zinc-500">
                    Servings:{' '}
                    {f.serving_options?.length
                      ? f.serving_options.map((o) => `${unitText(o)}${o.default ? ' (default)' : ''}`).join(', ')
                      : 'none (grams only)'}
                  </p>
                  {f.hidden && <p className="text-xs font-medium text-warning">Hidden from members</p>}
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  {!f.hidden && (
                    <Button variant="outline" size="sm" disabled={busy} onClick={() => setEditing(editing === f.id ? null : f.id)}>
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
