'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '@/app/_components/Button';
import {
  BARCODE_FOOD_BRAND_MAX,
  BARCODE_FOOD_NAME_MAX,
  EMPTY_BARCODE_FOOD,
  readBarcodeFood,
  type BarcodeFoodFields,
  type BarcodeFoodText,
  type PackBasis,
} from '@/lib/utils/barcodeFoods';
import { MAX_UNIT_LABEL } from '@/lib/utils/foodUnits';

// "Add this product" (owner's list item 6): a scan found nothing in the food list or on Open Food Facts, so the member adds it from the
// pack. It goes into the shared food list straight away (migration 0173), so the next person who scans it gets it. The checks are in
// lib/utils/barcodeFoods.ts; the database checks them again. `onSave` returns a message to show when it could not be added.
export function AddBarcodeFoodForm({
  barcode,
  initialName,
  onSave,
  onCancel,
}: {
  barcode: string;
  initialName: string;
  onSave: (fields: BarcodeFoodFields) => Promise<string | null>;
  onCancel: () => void;
}) {
  const [text, setText] = useState<BarcodeFoodText>({ ...EMPTY_BARCODE_FOOD, name: initialName });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // The form appears where the screen keeps its scan panel, which may be off screen after the scanner closes: bring it into view and
  // start at the name.
  const formRef = useRef<HTMLFormElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    formRef.current?.scrollIntoView({ block: 'nearest' });
    nameRef.current?.focus({ preventScroll: true });
  }, []);
  const set = (key: Exclude<keyof BarcodeFoodText, 'per'>) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setText((t) => ({ ...t, [key]: e.target.value }));
    setError(null);
  };
  const setPer = (per: PackBasis) => {
    setText((t) => ({ ...t, per }));
    setError(null);
  };
  const preview = readBarcodeFood(text);
  const serving = text.serving.trim() || 'serving';

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const read = readBarcodeFood(text);
    if (!read.ok) return setError(read.error);
    setSaving(true);
    const failure = await onSave(read.fields);
    setSaving(false);
    if (failure) setError(failure);
  }

  const inputCls = 'w-full rounded-xl border border-black/[.16] bg-transparent px-3 py-2 text-base dark:border-white/10';
  const labelCls = 'block space-y-1';
  const captionCls = 'text-xs font-medium text-zinc-500';
  const pill = (per: PackBasis, label: string) => (
    <button
      type="button"
      aria-pressed={text.per === per}
      onClick={() => setPer(per)}
      className={`min-h-9 flex-1 rounded-md px-3 text-xs font-semibold transition-colors ${
        text.per === per ? 'bg-[var(--background)] text-black shadow-[0_1px_3px_rgba(0,0,0,.1)] dark:text-zinc-50' : 'text-zinc-500 hover:text-black dark:hover:text-zinc-300'
      }`}
    >
      {label}
    </button>
  );

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="space-y-3 rounded-[20px] border border-black/[.08] bg-card p-4 dark:border-white/10">
      <div>
        <p className="text-[15px] font-bold text-black dark:text-zinc-50">Add this product</p>
        <p className="text-xs text-zinc-500">
          Barcode {barcode} is not in the food list yet. Add it from the pack and it is saved for everyone: the next person who scans it gets it
          straight away. Coaches check new products and can correct them.
        </p>
      </div>
      <label className={labelCls}>
        <span className={captionCls}>Name</span>
        <input ref={nameRef} type="text" value={text.name} onChange={set('name')} maxLength={BARCODE_FOOD_NAME_MAX} placeholder="Salted caramel protein bar" className={inputCls} />
      </label>
      <label className={labelCls}>
        <span className={captionCls}>Brand (if there is one)</span>
        <input type="text" value={text.brand} onChange={set('brand')} maxLength={BARCODE_FOOD_BRAND_MAX} placeholder="optional" className={inputCls} />
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className={labelCls}>
          <span className={captionCls}>One serving is 1…</span>
          <input type="text" value={text.serving} onChange={set('serving')} maxLength={MAX_UNIT_LABEL} placeholder="bar" className={inputCls} />
        </label>
        <label className={labelCls}>
          <span className={captionCls}>{text.per === 'serving' ? 'It weighs (g)' : 'It weighs (g, if known)'}</span>
          <input type="number" inputMode="decimal" step="any" min={0} value={text.grams} onChange={set('grams')} placeholder={text.per === 'serving' ? '45' : 'optional'} className={inputCls} />
        </label>
      </div>
      <div>
        <p className={captionCls}>The figures I am reading are</p>
        <div className="mt-1 flex gap-1 rounded-xl bg-black/5 p-1 dark:bg-white/5">
          {pill('100g', 'Per 100 g')}
          {pill('serving', `Per ${serving}`)}
        </div>
      </div>
      <div className="grid grid-cols-3 gap-1.5">
        <input type="number" inputMode="decimal" step="any" min={0} value={text.protein} onChange={set('protein')} placeholder="protein g" aria-label="Protein in grams" className={inputCls} />
        <input type="number" inputMode="decimal" step="any" min={0} value={text.carbs} onChange={set('carbs')} placeholder="carbs g" aria-label="Carbs in grams" className={inputCls} />
        <input type="number" inputMode="decimal" step="any" min={0} value={text.fat} onChange={set('fat')} placeholder="fat g" aria-label="Fat in grams" className={inputCls} />
      </div>
      {preview.ok && (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          <span className="font-semibold text-black dark:text-zinc-50">{Math.round(preview.per100.calories)} kcal</span> per 100 g
          {preview.perServing && (
            <>
              {' · '}
              <span className="font-semibold text-black dark:text-zinc-50">{Math.round(preview.perServing.calories)} kcal</span> per {preview.perServing.label}
            </>
          )}
          . Check it is close to the pack.
        </p>
      )}
      {error && (
        <p role="alert" className="text-xs font-semibold text-danger">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <Button type="submit" variant="primary" size="sm" disabled={saving}>
          {saving ? 'Adding…' : 'Add for everyone'}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
