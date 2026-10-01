'use client';

import { useMemo, useState } from 'react';
import { Button } from '@/app/_components/Button';
import { useAction } from '@/app/_components/useAction';
import { calcEngine, weeklyTarget, CALORIE_FLOOR } from '@/lib/calculations';
import { updateNutritionTrackingMode, upsertClientProfile } from '@/lib/data/clientProfile';
import { DEFAULT_TIMEZONE } from '@/lib/utils/dates';
import type { ClientProfileRow } from '@/lib/data/types';

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
  | 'minutes_per_1000_steps'
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

export function SetupTab({
  clientId,
  initialProfile,
  readOnly,
  isCoachView = false,
}: {
  clientId: string;
  initialProfile: ClientProfileRow | null;
  readOnly: boolean;
  // Coach-only controls (nutrition tracking method, calculation detail) show for a coach.
  isCoachView?: boolean;
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
    // The gym is UK-only, so the timezone is fixed rather than a setting.
    await run(() => upsertClientProfile(clientId, { ...form, timezone: DEFAULT_TIMEZONE }), { success: 'Details saved' });
  }

  const inputCls =
    'w-full rounded-xl border border-black/10 bg-transparent px-3.5 py-2.5 text-sm dark:border-white/10 disabled:opacity-60';
  const labelCls = 'text-sm font-medium text-zinc-700 dark:text-zinc-300';

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <fieldset disabled={readOnly} className="space-y-6">
        <div className="rounded-2xl border border-black/[.05] bg-card p-4 dark:border-white/10">
          <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">About you</h3>
          <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
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
            <div className="space-y-1 sm:col-span-2">
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

        <div className="rounded-2xl border border-black/[.05] bg-card p-4 dark:border-white/10">
          <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Your goal</h3>
          <div className="mt-3 space-y-4">
            <div className="space-y-1">
              <label className={labelCls}>What do you want to achieve?</label>
              <textarea
                rows={7}
                className={`${inputCls} resize-y leading-relaxed`}
                placeholder="Be as detailed as you can. What do you want to achieve and why does it matter to you? Is there a date or event you're working towards? What has worked or not worked before? Any injuries, health conditions or things we should know about?"
                value={form.goal_description ?? ''}
                onChange={(e) => setForm({ ...form, goal_description: e.target.value })}
              />
              <p className="text-xs text-zinc-500">The more your coach knows, the better they can tailor your plan.</p>
            </div>
            <div className="space-y-1">
              <label className={labelCls}>Training experience</label>
              <textarea
                rows={3}
                className={`${inputCls} resize-y leading-relaxed`}
                placeholder="e.g. Trained on and off for 2 years, new to lifting weights, ex-athlete..."
                value={form.experience ?? ''}
                onChange={(e) => setForm({ ...form, experience: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
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
                  Goal weight (kg) <span className="text-red-500">*</span>
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
            </div>
          </div>
        </div>

        {/* Calorie-engine inputs. Coach-only for now: members see their resulting targets in
            Nutrition. A fuller rework (and a proper home for this) is still to be designed. */}
        {isCoachView && (
          <div className="space-y-4 rounded-2xl border border-black/[.05] bg-card p-4 dark:border-white/10">
            <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Nutrition plan (coach only)</h3>
            {engine && week1Target && (
              <div className="rounded-xl bg-black/[.03] p-3 text-sm dark:bg-white/[.04]">
                <p className="font-bold text-black dark:text-zinc-50">
                  {Math.round(week1Target.calories / 7)} kcal · {Math.round(week1Target.protein / 7)}g protein ·{' '}
                  {Math.round(week1Target.carbs / 7)}g carbs · {Math.round(week1Target.fat / 7)}g fat
                  <span className="font-normal text-zinc-500"> (starting week)</span>
                </p>
                <p className="mt-1 text-xs text-zinc-500">
                  BMR {Math.round(engine.bmr)} · TDEE {Math.round(engine.tdee)} · protein {Math.round(engine.protein)}g · fat{' '}
                  {Math.round(engine.fat)}g per day
                </p>
                {week1Target.calories / 7 < CALORIE_FLOOR && (
                  <p className="mt-2 text-amber-600 dark:text-amber-400">Daily target is below {CALORIE_FLOOR} kcal — worth a review.</p>
                )}
              </div>
            )}
            {!readOnly && (
              <div className="space-y-2">
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
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
                <label className={labelCls}>Activity level multiplier</label>
                <input
                  type="number"
                  step="0.05"
                  className={inputCls}
                  value={form.activity_level}
                  onChange={(e) => setForm({ ...form, activity_level: Number(e.target.value) })}
                />
                <p className="text-xs text-zinc-500">1.2 mostly desk-based · 1.5 moderately active · 1.75 very active.</p>
              </div>
              <div className="space-y-1">
                <label className={labelCls}>Diet approach</label>
                <select
                  className={inputCls}
                  value={form.diet_approach}
                  onChange={(e) => setForm({ ...form, diet_approach: e.target.value as ClientProfileRow['diet_approach'] })}
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
                <input type="checkbox" checked={form.cycling} onChange={(e) => setForm({ ...form, cycling: e.target.checked })} />
                Calorie cycling
              </label>
            </div>
          </div>
        )}

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
