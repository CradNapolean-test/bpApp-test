'use client';

import { useState } from 'react';
import { Check, ChevronRight, Trash2 } from 'lucide-react';
import { BottomSheet } from '@/app/_components/BottomSheet';
import { useAction } from '@/app/_components/useAction';
import { deleteMyBigDogScore, logMyBigDogScore, recordBigDogResult, verifyBigDogScore } from '@/lib/data/bigDog';
import {
  bestResult,
  bigDogCount,
  currentLevels,
  EXERCISES,
  formatResult,
  genderFromProfile,
  LEVEL_LABEL,
  levelForResult,
  levelRank,
  nextTarget,
  nextTierLabel,
  parseResultInput,
  TIER_THRESHOLDS,
  TIER_TITLE,
  tierForCount,
} from '@/lib/bigDog';
import type { BigDogExercise, BigDogGender, BigDogLevel, BigDogResultLike, BigDogTier } from '@/lib/bigDog';
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
          <p className="mt-0.5 text-[11px] text-zinc-500">
            {count} of {EXERCISES.length} · {nextTierLabel(count)}
          </p>
        </div>
        <span className="flex items-center gap-0.5 text-[11px] font-bold text-accent">
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

const fmtDate = (iso: string) => new Date(iso + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

// Log a score for one standard: type what you did, see the level it earns and how far the next one
// is, and look back at earlier attempts. A coach opens the same sheet to record a verified score or
// to verify one the member logged.
function ScoreSheet({
  clientId,
  exercise,
  gender,
  results,
  mode,
  onClose,
}: {
  clientId: string;
  exercise: BigDogExercise;
  gender: BigDogGender;
  results: BigDogResultRow[];
  mode: 'member' | 'coach';
  onClose: () => void;
}) {
  const { run, busy } = useAction();
  const [text, setText] = useState('');
  const [banded, setBanded] = useState(false);
  const std = exercise[gender];

  const value = exercise.kind === 'reps' && banded ? 0 : parseResultInput(exercise.kind, text);
  const level = value != null ? levelForResult(exercise, gender, value) : null;
  const target = level != null && value != null ? nextTarget(exercise, gender, level, value) : null;

  const history = results.filter((r) => r.exercise_key === exercise.key);
  const best = bestResult(history, exercise);
  const verifiedLevel = currentLevels(history.filter((r) => !r.self_reported))[exercise.key]?.level ?? 'none';
  const bestLevel = best?.result_value != null ? levelForResult(exercise, gender, best.result_value) : null;
  const pending = best?.self_reported && bestLevel != null && levelRank(bestLevel) > levelRank(verifiedLevel);

  const unitHint =
    exercise.kind === 'weight' ? 'kg' : exercise.kind === 'distance' ? 'm' : exercise.kind === 'reps' ? 'reps' : 'm:ss';
  const placeholder =
    exercise.kind === 'weight' ? 'e.g. 125' : exercise.kind === 'distance' ? 'e.g. 1210' : exercise.kind === 'reps' ? 'e.g. 5' : 'e.g. 8:42';

  async function save() {
    if (value == null) return;
    await run(
      () => (mode === 'coach' ? verifyBigDogScore(clientId, exercise.key, value) : logMyBigDogScore(clientId, exercise.key, value)),
      {
        success: mode === 'coach' ? 'Verified score recorded' : level === 'big_dog' ? 'Score logged — Big Dog! Your coach will check it' : 'Score logged',
        onDone: () => {
          setText('');
          setBanded(false);
        },
      }
    );
  }

  return (
    <BottomSheet title={exercise.name} onClose={onClose}>
      <p className="-mt-2 mb-3 text-xs text-zinc-500">{exercise.category} · targets for {gender === 'male' ? 'men' : 'women'}</p>

      <div className="mb-4 grid grid-cols-3 gap-1.5">
        {(
          [
            ['Rookie', std.rookie, 'rookie'],
            ['Strong', std.strong, 'strong'],
            ['Big Dog', std.bigDog, 'big_dog'],
          ] as const
        ).map(([label, v, key]) => (
          <div
            key={label}
            className={`rounded-xl border px-2 py-1.5 text-center ${
              bestLevel != null && levelRank(bestLevel) >= levelRank(key) ? 'border-accent/60 bg-accent-soft' : 'border-black/10 dark:border-white/10'
            }`}
          >
            <p className="text-[11px] font-bold uppercase tracking-wide text-zinc-500">{label}</p>
            <p className="text-sm font-extrabold text-black dark:text-zinc-50">{v}</p>
          </div>
        ))}
      </div>

      <label className="block">
        <span className="mb-1 block text-xs font-bold text-black dark:text-zinc-50">
          {mode === 'coach' ? 'Record a verified score' : 'Log a score'}{' '}
          <span className="font-medium text-zinc-500">({unitHint})</span>
        </span>
        <div className="flex gap-2">
          <input
            type="text"
            inputMode={exercise.kind === 'time' || exercise.kind === 'hold' ? 'numeric' : 'decimal'}
            value={banded ? 'Banded' : text}
            disabled={banded}
            onChange={(e) => setText(e.target.value)}
            placeholder={placeholder}
            className="h-12 min-w-0 flex-1 rounded-xl border border-black/10 bg-transparent px-4 text-lg font-extrabold outline-none focus:border-accent disabled:opacity-60 dark:border-white/10"
          />
          {exercise.kind === 'reps' && (
            <button
              type="button"
              aria-pressed={banded}
              onClick={() => setBanded((b) => !b)}
              className={`h-12 shrink-0 rounded-xl px-4 text-sm font-bold ${banded ? 'bg-accent text-accent-foreground' : 'border border-black/10 text-zinc-600 dark:border-white/10 dark:text-zinc-300'}`}
            >
              Banded
            </button>
          )}
        </div>
      </label>

      {level != null && value != null && (
        <div className="mt-2.5 rounded-xl bg-card-muted p-3 text-sm">
          <p className="font-semibold text-black dark:text-zinc-50">
            {formatResult(exercise.kind, value)} <span className="text-zinc-500">→</span>{' '}
            <span className={level === 'big_dog' ? 'text-accent' : ''}>{level === 'none' ? 'Below Rookie' : LEVEL_LABEL[level]}</span>
          </p>
          {target && (
            <p className="mt-0.5 text-xs text-zinc-500">
              {target.gap ? `${target.gap} for ${LEVEL_LABEL[target.level]} (${target.label})` : `Next: ${LEVEL_LABEL[target.level]} (${target.label})`}
            </p>
          )}
        </div>
      )}

      <button
        type="button"
        disabled={busy || value == null}
        onClick={save}
        className="mt-3 h-12 w-full rounded-full bg-accent text-sm font-extrabold text-accent-foreground disabled:opacity-50"
      >
        {busy ? 'Saving…' : mode === 'coach' ? 'Record verified score' : 'Log score'}
      </button>
      {mode === 'member' && (
        <p className="mt-2 text-center text-xs text-zinc-500">Your coach confirms scores before they count towards a Big Dog T-shirt.</p>
      )}

      {mode === 'coach' && pending && best?.result_value != null && (
        <button
          type="button"
          disabled={busy}
          onClick={() => run(() => verifyBigDogScore(clientId, exercise.key, best.result_value as number), { success: 'Score verified' })}
          className="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-full border border-accent text-sm font-bold text-accent disabled:opacity-50"
        >
          <Check className="h-4 w-4" /> Verify their {best.result_text ?? 'score'} ({bestLevel && LEVEL_LABEL[bestLevel]})
        </button>
      )}

      <div className="mt-5">
        <p className="mb-1.5 text-[11px] font-extrabold uppercase tracking-[0.14em] text-zinc-500">History</p>
        {history.length === 0 ? (
          <p className="text-sm text-zinc-500">No scores yet.</p>
        ) : (
          <ul className="divide-y divide-black/5 dark:divide-white/10">
            {history.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span className="min-w-0">
                  <span className="block font-bold text-black dark:text-zinc-50">{r.result_text ?? LEVEL_LABEL[r.level]}</span>
                  <span className="block text-xs text-zinc-500">
                    {fmtDate(r.tested_date)} · {r.self_reported ? 'logged by you' : 'verified by coach'}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-extrabold ${LEVEL_BADGE[r.level]}`}>{LEVEL_LABEL[r.level]}</span>
                  {mode === 'member' && r.self_reported && (
                    <button
                      type="button"
                      aria-label="Delete this score"
                      disabled={busy}
                      onClick={() => run(() => deleteMyBigDogScore(r.id), { success: 'Score deleted' })}
                      className="rounded-full p-1.5 text-zinc-400 hover:bg-black/5 dark:hover:bg-white/10"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </BottomSheet>
  );
}

export function BigDogTab({
  clientId,
  profile,
  results,
  canRecord,
  canLog = false,
}: {
  clientId: string;
  profile: ClientProfileRow | null;
  results: BigDogResultRow[];
  // Coaches record verified results for their own clients...
  canRecord: boolean;
  // ...and members log their own scores on their own screen.
  canLog?: boolean;
}) {
  const { run, busy } = useAction();
  // Targets follow the sex on the member's profile -- no switch to flip.
  const gender: BigDogGender = genderFromProfile(profile?.gender);
  const [editing, setEditing] = useState<string | null>(null);
  const [resultText, setResultText] = useState('');
  const [sheetFor, setSheetFor] = useState<string | null>(null);

  const verified = results.filter((r) => !r.self_reported);
  const verifiedCurrent = currentLevels(verified);
  const count = bigDogCount(results);
  const tier = tierForCount(count);
  const sheetExercise = EXERCISES.find((e) => e.key === sheetFor) ?? null;
  const mode: 'member' | 'coach' = canRecord ? 'coach' : 'member';

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
      <div className="flex items-center justify-between rounded-2xl border border-accent/30 bg-card px-3.5 py-3">
        <div>
          <p className="text-sm font-extrabold text-black dark:text-zinc-50">{TIER_TITLE[tier]}</p>
          <p className="mt-0.5 text-[11px] text-zinc-500">{nextTierLabel(count)}</p>
        </div>
        <div className="text-right">
          <p className="text-xl font-black leading-none text-accent">{count}</p>
          <p className="text-[11px] text-zinc-500">of {EXERCISES.length} BD</p>
        </div>
      </div>

      <div>
        <TierPips count={count} className="mb-1.5" />
        <div className="flex justify-between text-[11px] font-bold">
          <span className="text-zinc-400">Rookie</span>
          {tierLabels.map((t) => (
            <span key={t.label} className={count >= t.min ? 'text-accent' : 'text-zinc-400'}>
              {t.label}
            </span>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 px-1">
        <p className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-zinc-500">All exercises</p>
        <p className="text-[11px] text-zinc-500">
          Targets for {gender === 'male' ? 'men' : 'women'}
          {!profile?.gender && ' · set your sex in your profile'}
        </p>
      </div>
      {canLog && (
        <p className="px-1 text-xs text-zinc-500">Tap a standard to log your peak week score. Your coach confirms it before it counts towards your T-shirt.</p>
      )}

      <div className="space-y-1.5">
        {EXERCISES.map((ex) => {
          const std = ex[gender];
          const mine = results.filter((r) => r.exercise_key === ex.key);
          const verifiedRow = verifiedCurrent[ex.key];
          const verifiedLevel: BigDogLevel = verifiedRow?.level ?? 'none';
          const best = bestResult(mine, ex);
          const bestLevel: BigDogLevel | null = best?.result_value != null ? levelForResult(ex, gender, best.result_value) : null;
          const effective = bestLevel != null && levelRank(bestLevel) > levelRank(verifiedLevel) ? bestLevel : verifiedLevel;
          const reached = levelRank(effective);
          const verifiedReached = levelRank(verifiedLevel);
          const pending = best?.self_reported && bestLevel != null && levelRank(bestLevel) > levelRank(verifiedLevel);
          const isEditing = editing === ex.key;
          const bestText = best?.result_text ?? (verifiedRow && verifiedLevel !== 'none' ? verifiedRow.result_text : null);
          const tappable = canLog || canRecord;
          return (
            <div
              key={ex.key}
              className={`rounded-2xl border p-3 ${
                verifiedLevel === 'big_dog' ? 'border-accent/30 bg-accent-soft' : 'border-black/[.06] bg-card dark:border-white/10'
              }`}
            >
              <div className="mb-2 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs font-extrabold text-black dark:text-zinc-50">{ex.name}</p>
                  <p className="text-[11px] text-zinc-500">{ex.category}</p>
                </div>
                <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-extrabold ${LEVEL_BADGE[verifiedLevel]}`}>
                  {LEVEL_LABEL[verifiedLevel]}
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
                    } ${
                      verifiedReached >= n
                        ? n === 3 ? 'border-accent' : 'border-zinc-400'
                        : reached >= n
                          ? 'border-dashed border-accent/60'
                          : 'border-transparent'
                    }`}
                  >
                    <p className={`text-[11px] font-bold uppercase tracking-wide ${n === 3 ? 'text-accent' : 'text-zinc-500'}`}>{label}</p>
                    <p className={`text-[11px] font-extrabold ${n === 3 ? 'text-accent' : 'text-zinc-700 dark:text-zinc-300'}`}>{value}</p>
                  </div>
                ))}
              </div>

              <div className="mt-2.5 flex items-center justify-between gap-2">
                <p className="min-w-0 text-xs text-zinc-500">
                  {bestText ? (
                    <>
                      Best <span className="font-bold text-black dark:text-zinc-50">{bestText}</span>
                      {pending && <span className="font-semibold text-warning"> · awaiting coach check</span>}
                    </>
                  ) : (
                    'No score logged yet'
                  )}
                </p>
                {tappable && (
                  <button
                    type="button"
                    onClick={() => setSheetFor(ex.key)}
                    className="shrink-0 rounded-full bg-accent px-4 py-1.5 text-xs font-extrabold text-accent-foreground"
                  >
                    {canRecord ? (pending ? 'Verify' : 'Record') : 'Log score'}
                  </button>
                )}
              </div>

              {canRecord && (
                <div className="mt-2">
                  {!isEditing ? (
                    <button
                      type="button"
                      onClick={() => {
                        setEditing(ex.key);
                        setResultText(verifiedRow?.result_text ?? '');
                      }}
                      className="text-[11px] font-bold text-zinc-500 hover:text-accent"
                    >
                      Set level by hand
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
                            className={`rounded-full px-3 py-1 text-[11px] font-extrabold disabled:opacity-50 ${
                              l === 'big_dog' ? 'bg-accent text-accent-foreground' : 'bg-black/10 text-zinc-700 dark:bg-white/10 dark:text-zinc-300'
                            }`}
                          >
                            {l === 'none' ? 'Clear' : LEVEL_LABEL[l]}
                          </button>
                        ))}
                        <button type="button" onClick={() => setEditing(null)} className="px-2 text-[11px] font-bold text-zinc-500">
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

      {sheetExercise && (
        <ScoreSheet clientId={clientId} exercise={sheetExercise} gender={gender} results={results} mode={mode} onClose={() => setSheetFor(null)} />
      )}
    </div>
  );
}
