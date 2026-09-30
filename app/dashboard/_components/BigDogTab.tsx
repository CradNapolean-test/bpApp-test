'use client';

import { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { useAction } from '@/app/_components/useAction';
import { recordBigDogResult } from '@/lib/data/bigDog';
import {
  bigDogCount,
  currentLevels,
  EXERCISES,
  genderFromProfile,
  LEVEL_LABEL,
  nextTierLabel,
  TIER_THRESHOLDS,
  TIER_TITLE,
  tierForCount,
} from '@/lib/bigDog';
import type { BigDogGender, BigDogLevel, BigDogResultLike, BigDogTier } from '@/lib/bigDog';
import type { BigDogResultRow, ClientProfileRow } from '@/lib/data/types';

// Pip / label colours per T-shirt tier (white, turquoise = brand teal, silver, gold).
const TIER_PIP: Record<BigDogTier, string> = {
  none: 'bg-black/10 dark:bg-white/10',
  white: 'bg-zinc-200',
  turquoise: 'bg-accent',
  silver: 'bg-zinc-400',
  gold: 'bg-amber-500',
};

export function TierPips({ count, className = '' }: { count: number; className?: string }) {
  const tier = tierForCount(count);
  return (
    <div className={`flex gap-1 ${className}`}>
      {EXERCISES.map((e, i) => (
        <div key={e.key} className={`h-[5px] flex-1 rounded-full ${i < count ? TIER_PIP[tier] : TIER_PIP.none}`} />
      ))}
    </div>
  );
}

// Compact card shown on the profile -- taps through to the full standards screen.
export function BigDogCard({ results, onOpen }: { results: BigDogResultLike[]; onOpen: () => void }) {
  const count = bigDogCount(results);
  return (
    <button
      type="button"
      onClick={onOpen}
      className="block w-full rounded-2xl border border-accent/30 bg-accent-soft p-3.5 text-left"
    >
      <div className="mb-2.5 flex items-center justify-between">
        <div>
          <p className="text-xs font-extrabold text-black dark:text-zinc-50">{TIER_TITLE[tierForCount(count)]}</p>
          <p className="mt-0.5 text-[10px] text-zinc-500">
            {count} of {EXERCISES.length} · {nextTierLabel(count)}
          </p>
        </div>
        <span className="flex items-center gap-0.5 text-[10px] font-bold text-accent">
          View all <ChevronRight className="h-3.5 w-3.5" />
        </span>
      </div>
      <TierPips count={count} />
    </button>
  );
}

const LEVEL_BADGE: Record<BigDogLevel, string> = {
  big_dog: 'bg-accent/15 text-accent',
  strong: 'bg-black/10 text-zinc-700 dark:bg-white/10 dark:text-zinc-300',
  rookie: 'bg-zinc-500/15 text-zinc-500',
  none: 'bg-black/5 text-zinc-400 dark:bg-white/5 dark:text-zinc-600',
};

const RECORD_LEVELS: BigDogLevel[] = ['none', 'rookie', 'strong', 'big_dog'];

export function BigDogTab({
  clientId,
  profile,
  results,
  canRecord,
}: {
  clientId: string;
  profile: ClientProfileRow | null;
  results: BigDogResultRow[];
  // Coaches record results for their own clients; members only view.
  canRecord: boolean;
}) {
  const { run, busy } = useAction();
  const [gender, setGender] = useState<BigDogGender>(genderFromProfile(profile?.gender));
  const [editing, setEditing] = useState<string | null>(null);
  const [resultText, setResultText] = useState('');

  const current = currentLevels(results);
  const count = bigDogCount(results);
  const tier = tierForCount(count);

  async function save(exerciseKey: string, level: BigDogLevel) {
    await run(() => recordBigDogResult(clientId, exerciseKey, level, resultText), {
      success: 'Result saved',
      onDone: () => {
        setEditing(null);
        setResultText('');
      },
    });
  }

  const tierLabels: { label: string; min: number }[] = [
    { label: 'White', min: TIER_THRESHOLDS.white },
    { label: 'Turquoise', min: TIER_THRESHOLDS.turquoise },
    { label: 'Silver', min: TIER_THRESHOLDS.silver },
    { label: 'Gold', min: TIER_THRESHOLDS.gold },
  ];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between rounded-2xl border border-accent/30 bg-[var(--background)] px-3.5 py-3">
        <div>
          <p className="text-[13px] font-extrabold text-black dark:text-zinc-50">{TIER_TITLE[tier]}</p>
          <p className="mt-0.5 text-[10px] text-zinc-500">{nextTierLabel(count)}</p>
        </div>
        <div className="text-right">
          <p className="text-xl font-black leading-none text-accent">{count}</p>
          <p className="text-[10px] text-zinc-500">of {EXERCISES.length} BD</p>
        </div>
      </div>

      <div>
        <TierPips count={count} className="mb-1.5" />
        <div className="flex justify-between text-[8px] font-bold">
          <span className="text-zinc-400">Rookie</span>
          {tierLabels.map((t) => (
            <span key={t.label} className={count >= t.min ? 'text-accent' : 'text-zinc-400'}>
              {t.label}
            </span>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between">
        <p className="px-1 text-[9px] font-extrabold uppercase tracking-[2px] text-zinc-500">All exercises</p>
        <div className="flex gap-0.5 rounded-full border border-black/10 p-0.5 dark:border-white/10">
          {(['male', 'female'] as const).map((g) => (
            <button
              key={g}
              type="button"
              onClick={() => setGender(g)}
              className={`rounded-full px-3 py-1 text-[10px] font-extrabold ${
                gender === g ? 'bg-accent text-accent-foreground' : 'text-zinc-500'
              }`}
            >
              {g === 'male' ? 'Male' : 'Female'}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-1.5">
        {EXERCISES.map((ex) => {
          const std = ex[gender];
          const row = current[ex.key];
          const level: BigDogLevel = row?.level ?? 'none';
          const reached = { rookie: 1, strong: 2, big_dog: 3, none: 0 }[level];
          const isEditing = editing === ex.key;
          return (
            <div
              key={ex.key}
              className={`rounded-2xl border p-3 ${
                level === 'big_dog' ? 'border-accent/30 bg-accent-soft' : 'border-black/[.06] bg-[var(--background)] dark:border-white/10'
              }`}
            >
              <div className="mb-2 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs font-extrabold text-black dark:text-zinc-50">{ex.name}</p>
                  <p className="text-[9px] text-zinc-500">
                    {ex.category}
                    {row?.result_text && level !== 'none' ? ` · best ${row.result_text}` : ''}
                  </p>
                </div>
                <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[9px] font-extrabold ${LEVEL_BADGE[level]}`}>
                  {LEVEL_LABEL[level]}
                </span>
              </div>
              <div className="flex gap-1">
                {(
                  [
                    ['Rookie', std.rookie, 1],
                    ['Strong', std.strong, 2],
                    ['Big Dog', std.bigDog, 3],
                  ] as const
                ).map(([label, value, n]) => (
                  <div
                    key={label}
                    className={`flex-1 rounded-lg border px-1.5 py-1 text-center ${
                      n === 3 ? 'bg-accent/10' : 'bg-black/[.03] dark:bg-white/[.04]'
                    } ${reached >= n ? (n === 3 ? 'border-accent' : 'border-zinc-400') : 'border-transparent'}`}
                  >
                    <p className={`text-[8px] font-bold uppercase tracking-wide ${n === 3 ? 'text-accent' : 'text-zinc-500'}`}>{label}</p>
                    <p className={`text-[10px] font-extrabold ${n === 3 ? 'text-accent' : 'text-zinc-700 dark:text-zinc-300'}`}>{value}</p>
                  </div>
                ))}
              </div>

              {canRecord && (
                <div className="mt-2">
                  {!isEditing ? (
                    <button
                      type="button"
                      onClick={() => {
                        setEditing(ex.key);
                        setResultText(row?.result_text ?? '');
                      }}
                      className="text-[11px] font-bold text-accent"
                    >
                      Record result
                    </button>
                  ) : (
                    <div className="space-y-2">
                      <input
                        value={resultText}
                        onChange={(e) => setResultText(e.target.value)}
                        placeholder="Result achieved, e.g. 142kg or 7:12 (optional)"
                        className="w-full rounded-lg border border-black/10 bg-transparent px-2.5 py-1.5 text-xs dark:border-white/15"
                      />
                      <div className="flex flex-wrap gap-1.5">
                        {RECORD_LEVELS.map((l) => (
                          <button
                            key={l}
                            type="button"
                            disabled={busy}
                            onClick={() => save(ex.key, l)}
                            className={`rounded-full px-3 py-1 text-[10px] font-extrabold disabled:opacity-50 ${
                              l === 'big_dog' ? 'bg-accent text-accent-foreground' : 'bg-black/10 text-zinc-700 dark:bg-white/10 dark:text-zinc-300'
                            }`}
                          >
                            {l === 'none' ? 'Clear' : LEVEL_LABEL[l]}
                          </button>
                        ))}
                        <button type="button" onClick={() => setEditing(null)} className="px-2 text-[10px] font-bold text-zinc-500">
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
