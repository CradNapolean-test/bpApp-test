'use client';

import { useMemo, useState } from 'react';
import { Button } from '@/app/_components/Button';
import { useAction } from '@/app/_components/useAction';
import { calcEngine, weeklyTarget, CALORIE_FLOOR } from '@/lib/calculations';
import { updateNutritionTrackingMode, upsertClientProfile } from '@/lib/data/clientProfile';
import { COMMON_TIMEZONES, DEFAULT_TIMEZONE } from '@/lib/utils/dates';
import type { ClientProfileRow, MeasurementLogRow } from '@/lib/data/types';

const NUTRITION_MODES: { value: ClientProfileRow['nutrition_tracking_mode']; label: string; hint: string }[] = [
  { value: 'full_tracking', label: 'Full tracking', hint: 'Per-food diary, barcode scan, recipes.' },
  { value: 'manual_import', label: 'Manual import', hint: 'Client types macros per meal section, no food search.' },
  { value: 'photo_diary', label: 'Photo diary', hint: 'Client photographs meals with a description.' },
];

// Excludes the coach-only reminder settings (edited from CreditsTab, not this form) in
// addition to client_id.
type SetupFields = Omit<
  ClientProfileRow,
  | 'client_id'
  | 'checkin_reminder_days'
  | 'last_checkin_reminder_at'
  | 'notifications_enabled'
  | 'email_notifications_enabled'
  | 'nutrition_tracking_mode'
  | 'join_date'
  | 'referral_source'
  | 'admin_notes'
  | 'deletion_requested_at'
>;

const BLANK: SetupFields = {
  name: '',
  gender: 'Female',
  goal_description: '',
  experience: '',
  age: null,
  body_fat_pct: null,
  start_weight: 0,
  goal_weight: 0,
  activity_level: 1.5,
  diet_approach: 'High Carb Low Fat',
  tier: 1,
  cycling: false,
  timezone: DEFAULT_TIMEZONE,
  phone: null,
  emergency_contact_name: null,
  emergency_contact_phone: null,
  address: null,
  date_of_birth: null,
  meas_arm_start: null, meas_arm_goal: null,
  meas_chest_start: null, meas_chest_goal: null,
  meas_waist_start: null, meas_waist_goal: null,
  meas_hips_start: null, meas_hips_goal: null,
  meas_quad_start: null, meas_quad_goal: null,
  lift_db_press_start: null, lift_db_press_goal: null,
  lift_squats_start: null, lift_squats_goal: null,
  lift_pull_ups_start: null, lift_pull_ups_goal: null,
  lift_rdl_start: null, lift_rdl_goal: null,
  lift_hip_thrust_start: null, lift_hip_thrust_goal: null,
};

function numOrNull(v: string): number | null {
  return v === '' ? null : Number(v);
}

const MEASUREMENTS: { key: 'arm' | 'chest' | 'waist' | 'hips' | 'quad'; label: string }[] = [
  { key: 'arm', label: 'Arm' },
  { key: 'chest', label: 'Chest' },
  { key: 'waist', label: 'Waist' },
  { key: 'hips', label: 'Hips' },
  { key: 'quad', label: 'Quad' },
];

const LIFTS: { key: 'db_press' | 'squats' | 'pull_ups' | 'rdl' | 'hip_thrust'; label: string }[] = [
  { key: 'db_press', label: 'DB Press' },
  { key: 'squats', label: 'Squats' },
  { key: 'pull_ups', label: 'Pull Ups' },
  { key: 'rdl', label: 'Romanian Deadlift' },
  { key: 'hip_thrust', label: 'Hip Thrust' },
];

export function SetupTab({
  clientId,
  initialProfile,
  readOnly,
  measurementLogs,
}: {
  clientId: string;
  initialProfile: ClientProfileRow | null;
  readOnly: boolean;
  measurementLogs: MeasurementLogRow[];
}) {
  const { run, busy: saving } = useAction();
  const { run: runMode, busy: savingMode } = useAction();
  const [form, setForm] = useState<SetupFields>(
    initialProfile ?? BLANK
  );
  const [error, setError] = useState<string | null>(null);
  const [nutritionMode, setNutritionMode] = useState(initialProfile?.nutrition_tracking_mode ?? 'full_tracking');

  async function handleModeChange(mode: ClientProfileRow['nutrition_tracking_mode']) {
    await runMode(() => updateNutritionTrackingMode(clientId, mode), {
      success: 'Tracking mode updated',
      onDone: () => setNutritionMode(mode),
    });
  }

  const engine = useMemo(() => {
    if (!form.age || !form.start_weight || !form.goal_weight || !form.body_fat_pct) return null;
    return calcEngine({
      age: form.age,
      gender: form.gender === 'Male' ? 'Male' : 'Female',
      startWeight: form.start_weight,
      goalWeight: form.goal_weight,
      bodyFatPct: form.body_fat_pct,
      activityLevel: form.activity_level,
      dietApproach: form.diet_approach,
      tier: form.tier,
      cycling: form.cycling,
    });
  }, [form]);

  const week1Target = useMemo(() => {
    if (!engine || !form.age || !form.start_weight || !form.goal_weight || !form.body_fat_pct) return null;
    return weeklyTarget(
      {
        age: form.age,
        gender: form.gender === 'Male' ? 'Male' : 'Female',
        startWeight: form.start_weight,
        goalWeight: form.goal_weight,
        bodyFatPct: form.body_fat_pct,
        activityLevel: form.activity_level,
        dietApproach: form.diet_approach,
        tier: form.tier,
        cycling: form.cycling,
      },
      1
    );
  }, [engine, form]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    // Field-level validation stays inline next to the form; only the save failure itself
    // goes to a toast.
    if (!form.goal_weight) {
      setError('Goal Weight is required.');
      return;
    }
    setError(null);
    await run(() => upsertClientProfile(clientId, form), { success: 'Setup saved' });
  }

  const inputCls =
    'w-full rounded-xl border border-black/10 bg-transparent px-3.5 py-2.5 text-sm dark:border-white/10 disabled:opacity-60';
  const labelCls = 'text-sm font-medium text-zinc-700 dark:text-zinc-300';

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      {engine && week1Target && (
        <div className="rounded-lg border border-black/10 p-4 dark:border-white/10">
          <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Calculated targets</h3>
          <dl className="mt-2 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
            <div><dt className="text-zinc-500">BMR</dt><dd>{Math.round(engine.bmr)} kcal</dd></div>
            <div><dt className="text-zinc-500">TDEE</dt><dd>{Math.round(engine.tdee)} kcal</dd></div>
            <div><dt className="text-zinc-500">Protein/day</dt><dd>{Math.round(engine.protein)} g</dd></div>
            <div><dt className="text-zinc-500">Fat/day</dt><dd>{Math.round(engine.fat)} g</dd></div>
          </dl>
          <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
            Week 1 daily target: {Math.round((week1Target.calories) / 7)} kcal ·{' '}
            {Math.round(week1Target.protein / 7)}g protein ·{' '}
            {Math.round(week1Target.carbs / 7)}g carbs ·{' '}
            {Math.round(week1Target.fat / 7)}g fat
          </p>
          {week1Target.calories / 7 < CALORIE_FLOOR && (
            <p className="mt-2 text-sm text-amber-600 dark:text-amber-400">
              Daily target is below {CALORIE_FLOOR} kcal — worth a coach review.
            </p>
          )}
        </div>
      )}

      {readOnly && (
        <div className="space-y-2 rounded-lg border border-black/10 p-4 dark:border-white/10">
          <label className={labelCls}>Nutrition tracking method</label>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {NUTRITION_MODES.map((m) => (
              <button
                key={m.value}
                type="button"
                disabled={savingMode}
                onClick={() => handleModeChange(m.value)}
                className={`rounded-md border p-2.5 text-left text-sm transition-colors disabled:opacity-50 ${
                  nutritionMode === m.value
                    ? 'border-accent bg-accent-soft'
                    : 'border-black/10 hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/5'
                }`}
              >
                <p className="font-medium text-black dark:text-zinc-50">{m.label}</p>
                <p className="text-xs text-zinc-500">{m.hint}</p>
              </button>
            ))}
          </div>
        </div>
      )}

      <fieldset disabled={readOnly} className="space-y-6">
        <div className="rounded-lg border border-black/10 p-4 dark:border-white/10">
          <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Contact details</h3>
          <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <label className={labelCls}>Phone</label>
              <input
                type="tel"
                className={inputCls}
                value={form.phone ?? ''}
                onChange={(e) => setForm({ ...form, phone: e.target.value || null })}
              />
            </div>
            <div className="space-y-1">
              <label className={labelCls}>Date of birth</label>
              <input
                type="date"
                className={inputCls}
                value={form.date_of_birth ?? ''}
                onChange={(e) => setForm({ ...form, date_of_birth: e.target.value || null })}
              />
            </div>
            <div className="sm:col-span-2 space-y-1">
              <label className={labelCls}>Address</label>
              <input
                className={inputCls}
                value={form.address ?? ''}
                onChange={(e) => setForm({ ...form, address: e.target.value || null })}
              />
            </div>
            <div className="space-y-1">
              <label className={labelCls}>Emergency contact name</label>
              <input
                className={inputCls}
                value={form.emergency_contact_name ?? ''}
                onChange={(e) => setForm({ ...form, emergency_contact_name: e.target.value || null })}
              />
            </div>
            <div className="space-y-1">
              <label className={labelCls}>Emergency contact phone</label>
              <input
                type="tel"
                className={inputCls}
                value={form.emergency_contact_phone ?? ''}
                onChange={(e) => setForm({ ...form, emergency_contact_phone: e.target.value || null })}
              />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1">
            <label className={labelCls}>Name</label>
            <input
              required
              className={inputCls}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <label className={labelCls}>Gender</label>
            <select
              className={inputCls}
              value={form.gender ?? 'Female'}
              onChange={(e) => setForm({ ...form, gender: e.target.value })}
            >
              <option>Female</option>
              <option>Male</option>
            </select>
          </div>
          <div className="sm:col-span-2 space-y-1">
            <label className={labelCls}>Goal description</label>
            <input
              className={inputCls}
              placeholder="e.g. Fat loss"
              value={form.goal_description ?? ''}
              onChange={(e) => setForm({ ...form, goal_description: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <label className={labelCls}>Experience level</label>
            <input
              className={inputCls}
              value={form.experience ?? ''}
              onChange={(e) => setForm({ ...form, experience: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <label className={labelCls}>Timezone</label>
            <select
              className={inputCls}
              value={form.timezone}
              onChange={(e) => setForm({ ...form, timezone: e.target.value })}
            >
              {COMMON_TIMEZONES.map((tz) => (
                <option key={tz} value={tz}>
                  {tz}
                </option>
              ))}
            </select>
            <p className="text-xs text-zinc-500">
              Used to work out which calendar day your logs and reminders land on.
            </p>
          </div>
          <div className="space-y-1">
            <label className={labelCls}>Age</label>
            <input
              type="number"
              className={inputCls}
              value={form.age ?? ''}
              onChange={(e) => setForm({ ...form, age: numOrNull(e.target.value) })}
            />
          </div>
          <div className="space-y-1">
            <label className={labelCls}>Body fat %</label>
            <input
              type="number"
              step="0.1"
              className={inputCls}
              value={form.body_fat_pct ?? ''}
              onChange={(e) => setForm({ ...form, body_fat_pct: numOrNull(e.target.value) })}
            />
          </div>
          <div className="space-y-1">
            <label className={labelCls}>Start weight (kg)</label>
            <input
              type="number"
              step="0.1"
              required
              className={inputCls}
              value={form.start_weight || ''}
              onChange={(e) => setForm({ ...form, start_weight: Number(e.target.value) })}
            />
          </div>
          <div className="space-y-1">
            <label className={labelCls}>
              Goal weight (kg) <span className="text-red-500">*required</span>
            </label>
            <input
              type="number"
              step="0.1"
              required
              className={inputCls}
              value={form.goal_weight || ''}
              onChange={(e) => setForm({ ...form, goal_weight: Number(e.target.value) })}
            />
          </div>
          <div className="space-y-1">
            <label className={labelCls}>Activity level multiplier</label>
            <input
              type="number"
              step="0.05"
              className={inputCls}
              value={form.activity_level}
              onChange={(e) => setForm({ ...form, activity_level: Number(e.target.value) })}
            />
          </div>
          <div className="space-y-1">
            <label className={labelCls}>Diet approach</label>
            <select
              className={inputCls}
              value={form.diet_approach}
              onChange={(e) =>
                setForm({ ...form, diet_approach: e.target.value as ClientProfileRow['diet_approach'] })
              }
            >
              <option>High Carb Low Fat</option>
              <option>Higher Fat</option>
            </select>
          </div>
          <div className="space-y-1">
            <label className={labelCls}>Tier</label>
            <select
              className={inputCls}
              value={form.tier}
              onChange={(e) => setForm({ ...form, tier: Number(e.target.value) as 1 | 2 | 3 })}
            >
              <option value={1}>1</option>
              <option value={2}>2</option>
              <option value={3}>3</option>
            </select>
          </div>
          <label className="flex items-center gap-2 pt-6 text-sm">
            <input
              type="checkbox"
              checked={form.cycling}
              onChange={(e) => setForm({ ...form, cycling: e.target.checked })}
            />
            Calorie cycling
          </label>
        </div>

        <div>
          <h3 className="mb-2 text-sm font-semibold text-zinc-700 dark:text-zinc-300">Measurements (current / start / goal)</h3>
          <p className="mb-2 text-xs text-zinc-500">
            Current comes from the latest entry logged under Progress &amp; Photos.
          </p>
          <div className="space-y-2">
            {MEASUREMENTS.map(({ key, label }) => {
              const current = measurementLogs[0]?.[key] ?? null;
              return (
              <div key={key} className="grid grid-cols-4 items-center gap-2">
                <span className="text-sm text-zinc-600 dark:text-zinc-400">{label}</span>
                <span className="rounded-md border border-transparent px-3 py-2 text-sm text-zinc-500">
                  {current ?? '—'}
                </span>
                <input
                  type="number"
                  className={inputCls}
                  placeholder="start"
                  value={(form as Record<string, unknown>)[`meas_${key}_start`] as number ?? ''}
                  onChange={(e) =>
                    setForm({ ...form, [`meas_${key}_start`]: numOrNull(e.target.value) })
                  }
                />
                <input
                  type="number"
                  className={inputCls}
                  placeholder="goal"
                  value={(form as Record<string, unknown>)[`meas_${key}_goal`] as number ?? ''}
                  onChange={(e) =>
                    setForm({ ...form, [`meas_${key}_goal`]: numOrNull(e.target.value) })
                  }
                />
              </div>
              );
            })}
          </div>
        </div>

        <div>
          <h3 className="mb-2 text-sm font-semibold text-zinc-700 dark:text-zinc-300">Strength lifts (start / goal)</h3>
          <div className="space-y-2">
            {LIFTS.map(({ key, label }) => (
              <div key={key} className="grid grid-cols-3 items-center gap-2">
                <span className="text-sm text-zinc-600 dark:text-zinc-400">{label}</span>
                <input
                  type="number"
                  className={inputCls}
                  placeholder="start"
                  value={(form as Record<string, unknown>)[`lift_${key}_start`] as number ?? ''}
                  onChange={(e) =>
                    setForm({ ...form, [`lift_${key}_start`]: numOrNull(e.target.value) })
                  }
                />
                <input
                  type="number"
                  className={inputCls}
                  placeholder="goal"
                  value={(form as Record<string, unknown>)[`lift_${key}_goal`] as number ?? ''}
                  onChange={(e) =>
                    setForm({ ...form, [`lift_${key}_goal`]: numOrNull(e.target.value) })
                  }
                />
              </div>
            ))}
          </div>
        </div>

        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

        {!readOnly && (
          <Button type="submit" variant="primary" disabled={saving} className="w-full !rounded-full py-3 text-base">
            {saving ? 'Saving…' : 'Save changes'}
          </Button>
        )}
      </fieldset>
    </form>
  );
}
