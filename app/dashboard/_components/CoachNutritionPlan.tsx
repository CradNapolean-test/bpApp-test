'use client';

import { useId, useMemo, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Button } from '@/app/_components/Button';
import { useAction } from '@/app/_components/useAction';
import { useToast } from '@/app/_components/ToastProvider';
import { calcEngine, weeklyTarget, CALORIE_FLOOR, RATE_PCT } from '@/lib/calculations';
import type { ClientProfile } from '@/lib/calculations';
import { updateNutritionTrackingMode, upsertClientProfile, type ProfileEditableFields } from '@/lib/data/clientProfile';
import { mergeIncoming, profilePatch } from '@/lib/profilePatch';
import { NUTRITION_PLAN_FIELDS } from '@/lib/nutritionPlanFields';
import { toEngineProfile } from '@/lib/utils/clientProfile';
import { averageDayTarget, isCyclingTarget } from '@/lib/utils/dayTarget';
import type { ClientProfileRow } from '@/lib/data/types';
import { CustomTargetsSheet } from './CustomTargetsSheet';

const NUTRITION_MODES: { value: ClientProfileRow['nutrition_tracking_mode']; label: string; hint: string }[] = [
  { value: 'full_tracking', label: 'Full tracking', hint: 'Per-food diary, barcode scan, recipes.' },
  { value: 'manual_import', label: 'Manual import', hint: 'Member types macros per meal section, no food search.' },
  { value: 'photo_diary', label: 'Photo diary', hint: 'Member photographs meals with a description.' },
];

type PlanFields = Pick<ProfileEditableFields, (typeof NUTRITION_PLAN_FIELDS)[number]>;

const planOf = (p: ClientProfileRow): PlanFields => ({
  age: p.age,
  body_fat_pct: p.body_fat_pct,
  activity_level: p.activity_level,
  diet_approach: p.diet_approach,
  nutrition_goal: p.nutrition_goal,
  nutrition_setting: p.nutrition_setting,
  cycling: p.cycling,
});

const numOrNull = (v: string): number | null => (v === '' ? null : Number(v));
const round = (n: number) => Math.round(n).toLocaleString();
const macroLine = (t: { calories: number; protein: number; carbs: number; fat: number }) =>
  `${round(t.calories)} kcal · ${Math.round(t.protein)}g protein · ${Math.round(t.carbs)}g carbs · ${Math.round(t.fat)}g fat`;

// The coach's nutrition plan for one member, at the top of the coach's view of their Nutrition (CL8, owner's choice 21 Nov 2026): this
// week's targets, the daily targets override, how they track their food, and the calorie engine's inputs. It used to sit at the foot
// of Details. Coach view only; the member's own diary never shows it. `canEdit` is false for a colleague's member: everything reads,
// nothing changes.
export function CoachNutritionPlan({
  clientId,
  profile,
  programWeek,
  canEdit,
}: {
  clientId: string;
  profile: ClientProfileRow | null;
  programWeek: number;
  canEdit: boolean;
}) {
  const ids = useId();
  const { run, busy: saving } = useAction();
  const { run: runMode, busy: savingMode } = useAction();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [targetsOpen, setTargetsOpen] = useState(false);
  const [form, setForm] = useState<PlanFields | null>(profile ? planOf(profile) : null);
  const [baseline, setBaseline] = useState<PlanFields | null>(profile ? planOf(profile) : null);
  const [seen, setSeen] = useState(profile);
  // A tracking method just picked shows as picked at once, not only when the page's fresh data arrives.
  const [pickedMode, setPickedMode] = useState<ClientProfileRow['nutrition_tracking_mode'] | null>(null);
  // Fresh data from the server (after a save, or a change made elsewhere) is taken for every box the coach has not touched.
  if (seen !== profile) {
    setSeen(profile);
    setPickedMode(null);
    if (profile) {
      const incoming = planOf(profile);
      if (!form || !baseline) {
        setForm(incoming);
        setBaseline(incoming);
      } else {
        const merged = mergeIncoming(baseline as never, form as never, incoming as never, NUTRITION_PLAN_FIELDS);
        setForm(merged.form as unknown as PlanFields);
        setBaseline(merged.baseline as unknown as PlanFields);
      }
    }
  }

  // This week, not the starting week (NU32). The week only changes the phase, but the label said "(starting week)" and read as stale.
  const week = Math.max(1, programWeek);
  const weekLabel = programWeek > 0 ? `this week (week ${programWeek})` : 'this week';
  // What the member is given now: the override when there is one, else the calculation from what is saved.
  const current = useMemo(() => {
    const engineProfile = toEngineProfile(profile);
    return engineProfile ? weeklyTarget(engineProfile, week) : null;
  }, [profile, week]);
  const currentDay = averageDayTarget(current);
  const hasOverride = profile?.custom_calories != null;

  // The calculation from the boxes as they stand, so a change shows before it is saved.
  const draftEngine: ClientProfile | null = useMemo(() => {
    if (!profile || !form || !form.age || !profile.start_weight || !profile.goal_weight || !form.body_fat_pct) return null;
    return {
      age: form.age,
      gender: profile.gender === 'Male' ? 'Male' : 'Female',
      startWeight: profile.start_weight,
      goalWeight: profile.goal_weight,
      bodyFatPct: form.body_fat_pct,
      activityLevel: form.activity_level,
      dietApproach: form.diet_approach,
      goal: form.nutrition_goal,
      setting: form.nutrition_setting,
      cycling: form.cycling,
    };
  }, [profile, form]);
  const engine = useMemo(() => (draftEngine ? calcEngine(draftEngine) : null), [draftEngine]);
  const draftTarget = useMemo(() => (draftEngine ? weeklyTarget(draftEngine, week) : null), [draftEngine, week]);

  const mode = pickedMode ?? profile?.nutrition_tracking_mode ?? 'full_tracking';
  const modeLabel = NUTRITION_MODES.find((m) => m.value === mode)?.label ?? 'Full tracking';

  async function changeMode(next: ClientProfileRow['nutrition_tracking_mode']) {
    if (next === mode) return;
    await runMode(() => updateNutritionTrackingMode(clientId, next), { success: 'Tracking mode updated', onDone: () => setPickedMode(next) });
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!form || !baseline) return;
    const patch = profilePatch(baseline as never, form as never, NUTRITION_PLAN_FIELDS) as Partial<ProfileEditableFields>;
    if (Object.keys(patch).length === 0) {
      toast.success('Nothing has changed, so there is nothing to save.');
      return;
    }
    await run(() => upsertClientProfile(clientId, patch), {
      success: 'Nutrition plan saved',
      onDone: () => setBaseline({ ...baseline, ...patch } as PlanFields),
    });
  }

  const card = 'rounded-[20px] border border-black/[.08] bg-card p-4 dark:border-white/10';
  const outlineBtn =
    'inline-flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-xl border-[1.5px] border-black/20 px-3.5 text-[13px] font-bold text-black dark:border-white/25 dark:text-zinc-50 disabled:opacity-50';
  const inputCls = 'w-full rounded-xl border border-black/10 bg-transparent px-3.5 py-2.5 text-sm dark:border-white/10 disabled:opacity-60';
  const labelCls = 'text-sm font-medium text-zinc-700 dark:text-zinc-300';

  if (!profile) {
    return (
      <section aria-label="Nutrition plan" className={card}>
        <p className="text-sm font-extrabold text-black dark:text-zinc-50">Nutrition plan</p>
        <p className="mt-1 text-xs text-zinc-500">This member has not finished setting up yet, so there is no plan to show.</p>
      </section>
    );
  }

  return (
    <section aria-labelledby={`${ids}-title`} className={card}>
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
        <div className="min-w-0 flex-1 basis-56">
          <h2 id={`${ids}-title`} className="text-sm font-extrabold text-black dark:text-zinc-50">
            Nutrition plan <span className="font-semibold text-zinc-500">· coach only</span>
          </h2>
          <p className="mt-1 text-sm font-bold text-black dark:text-zinc-50">
            {currentDay ? macroLine(currentDay) : 'No targets yet'}
          </p>
          <p className="text-xs text-zinc-500">
            {currentDay
              ? `${hasOverride ? 'The override below' : 'Calculated'}, ${weekLabel}${isCyclingTarget(current) ? ': an average day (low and high days together)' : ''}.`
              : 'Needs their age, start and goal weight and body fat %, or a daily targets override.'}{' '}
            Tracking: {modeLabel}.
          </p>
        </div>
        <button
          type="button"
          aria-expanded={open}
          // The form is only on the page while it is open.
          aria-controls={open ? `${ids}-plan` : undefined}
          onClick={() => setOpen((o) => !o)}
          className={outlineBtn}
        >
          {open ? 'Close' : canEdit ? 'Edit plan' : 'See plan'}
          <ChevronDown className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden />
        </button>
      </div>

      <div className="mt-3 flex items-center justify-between gap-3 border-t border-black/[.07] pt-3 dark:border-white/10">
        <div className="min-w-0">
          <p className="text-sm font-bold text-black dark:text-zinc-50">Daily targets override</p>
          <p className="text-xs text-zinc-500">
            {hasOverride
              ? `Set: ${Math.round(profile.custom_calories as number)} kcal · P ${profile.custom_protein}g · C ${profile.custom_carbs}g · F ${profile.custom_fat}g.`
              : 'Using the calculated targets.'}
            {profile.custom_targets_locked ? ' Member cannot change them.' : ' Member can set their own.'}
          </p>
        </div>
        {canEdit && (
          <button type="button" onClick={() => setTargetsOpen(true)} className={outlineBtn}>
            Edit
          </button>
        )}
      </div>
      {targetsOpen && <CustomTargetsSheet clientId={clientId} profile={profile} isCoach onClose={() => setTargetsOpen(false)} />}

      {open && form && (
        <form id={`${ids}-plan`} onSubmit={save} className="mt-3 space-y-4 border-t border-black/[.07] pt-3 dark:border-white/10">
          <div className="space-y-2">
            <p className={labelCls} id={`${ids}-mode`}>
              Nutrition tracking method
            </p>
            {canEdit ? (
              <div role="group" aria-labelledby={`${ids}-mode`} className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                {NUTRITION_MODES.map((m) => (
                  <button
                    key={m.value}
                    type="button"
                    aria-pressed={mode === m.value}
                    disabled={savingMode}
                    onClick={() => changeMode(m.value)}
                    className={`rounded-md border p-2.5 text-left text-sm transition-colors disabled:opacity-50 ${
                      mode === m.value ? 'border-accent bg-accent-soft' : 'border-black/10 hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/5'
                    }`}
                  >
                    <span className="block font-medium text-black dark:text-zinc-50">{m.label}</span>
                    <span className="block text-xs text-zinc-500">{m.hint}</span>
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-sm text-black dark:text-zinc-50">{modeLabel}</p>
            )}
            {canEdit && <p className="text-xs text-zinc-500">A new method is saved as soon as it is picked.</p>}
          </div>

          {engine && draftTarget && (
            <div className="rounded-xl bg-black/[.03] p-3 text-sm dark:bg-white/[.04]">
              <p className="font-bold text-black dark:text-zinc-50">
                {macroLine({ calories: draftTarget.calories / 7, protein: draftTarget.protein / 7, carbs: draftTarget.carbs / 7, fat: draftTarget.fat / 7 })}
                <span className="font-normal text-zinc-500"> (calculated, {weekLabel})</span>
              </p>
              <p className="mt-1 text-xs text-zinc-500">
                BMR {Math.round(engine.bmr)} · TDEE {Math.round(engine.tdee)} · protein {Math.round(engine.protein)}g · fat {Math.round(engine.fatPct * 100)}% of
                calories
              </p>
              {hasOverride && <p className="mt-1 text-xs text-zinc-500">The member is given the override above, not this calculation.</p>}
              {draftTarget.floorApplied && (
                <p className="mt-2 text-amber-600 dark:text-amber-400">
                  Calories were raised so fat and carbs stay above their minimums — this is a slower change than the setting asks for.
                </p>
              )}
              {draftTarget.calories / 7 < CALORIE_FLOOR && (
                <p className="mt-2 text-amber-600 dark:text-amber-400">Daily target is below {CALORIE_FLOOR} kcal — worth a review.</p>
              )}
            </div>
          )}

          <fieldset disabled={!canEdit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <legend className="sr-only">Calorie calculation</legend>
            <div className="space-y-1">
              <label htmlFor={`${ids}-age`} className={labelCls}>
                Age
              </label>
              <input id={`${ids}-age`} type="number" className={inputCls} value={form.age ?? ''} onChange={(e) => setForm({ ...form, age: numOrNull(e.target.value) })} />
            </div>
            <div className="space-y-1">
              <label htmlFor={`${ids}-bf`} className={labelCls}>
                Body fat %
              </label>
              <input
                id={`${ids}-bf`}
                type="number"
                step="0.1"
                className={inputCls}
                value={form.body_fat_pct ?? ''}
                onChange={(e) => setForm({ ...form, body_fat_pct: numOrNull(e.target.value) })}
              />
              {profile.body_fat_estimated && <p className="text-xs text-zinc-500">An estimate, worth confirming with a scan.</p>}
            </div>
            <div className="space-y-1">
              <label htmlFor={`${ids}-activity`} className={labelCls}>
                Activity level multiplier
              </label>
              <input
                id={`${ids}-activity`}
                type="number"
                step="0.05"
                aria-describedby={`${ids}-activity-hint`}
                className={inputCls}
                value={form.activity_level}
                onChange={(e) => setForm({ ...form, activity_level: Number(e.target.value) })}
              />
              <p id={`${ids}-activity-hint`} className="text-xs text-zinc-500">
                1.2 mostly desk-based · 1.5 moderately active · 1.75 very active.
              </p>
            </div>
            <div className="space-y-1">
              <label htmlFor={`${ids}-diet`} className={labelCls}>
                Diet approach
              </label>
              <select
                id={`${ids}-diet`}
                className={inputCls}
                value={form.diet_approach}
                onChange={(e) => setForm({ ...form, diet_approach: e.target.value as ClientProfileRow['diet_approach'] })}
              >
                <option>High Carb Low Fat</option>
                <option>Higher Fat</option>
              </select>
            </div>
            <div className="space-y-1">
              <label htmlFor={`${ids}-goal`} className={labelCls}>
                Goal
              </label>
              <select
                id={`${ids}-goal`}
                className={inputCls}
                value={form.nutrition_goal}
                onChange={(e) => setForm({ ...form, nutrition_goal: e.target.value as ClientProfileRow['nutrition_goal'] })}
              >
                <option value="fat_loss">Fat loss</option>
                <option value="muscle_gain">Muscle gain</option>
              </select>
            </div>
            <div className="space-y-1">
              <label htmlFor={`${ids}-setting`} className={labelCls}>
                Setting
              </label>
              <select
                id={`${ids}-setting`}
                aria-describedby={`${ids}-setting-hint`}
                className={inputCls}
                value={form.nutrition_setting}
                onChange={(e) => setForm({ ...form, nutrition_setting: e.target.value as ClientProfileRow['nutrition_setting'] })}
              >
                <option value="steady">Steady</option>
                <option value="moderate">Moderate</option>
                <option value="aggressive">Aggressive</option>
              </select>
              <p id={`${ids}-setting-hint`} className="text-xs text-zinc-500">
                {form.nutrition_goal === 'fat_loss'
                  ? `Aims to lose about ${RATE_PCT.fat_loss[form.nutrition_setting] * 100}% of bodyweight a week.`
                  : `Aims to gain about ${RATE_PCT.muscle_gain[form.nutrition_setting] * 100}% of bodyweight a month.`}
              </p>
            </div>
            <label className="flex items-center gap-2 text-sm sm:pt-6">
              <input type="checkbox" checked={form.cycling} onChange={(e) => setForm({ ...form, cycling: e.target.checked })} />
              Calorie cycling
            </label>
          </fieldset>
          {canEdit && (
            <Button type="submit" variant="primary" disabled={saving} className="min-h-12 w-full text-[15px]">
              {saving ? 'Saving…' : 'Save nutrition plan'}
            </Button>
          )}
        </form>
      )}
    </section>
  );
}
