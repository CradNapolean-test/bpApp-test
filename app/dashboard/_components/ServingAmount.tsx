'use client';

import { useEffect, useId, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { countFromGrams, gramsFromCount, unitForAmount, unitText, unitsFor, type OwnUnitRow, type ServingOption } from '@/lib/utils/foodUnits';

// The member's own serving units ("my rasher = 30 g"), read once; the ones that come with a food are on the food itself. Without them the
// amount is still shown in grams.
function useMemberFoodUnits(enabled: boolean): OwnUnitRow[] {
  const [rows, setRows] = useState<OwnUnitRow[]>([]);
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const { data: auth } = await supabase.auth.getUser();
      if (cancelled || !auth.user) return;
      const { data } = await supabase.from('member_food_units').select('id, food_id, label, grams').eq('client_id', auth.user.id);
      if (!cancelled && data) setRows(data.map((r) => ({ ...r, grams: Number(r.grams) })) as OwnUnitRow[]);
    })().catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [enabled]);
  return rows;
}

// How much of a food, for the sheets that change an amount already chosen (an entry in the diary, the amount asked after a scan, a planned
// meal, a recipe ingredient). The same way the Add food list does it: a Serving drop-down (grams, or the food's own servings such as
// "egg (50 g)") and a number of them. `value` stays grams (or portions, for a food that is not per gram); the box only shows it in the unit.
export function ServingAmount({
  food,
  value,
  onChange,
  unitLabel,
  inputClassName,
  autoFocus = false,
}: {
  food: { id: string; portion: string | null; serving_options?: ServingOption[] | null } | null;
  value: number;
  onChange: (value: number) => void;
  // What the amount is when no serving is chosen: "grams", or "× 1 Egg" for a food counted in its own portion.
  unitLabel: string;
  inputClassName: string;
  autoFocus?: boolean;
}) {
  const id = useId();
  const perGram = food?.portion === '1 gram';
  const own = useMemberFoodUnits(perGram);
  const units = perGram && food ? unitsFor(food, own) : [];
  // Opens on the serving the amount is a neat count of; the member's own choice takes over once they pick.
  const [opening] = useState(value);
  const [chosen, setChosen] = useState<string | null | undefined>(undefined);
  const unit = (chosen === undefined ? unitForAmount(units, opening) : units.find((u) => u.key === chosen)) ?? null;
  // The box can be emptied while typing (counts as 0) and shows the real number again on blur.
  const [draft, setDraft] = useState<string | null>(null);
  const shown = unit ? countFromGrams(value, unit) : value;

  return (
    <div className="space-y-3">
      {units.length > 0 && (
        <div className="space-y-1">
          <label className="text-xs font-medium text-zinc-500" htmlFor={`${id}-serving`}>
            Serving
          </label>
          <select
            id={`${id}-serving`}
            value={unit?.key ?? ''}
            onChange={(e) => {
              setDraft(null);
              setChosen(e.target.value === '' ? null : e.target.value);
            }}
            className={inputClassName}
          >
            <option value="">grams (g)</option>
            {units.map((u) => (
              <option key={u.key} value={u.key}>
                {unitText(u)}
              </option>
            ))}
          </select>
        </div>
      )}
      <div className="space-y-1">
        <label className="text-xs font-medium text-zinc-500" htmlFor={`${id}-amount`}>
          {unit ? `How many (${unit.label})` : `Quantity (${unitLabel})`}
        </label>
        <input
          id={`${id}-amount`}
          type="number"
          inputMode="decimal"
          min={0}
          step="any"
          autoFocus={autoFocus}
          value={draft ?? String(shown)}
          onChange={(e) => {
            setDraft(e.target.value);
            const n = e.target.value === '' ? 0 : Math.max(0, Number(e.target.value));
            onChange(unit ? gramsFromCount(n, unit) : n);
          }}
          onBlur={() => setDraft(null)}
          className={inputClassName}
        />
        {unit && <p className="text-xs text-zinc-500">= {Math.round(value * 10) / 10} g</p>}
      </div>
    </div>
  );
}
