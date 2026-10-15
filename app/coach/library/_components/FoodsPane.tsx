'use client';

import { useEffect, useRef, useState } from 'react';
import { ScanBarcode } from 'lucide-react';
import { Button } from '@/app/_components/Button';
import { EmptyState } from '@/app/_components/EmptyState';
import { useAction } from '@/app/_components/useAction';
import { useConfirm } from '@/app/_components/ConfirmDialog';
import { inputCls } from '@/app/_components/ui';
import { searchScannedFoods, setFoodHidden } from '@/lib/data/foods';
import type { FoodRow } from '@/lib/data/types';

// Per 100 g, which is how packaging reads (the database keeps it per gram).
const per100 = (n: number) => Math.round(n * 1000) / 10;

// Foods that members added by scanning a barcode (M12). The first scan of a product is cached for everyone, so a wrong entry stays wrong
// until someone takes it off the list. Hiding removes it from every member's search, favourites and scans; it can be brought back.
export function FoodsPane() {
  const [query, setQuery] = useState('');
  const [foods, setFoods] = useState<FoodRow[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [reloads, setReloads] = useState(0);
  const { run, busy } = useAction();
  const confirm = useConfirm();
  const latest = useRef(0);

  // Looks up after a short pause in typing, and ignores an answer that arrives after a newer search was sent.
  useEffect(() => {
    const ticket = ++latest.current;
    const timer = setTimeout(() => {
      searchScannedFoods(query)
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
  }, [query, reloads]);

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
        <h2 className="text-base font-bold text-black dark:text-zinc-50">Scanned foods</h2>
        <p className="mt-1 text-sm text-zinc-500">
          Products members added by scanning a barcode. If one has the wrong numbers, hide it so nobody logs it by mistake.
        </p>
      </div>
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search by name or barcode"
        aria-label="Search scanned foods"
        className={inputCls}
      />
      {failed && <p className="text-sm text-danger">Could not load the foods. Try again in a moment.</p>}
      {foods === null ? (
        <p className="text-sm text-zinc-500">Loading…</p>
      ) : foods.length === 0 ? (
        <EmptyState icon={ScanBarcode} title={query.trim() ? 'No scanned food matches that' : 'No scanned foods yet'} hint="Products appear here once a member scans their barcode." />
      ) : (
        <ul className="divide-y divide-black/[.05] rounded-2xl border border-black/[.05] bg-card dark:divide-white/10 dark:border-white/10">
          {foods.map((f) => (
            <li key={f.id} className="flex items-center justify-between gap-3 p-3">
              <div className="min-w-0">
                <p className={`truncate text-sm font-semibold ${f.hidden ? 'text-zinc-400 line-through' : 'text-black dark:text-zinc-50'}`}>{f.name}</p>
                <p className="text-xs text-zinc-500">
                  per 100 g: {per100(f.protein)} protein · {per100(f.carbs)} carbs · {per100(f.fat)} fat
                  {f.barcode ? ` · ${f.barcode}` : ''}
                </p>
                {f.hidden && <p className="text-xs font-medium text-warning">Hidden from members</p>}
              </div>
              <Button variant={f.hidden ? 'outline' : 'danger'} size="sm" disabled={busy} onClick={() => toggle(f)}>
                {f.hidden ? 'Show again' : 'Hide'}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
