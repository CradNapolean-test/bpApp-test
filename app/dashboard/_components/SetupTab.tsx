'use client';

import { ChevronDown } from 'lucide-react';
import { useId, useRef, useState } from 'react';
import { pop } from '@/app/_components/motion/gsap';
import { Button } from '@/app/_components/Button';
import { useAction } from '@/app/_components/useAction';
import { useToast } from '@/app/_components/ToastProvider';
import { upsertClientProfile, type ProfileEditableFields } from '@/lib/data/clientProfile';
import { MEMBER_SETUP_FIELDS, mergeIncoming, profilePatch } from '@/lib/profilePatch';
import { COACH_DETAILS_FIELDS } from '@/lib/nutritionPlanFields';
import { requestDetailsUpdate } from '@/lib/data/onboarding';
import { MemberMetricToggles, MemberScreenToggles } from './MemberScreenToggles';
import { MemberResetLink } from '@/app/coach/_components/MemberResetLink';
import { DEFAULT_TIMEZONE } from '@/lib/utils/dates';
import type { ClientJournalEntryRow, ClientProfileRow } from '@/lib/data/types';
import { goalsStillInNotes, mergeGoalText, GOAL_MAX } from '@/lib/goalMove';
import { weightUnitOf } from '@/lib/utils/weightUnits';
import { StLbInput } from '@/app/_components/StLbInput';

// The form's shape (excludes the coach-only reminder settings, edited from CreditsTab, and everything with its own screen). Only the
// fields in lib/profilePatch.ts are ever SAVED from it, and only the ones that changed. The coach's nutrition plan and daily targets
// override are no longer here: they sit at the top of the coach's view of the member's Nutrition (CoachNutritionPlan, CL8).
type SetupFields = ProfileEditableFields;

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
  nutrition_goal: 'fat_loss',
  nutrition_setting: 'steady',
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

// A titled card. For the coach the long form is split into sections that fold, so the page is not one endless scroll.
function SectionCard({ title, collapsible, defaultOpen = true, children }: { title: string; collapsible: boolean; defaultOpen?: boolean; children: React.ReactNode }) {
  const shell = 'rounded-[20px] border border-black/[.08] bg-card dark:border-white/10';
  const head = 'text-sm font-semibold text-zinc-700 dark:text-zinc-300';
  if (!collapsible) {
    // The member's screen (the board): a bold heading over a card. The fields' own top margin is for the coach's folding card.
    return (
      <section className="space-y-2.5">
        <h2 className="text-base font-extrabold text-black dark:text-zinc-50">{title}</h2>
        <div className="rounded-[20px] border border-black/[.08] bg-card p-4 dark:border-white/10 [&>*:first-child]:mt-0">{children}</div>
      </section>
    );
  }
  return (
    <details open={defaultOpen} className={`group ${shell}`}>
      <summary className={`flex cursor-pointer list-none items-center justify-between p-4 ${head}`}>
        {title}
        <ChevronDown className="h-4 w-4 text-zinc-400 transition-transform group-open:rotate-180" />
      </summary>
      <div className="px-4 pb-4">{children}</div>
    </details>
  );
}

export function SetupTab({
  clientId,
  initialProfile,
  readOnly,
  isCoachView = false,
  screenToggles,
  notesGoals = [],
}: {
  clientId: string;
  initialProfile: ClientProfileRow | null;
  readOnly: boolean;
  // The coach's view: goals written in the old Notes "Client Goals" card (CL10). Any not moved into the goal yet show under it.
  notesGoals?: ClientJournalEntryRow[];
  // Coach-only controls (the member's screens and check-in measures, asking them to confirm their details) show for a coach.
  isCoachView?: boolean;
  screenToggles?: { disabledScreens: string[]; disabledMetrics: string[]; planIncludedScreens: string[] | null; planName: string | null };
}) {
  const { run, busy: saving } = useAction();
  const { run: runAsk, busy: asking } = useAction();
  const toast = useToast();
  // Each box's label names it for a screen reader (MX21): the labels used to sit beside the boxes without pointing at them.
  const fid = useId();
  const idOf = (field: string) => `${fid}-${field}`;
  const [form, setForm] = useState<SetupFields>(
    initialProfile ?? BLANK
  );
  // What is stored, as far as this screen knows (null: no profile yet, so the first save creates it whole). A save sends only what differs
  // from it, so a change the coach made while this screen was open is never put back (R15).
  const [baseline, setBaseline] = useState<SetupFields | null>(initialProfile);
  const [seenProfile, setSeenProfile] = useState(initialProfile);
  const allowedFields = isCoachView ? COACH_DETAILS_FIELDS : MEMBER_SETUP_FIELDS;
  // When fresh data arrives (after a save, or because the coach changed something) take it for every field the person has not touched.
  if (seenProfile !== initialProfile) {
    setSeenProfile(initialProfile);
    if (initialProfile) {
      const merged = mergeIncoming((baseline ?? BLANK) as never, form as never, initialProfile as never, allowedFields);
      setForm(merged.form as unknown as SetupFields);
      setBaseline(merged.baseline as unknown as SetupFields);
    }
  }
  // The starting weight is the baseline for the calorie engine and the progress charts: a member sets it once, their coach changes it
  // after that (SU2).
  const startWeightLocked = !isCoachView && baseline != null && baseline.start_weight > 0;
  const [error, setError] = useState<string | null>(null);
  const saveButton = useRef<HTMLButtonElement>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    // Field-level validation stays inline next to the form; only the save failure itself
    // goes to a toast.
    if (!form.goal_weight) {
      setError('Goal Weight is required.');
      return;
    }
    setError(null);
    const patch = profilePatch((baseline ?? null) as never, form as never, allowedFields, { startWeightLocked }) as Partial<ProfileEditableFields>;
    if (Object.keys(patch).length === 0) {
      toast.success('Nothing has changed, so there is nothing to save.');
      return;
    }
    // Not the whole form, and no timezone (SU3): the timezone is the profile's own, set when it was created.
    await run(() => upsertClientProfile(clientId, patch), {
      success: 'Details saved',
      onDone: () => {
        setBaseline({ ...(baseline ?? BLANK), ...patch } as SetupFields);
        pop(saveButton.current, 0.9);
      },
    });
  }

  const inputCls = isCoachView
    ? 'w-full rounded-xl border border-black/10 bg-transparent px-3.5 py-2.5 text-sm dark:border-white/10 disabled:opacity-60'
    : 'h-12 w-full rounded-xl border border-black/[.14] bg-background px-3.5 text-base dark:border-white/15 disabled:opacity-60';
  // Text boxes grow with their rows, so they take the member's look without the fixed height.
  const areaCls = isCoachView ? inputCls : 'w-full rounded-xl border border-black/[.14] bg-background px-3.5 py-2.5 text-base dark:border-white/15 disabled:opacity-60';
  const labelCls = isCoachView ? 'text-sm font-medium text-zinc-700 dark:text-zinc-300' : 'text-[13px] font-bold text-zinc-700 dark:text-zinc-300';
  // Start and goal weight in the member's units (D16); stored in kilograms either way.
  const stLb = weightUnitOf(initialProfile?.weight_unit) === 'st_lb';

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <fieldset disabled={readOnly} className="space-y-6">
        <SectionCard title={isCoachView ? 'Personal details' : 'About you'} collapsible={isCoachView} defaultOpen={!isCoachView}>
          <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <label htmlFor={idOf('name')} className={labelCls}>Name</label>
              <input
                id={idOf('name')}
                required
                className={inputCls}
                maxLength={100}
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <label htmlFor={idOf('gender')} className={labelCls}>Sex (used for calorie calculations)</label>
              <select
                id={idOf('gender')}
                className={inputCls}
                value={form.gender ?? 'Female'}
                onChange={(e) => setForm({ ...form, gender: e.target.value })}
              >
                <option>Female</option>
                <option>Male</option>
              </select>
            </div>
            <div className="space-y-1">
              <label htmlFor={idOf('phone')} className={labelCls}>Phone</label>
              <input
                id={idOf('phone')}
                type="tel"
                className={inputCls}
                maxLength={30}
                value={form.phone ?? ''}
                onChange={(e) => setForm({ ...form, phone: e.target.value || null })}
              />
            </div>
            <div className="space-y-1">
              <label htmlFor={idOf('dob')} className={labelCls}>Date of birth</label>
              <input
                id={idOf('dob')}
                type="date"
                className={inputCls}
                value={form.date_of_birth ?? ''}
                onChange={(e) => setForm({ ...form, date_of_birth: e.target.value || null })}
              />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <label htmlFor={idOf('address')} className={labelCls}>Address</label>
              <input
                id={idOf('address')}
                className={inputCls}
                maxLength={300}
                value={form.address ?? ''}
                onChange={(e) => setForm({ ...form, address: e.target.value || null })}
              />
            </div>
            <div className="space-y-1">
              <label htmlFor={idOf('ec-name')} className={labelCls}>Emergency contact name</label>
              <input
                id={idOf('ec-name')}
                className={inputCls}
                maxLength={100}
                value={form.emergency_contact_name ?? ''}
                onChange={(e) => setForm({ ...form, emergency_contact_name: e.target.value || null })}
              />
            </div>
            <div className="space-y-1">
              <label htmlFor={idOf('ec-phone')} className={labelCls}>Emergency contact phone</label>
              <input
                id={idOf('ec-phone')}
                type="tel"
                className={inputCls}
                maxLength={30}
                value={form.emergency_contact_phone ?? ''}
                onChange={(e) => setForm({ ...form, emergency_contact_phone: e.target.value || null })}
              />
            </div>
          </div>
        </SectionCard>

        <SectionCard title={isCoachView ? 'Goal' : 'Your goal'} collapsible={isCoachView}>
          <div className="mt-3 space-y-4">
            <div className="space-y-1">
              <label htmlFor={idOf('goal')} className={labelCls}>{isCoachView ? 'What they want to achieve' : 'What do you want to achieve?'}</label>
              <textarea
                id={idOf('goal')}
                rows={7}
                aria-describedby={isCoachView ? undefined : idOf('goal-hint')}
                className={`${areaCls} resize-y leading-relaxed`}
                placeholder="Be as detailed as you can. What do you want to achieve and why does it matter to you? Is there a date or event you're working towards? What has worked or not worked before? Any injuries, health conditions or things we should know about?"
                maxLength={5000}
                value={form.goal_description ?? ''}
                onChange={(e) => setForm({ ...form, goal_description: e.target.value })}
              />
              {!isCoachView && <p id={idOf('goal-hint')} className="text-xs text-zinc-500">The more your coach knows, the better they can tailor your plan.</p>}
              {isCoachView && (() => {
                // Goals from the old Notes card not in the goal yet (CL10): before migration 0178 moves them, or one that would pass the
                // limit. "Add to goal" puts it in the box above; Save keeps it. The member sees the goal, so it is the coach's call.
                const waiting = goalsStillInNotes(notesGoals, form.goal_description);
                if (waiting.length === 0) return null;
                return (
                  <div className="mt-2 space-y-2 rounded-xl border border-dashed border-black/15 p-3 dark:border-white/15">
                    <p className="text-xs font-bold text-zinc-600 dark:text-zinc-300">
                      From the old Notes goals, not in the goal yet. The member sees the goal once it&apos;s in it.
                    </p>
                    {waiting.map((g) => {
                      const merged = mergeGoalText(form.goal_description, [g.body]);
                      const tooLong = merged.length > GOAL_MAX;
                      return (
                        <div key={g.id} className="flex items-start gap-2">
                          <p className="min-w-0 flex-1 whitespace-pre-wrap break-words text-sm text-black dark:text-zinc-100">
                            <span className="text-xs text-zinc-500">
                              {new Date(g.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}:{' '}
                            </span>
                            {g.body}
                          </p>
                          {!readOnly && (
                            <button
                              type="button"
                              disabled={tooLong}
                              title={tooLong ? 'The goal would pass 5,000 characters: shorten it first' : undefined}
                              onClick={() => setForm({ ...form, goal_description: merged })}
                              className="h-9 shrink-0 rounded-lg bg-accent-soft px-3 text-[13px] font-bold text-accent disabled:opacity-50"
                            >
                              Add to goal
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>
            <div className="space-y-1">
              <label htmlFor={idOf('experience')} className={labelCls}>Training experience</label>
              <textarea
                id={idOf('experience')}
                rows={3}
                className={`${areaCls} resize-y leading-relaxed`}
                placeholder="e.g. Trained on and off for 2 years, new to lifting weights, ex-athlete..."
                maxLength={2000}
                value={form.experience ?? ''}
                onChange={(e) => setForm({ ...form, experience: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                {/* In stones and pounds the two boxes name themselves ("Start weight, stones"), so the label points at neither. */}
                <label htmlFor={stLb ? undefined : idOf('start-weight')} className={labelCls}>Start weight ({stLb ? 'st & lb' : 'kg'})</label>
                {stLb ? (
                  <StLbInput
                    label="Start weight"
                    kg={form.start_weight || null}
                    disabled={startWeightLocked}
                    showKg={isCoachView}
                    inputClassName={inputCls}
                    onChange={(kg) => setForm((f) => ({ ...f, start_weight: kg ?? 0 }))}
                  />
                ) : (
                <input
                  id={idOf('start-weight')}
                  type="number"
                  step="0.1"
                  required
                  aria-describedby={startWeightLocked ? idOf('start-weight-hint') : undefined}
                  className={inputCls}
                  value={form.start_weight || ''}
                  disabled={startWeightLocked}
                  onChange={(e) => setForm({ ...form, start_weight: Number(e.target.value) })}
                />
                )}
                {startWeightLocked && <p id={idOf('start-weight-hint')} className="text-xs text-zinc-500">Set when you joined. Ask your coach to change it.</p>}
              </div>
              <div className="space-y-1">
                <label htmlFor={stLb ? undefined : idOf('goal-weight')} className={labelCls}>
                  Goal weight ({stLb ? 'st & lb' : 'kg'}) <span className="text-red-500">*</span>
                </label>
                {stLb ? (
                  <StLbInput
                    label="Goal weight"
                    kg={form.goal_weight || null}
                    showKg={isCoachView}
                    inputClassName={inputCls}
                    onChange={(kg) => setForm((f) => ({ ...f, goal_weight: kg ?? 0 }))}
                  />
                ) : (
                <input
                  id={idOf('goal-weight')}
                  type="number"
                  step="0.1"
                  required
                  className={inputCls}
                  value={form.goal_weight || ''}
                  onChange={(e) => setForm({ ...form, goal_weight: Number(e.target.value) })}
                />
                )}
              </div>
            </div>
          </div>
        </SectionCard>

        {/* The member's height and their own health notes, straight after the goal (CL8). */}
        {isCoachView && (initialProfile?.health_notes || initialProfile?.height_cm) && (
          <div className="rounded-2xl border border-amber-500/30 bg-amber-50 p-4 text-sm dark:bg-amber-500/10">
            {initialProfile?.health_notes && (
              <>
                <p className="text-xs font-bold uppercase tracking-wide text-amber-800 dark:text-amber-300">Injuries &amp; health notes</p>
                <p className="mt-1 whitespace-pre-wrap text-zinc-800 dark:text-zinc-200">{initialProfile.health_notes}</p>
              </>
            )}
            {initialProfile?.height_cm && (
              <p className={`${initialProfile.health_notes ? 'mt-2 ' : ''}text-xs text-zinc-600 dark:text-zinc-400`}>
                Height {initialProfile.height_cm} cm
                {initialProfile.body_fat_estimated ? ' · body fat % is an estimate (Nutrition plan), worth confirming with a scan' : ''}
              </p>
            )}
          </div>
        )}

        {isCoachView && !readOnly && (
          <div className="flex items-center justify-between gap-3 rounded-[20px] border border-black/[.08] bg-card p-4 dark:border-white/10">
            <p className="text-xs text-zinc-500">Ask this member to confirm their details. They see a banner on Home they can finish now or put off; the app keeps working either way.</p>
            <button
              type="button"
              disabled={asking}
              onClick={() => runAsk(() => requestDetailsUpdate(clientId), { success: 'Asked them to confirm their details' })}
              className="shrink-0 inline-flex h-10 items-center justify-center gap-1.5 rounded-xl border-[1.5px] border-black/20 px-3.5 text-[13px] font-bold text-black dark:border-white/25 dark:text-zinc-50 disabled:opacity-50"
            >
              Ask them
            </button>
          </div>
        )}

        {isCoachView && !readOnly && <MemberResetLink clientId={clientId} />}

        {/* The tick boxes come last (CL8). Each one saves as it is ticked; Save changes is for the boxes above. */}
        {isCoachView && !readOnly && screenToggles && <MemberScreenToggles clientId={clientId} {...screenToggles} />}
        {isCoachView && !readOnly && screenToggles && <MemberMetricToggles clientId={clientId} disabledMetrics={screenToggles.disabledMetrics} />}

        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

        {!readOnly && (
          <div className={isCoachView ? 'sticky bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-20 md:bottom-4' : ''}>
            {isCoachView ? (
              <Button type="submit" variant="primary" disabled={saving} className="min-h-12 w-full text-[15px] shadow-lg">
                {saving ? 'Saving…' : 'Save changes'}
              </Button>
            ) : (
              <button
                ref={saveButton}
                type="submit"
                disabled={saving}
                className="h-12 w-full rounded-xl bg-[#1d1d1b] text-[15px] font-bold text-white disabled:opacity-60 dark:bg-zinc-100 dark:text-[#1d1d1b]"
              >
                {saving ? 'Saving…' : 'Save changes'}
              </button>
            )}
          </div>
        )}
      </fieldset>
    </form>
  );
}
