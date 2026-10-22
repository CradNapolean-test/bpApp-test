'use client';

import { useEffect, useState } from 'react';
import { BottomSheet } from '@/app/_components/BottomSheet';
import { getDailyLogs } from '@/lib/data/dailyLogs';
import { copySourceDays, copyTargetDays, dayLabel, type DiaryCopyRequest } from '@/lib/diaryCopy';
import type { MealSectionRow } from '@/lib/data/types';

export type CopyScope = { kind: 'day' } | { kind: 'meal'; section: MealSectionRow };

// Copy a day's food, or one meal, from another day into the one on screen ("into"), or from the one on screen to another day ("out").
// Tapping a day does it; the screen reports whether it worked and the sheet closes only if it did. A meal can also go into a different
// meal (Lunch to Dinner), picked above the list.
export function CopyFoodSheet({
  scope,
  sections,
  clientId,
  viewingDate,
  todayIso,
  hasFood,
  onCopy,
  onClose,
}: {
  scope: CopyScope;
  sections: MealSectionRow[];
  clientId: string;
  viewingDate: string;
  todayIso: string;
  // Whether there is anything on the screen's day (or in the meal) to copy out.
  hasFood: boolean;
  onCopy: (request: DiaryCopyRequest) => Promise<boolean>;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<'into' | 'out'>('into');
  const [otherSectionId, setOtherSectionId] = useState(scope.kind === 'meal' ? scope.section.id : '');
  const [busy, setBusy] = useState(false);
  // Calories of each day that has food (a day without a figure has nothing logged), so a day with nothing to copy can be greyed out.
  const [calories, setCalories] = useState<Map<string, number | null> | null>(null);

  useEffect(() => {
    let cancelled = false;
    const days = copySourceDays(todayIso);
    getDailyLogs(clientId, days[days.length - 1], days[0])
      .then((rows) => {
        if (!cancelled) setCalories(new Map(rows.map((r) => [r.log_date, r.calories])));
      })
      .catch(() => {
        // Without the figures every day is simply offered; a day with nothing on it says so when tapped.
      });
    return () => {
      cancelled = true;
    };
  }, [clientId, todayIso]);

  const meal = scope.kind === 'meal' ? scope.section : null;
  const viewed = dayLabel(viewingDate, todayIso, true);
  const where = meal ? meal.label : 'this day';
  // The viewed day is only a choice when the other end is a different meal (Lunch to Dinner on the same day).
  const sameMeal = !meal || otherSectionId === meal.id;
  const days = (tab === 'into' ? copySourceDays(todayIso) : copyTargetDays(todayIso)).filter((d) => d !== viewingDate || !sameMeal);

  async function pick(date: string) {
    if (busy) return;
    setBusy(true);
    try {
      const request: DiaryCopyRequest =
        tab === 'into'
          ? { fromDate: date, toDate: viewingDate, ...(meal && { fromSectionId: otherSectionId, toSectionId: meal.id }) }
          : { fromDate: viewingDate, toDate: date, ...(meal && { fromSectionId: meal.id, toSectionId: otherSectionId }) };
      if (await onCopy(request)) onClose();
    } finally {
      setBusy(false);
    }
  }

  const tabCls = (active: boolean) =>
    `flex-1 rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors ${
      active ? 'bg-[var(--background)] text-black shadow-[0_1px_3px_rgba(0,0,0,.1)] dark:text-zinc-50' : 'text-zinc-500 hover:text-black dark:hover:text-zinc-300'
    }`;

  return (
    <BottomSheet title={meal ? `Copy ${meal.label}` : 'Copy food'} onClose={onClose}>
      <div className="space-y-4">
        <div className="flex gap-1 rounded-xl bg-black/5 p-1 dark:bg-white/5">
          <button type="button" aria-pressed={tab === 'into'} onClick={() => setTab('into')} className={tabCls(tab === 'into')}>
            Copy from…
          </button>
          <button type="button" aria-pressed={tab === 'out'} onClick={() => setTab('out')} className={tabCls(tab === 'out')}>
            Copy to…
          </button>
        </div>

        {meal && (
          <label className="block space-y-1">
            <span className="text-xs font-semibold text-zinc-500">{tab === 'into' ? 'From the meal' : 'Into the meal'}</span>
            <select
              value={otherSectionId}
              onChange={(e) => setOtherSectionId(e.target.value)}
              className="w-full rounded-xl border border-black/10 bg-transparent px-3 py-2.5 text-base dark:border-white/10"
            >
              {sections.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
        )}

        <p className="text-sm text-zinc-500">
          {tab === 'into' ? `Pick the day to copy into ${where} (${viewed}).` : `Pick the day to copy ${where} (${viewed}) to.`}
        </p>

        {tab === 'out' && !hasFood ? (
          <p className="rounded-xl bg-card-muted px-3 py-3 text-sm text-zinc-600 dark:text-zinc-400">
            {meal ? `Nothing in ${meal.label} yet, so there is nothing to copy.` : 'Nothing logged on this day yet, so there is nothing to copy.'}
          </p>
        ) : (
          <ul aria-busy={busy} className={`divide-y divide-black/5 dark:divide-white/5 ${busy ? 'pointer-events-none opacity-60' : ''}`}>
            {days.map((date) => {
              const kcal = calories?.get(date) ?? null;
              const empty = calories != null && kcal == null;
              const disabled = tab === 'into' && empty;
              return (
                <li key={date}>
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => pick(date)}
                    className="flex w-full items-center justify-between gap-3 py-3 text-left disabled:cursor-default disabled:opacity-40"
                  >
                    <span className="text-sm font-semibold text-black dark:text-zinc-50">{dayLabel(date, todayIso)}</span>
                    <span className="text-xs text-zinc-500">
                      {kcal != null ? `${Math.round(kcal).toLocaleString('en-GB')} kcal${tab === 'out' ? ' already' : ''}` : empty ? 'Nothing logged' : ''}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </BottomSheet>
  );
}
