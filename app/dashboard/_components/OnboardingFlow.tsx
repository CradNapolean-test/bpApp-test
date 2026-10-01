'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, ChevronLeft, PlusSquare, Share } from 'lucide-react';
import { Logo } from '@/app/_components/Logo';
import { Button } from '@/app/_components/Button';
import { completeOnboarding, completeShortOnboarding } from '@/lib/data/onboarding';
import { ACTIVITY_OPTIONS, ageFromDob, buildOnboardingPlan, TRACKING_OPTIONS } from '@/lib/onboarding';
import type { TrackingMode } from '@/lib/onboarding';
import type { ClientProfileRow } from '@/lib/data/types';

const FULL_STEPS = ['about', 'goal', 'body', 'food', 'plan'] as const;
// Existing members: just confirm details, goal and how they track food (no body stats or plan).
const SHORT_STEPS = ['about', 'goal', 'food'] as const;
type StepKey = (typeof FULL_STEPS)[number];
const STEP_TITLE: Record<StepKey, string> = {
  about: 'About you',
  goal: 'Your goal',
  body: 'Your body',
  food: 'Food tracking',
  plan: 'Your plan',
};

const inputCls = 'w-full rounded-xl border border-black/10 bg-transparent px-3.5 py-3 text-base dark:border-white/10';
const labelCls = 'text-sm font-semibold text-zinc-700 dark:text-zinc-300';

const KG_PER_ST = 6.35029;
const toKg = (st: string, lb: string) => (Number(st) || 0) * KG_PER_ST + (Number(lb) || 0) * 0.453592;
const CM_PER_IN = 2.54;

// A weight the member can type in kg or stones & pounds (UK members often only know stones).
function WeightField({ label, kg, onChange }: { label: string; kg: number | null; onChange: (kg: number | null) => void }) {
  const [unit, setUnit] = useState<'kg' | 'st'>('kg');
  const [text, setText] = useState(kg != null ? String(kg) : '');
  const [st, setSt] = useState('');
  const [lb, setLb] = useState('');

  function pushStLb(nextSt: string, nextLb: string) {
    const v = toKg(nextSt, nextLb);
    onChange(v > 0 ? Math.round(v * 10) / 10 : null);
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <label className={labelCls}>{label}</label>
        <div className="flex rounded-full bg-black/5 p-0.5 text-xs font-bold dark:bg-white/10">
          {(['kg', 'st'] as const).map((u) => (
            <button
              key={u}
              type="button"
              onClick={() => setUnit(u)}
              className={`rounded-full px-2.5 py-1 ${unit === u ? 'bg-accent text-accent-foreground' : 'text-zinc-500'}`}
            >
              {u === 'kg' ? 'kg' : 'st & lb'}
            </button>
          ))}
        </div>
      </div>
      {unit === 'kg' ? (
        <input
          type="number"
          inputMode="decimal"
          step="0.1"
          className={inputCls}
          placeholder="e.g. 82.5"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            onChange(e.target.value === '' ? null : Number(e.target.value));
          }}
        />
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <input
            type="number"
            inputMode="numeric"
            className={inputCls}
            placeholder="stone"
            value={st}
            onChange={(e) => {
              setSt(e.target.value);
              pushStLb(e.target.value, lb);
            }}
          />
          <input
            type="number"
            inputMode="decimal"
            className={inputCls}
            placeholder="lb"
            value={lb}
            onChange={(e) => {
              setLb(e.target.value);
              pushStLb(st, e.target.value);
            }}
          />
        </div>
      )}
      {kg != null && unit === 'st' && <p className="text-xs text-zinc-500">{kg.toFixed(1)} kg</p>}
    </div>
  );
}

function HeightField({ cm, onChange }: { cm: number | null; onChange: (cm: number | null) => void }) {
  const [unit, setUnit] = useState<'cm' | 'ft'>('cm');
  const [text, setText] = useState(cm != null ? String(cm) : '');
  const [ft, setFt] = useState('');
  const [inch, setInch] = useState('');

  function pushFtIn(nextFt: string, nextIn: string) {
    const v = ((Number(nextFt) || 0) * 12 + (Number(nextIn) || 0)) * CM_PER_IN;
    onChange(v > 0 ? Math.round(v) : null);
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <label className={labelCls}>Height</label>
        <div className="flex rounded-full bg-black/5 p-0.5 text-xs font-bold dark:bg-white/10">
          {(['cm', 'ft'] as const).map((u) => (
            <button
              key={u}
              type="button"
              onClick={() => setUnit(u)}
              className={`rounded-full px-2.5 py-1 ${unit === u ? 'bg-accent text-accent-foreground' : 'text-zinc-500'}`}
            >
              {u === 'cm' ? 'cm' : 'ft & in'}
            </button>
          ))}
        </div>
      </div>
      {unit === 'cm' ? (
        <input
          type="number"
          inputMode="numeric"
          className={inputCls}
          placeholder="e.g. 172"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            onChange(e.target.value === '' ? null : Number(e.target.value));
          }}
        />
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <input
            type="number"
            inputMode="numeric"
            className={inputCls}
            placeholder="feet"
            value={ft}
            onChange={(e) => {
              setFt(e.target.value);
              pushFtIn(e.target.value, inch);
            }}
          />
          <input
            type="number"
            inputMode="decimal"
            className={inputCls}
            placeholder="inches"
            value={inch}
            onChange={(e) => {
              setInch(e.target.value);
              pushFtIn(ft, e.target.value);
            }}
          />
        </div>
      )}
      {cm != null && unit === 'ft' && <p className="text-xs text-zinc-500">{cm} cm</p>}
    </div>
  );
}

function Pill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-4 py-2.5 text-sm font-bold transition-colors ${
        active ? 'border-accent bg-accent text-accent-foreground' : 'border-black/10 text-zinc-600 dark:border-white/15 dark:text-zinc-300'
      }`}
    >
      {children}
    </button>
  );
}

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

// What the final "install the app" step needs: is this already the installed app, is it an iPhone
// (which has no install button, so we show the Share -> Add to Home Screen steps), and on Android
// the browser's own install prompt if it offered one.
function useInstallState() {
  const [standalone, setStandalone] = useState(false);
  const [ios, setIos] = useState(false);
  const [installEvent, setInstallEvent] = useState<InstallPromptEvent | null>(null);
  useEffect(() => {
    // Read the device after mount (it can't be known during server rendering).
    Promise.resolve().then(() => {
      setStandalone(window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true);
      setIos(/iphone|ipad|ipod/i.test(navigator.userAgent));
    });
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setInstallEvent(e as InstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    return () => window.removeEventListener('beforeinstallprompt', onPrompt);
  }, []);
  return { standalone, ios, installEvent };
}

export function OnboardingFlow({
  clientId,
  email,
  coachFirstName,
  existing = null,
}: {
  clientId: string;
  email: string;
  coachFirstName: string | null;
  // An existing member being asked to confirm their details gets the short version.
  existing?: ClientProfileRow | null;
}) {
  const router = useRouter();
  const short = existing != null;
  const steps: readonly StepKey[] = short ? SHORT_STEPS : FULL_STEPS;
  const doneStep = steps.length;
  const [step, setStep] = useState(-1); // -1 = welcome, 0..n-1 = questions, n = done
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState(existing?.name ?? '');
  const [gender, setGender] = useState<'Female' | 'Male' | null>(
    existing?.gender === 'Male' ? 'Male' : existing?.gender === 'Female' ? 'Female' : null
  );
  const [dob, setDob] = useState(existing?.date_of_birth ?? '');
  const [phone, setPhone] = useState(existing?.phone ?? '');
  const [emName, setEmName] = useState(existing?.emergency_contact_name ?? '');
  const [emPhone, setEmPhone] = useState(existing?.emergency_contact_phone ?? '');
  const [goal, setGoal] = useState(existing?.goal_description ?? '');
  const [experience, setExperience] = useState(existing?.experience ?? '');
  const [health, setHealth] = useState(existing?.health_notes ?? '');
  const [heightCm, setHeightCm] = useState<number | null>(null);
  const [weightKg, setWeightKg] = useState<number | null>(null);
  const [goalKg, setGoalKg] = useState<number | null>(null);
  const [activity, setActivity] = useState<number>(1.5);
  const [knowsBf, setKnowsBf] = useState(false);
  const [bf, setBf] = useState('');
  const [mode, setMode] = useState<TrackingMode>(existing?.nutrition_tracking_mode ?? 'full_tracking');
  const install = useInstallState();

  const age = dob ? ageFromDob(dob) : null;
  const bfNumber = knowsBf && bf !== '' ? Number(bf) : null;

  const plan = useMemo(() => {
    if (!gender || age == null || !weightKg || !goalKg || !heightCm) return null;
    return buildOnboardingPlan({
      gender,
      age,
      startWeight: weightKg,
      goalWeight: goalKg,
      heightCm,
      activityLevel: activity,
      bodyFatPct: bfNumber,
      hasHealthNotes: health.trim().length > 0,
    });
  }, [gender, age, weightKg, goalKg, heightCm, activity, bfNumber, health]);

  function stepError(index: number): string | null {
    const key = steps[index];
    if (key === 'about') {
      if (!name.trim()) return 'Please enter your name.';
      if (!gender) return 'Please choose an option for gender (we use it for your calorie calculation).';
      if (age == null || age < 10 || age > 100) return 'Please enter your date of birth.';
      if (!phone.trim()) return 'Please add a mobile number.';
      if (!emName.trim() || !emPhone.trim()) return 'Please add an emergency contact name and number.';
    }
    if (key === 'goal' && goal.trim().length < 10) return 'Tell us a little about your goal so your coach can help.';
    if (key === 'body') {
      if (!heightCm || heightCm < 120 || heightCm > 230) return 'Please check your height.';
      if (!weightKg || weightKg < 30 || weightKg > 300) return 'Please check your current weight.';
      if (!goalKg || goalKg < 30 || goalKg > 300) return 'Please check your goal weight.';
      if (knowsBf && (bfNumber == null || bfNumber < 3 || bfNumber > 60)) return 'Please check your body fat %, or choose "I don\'t know".';
    }
    return null;
  }

  function next() {
    const e = stepError(step);
    if (e) {
      setError(e);
      return;
    }
    setError(null);
    setStep(step + 1);
  }

  async function finish() {
    if (!gender) return;
    if (short) {
      setSaving(true);
      setError(null);
      const res = await completeShortOnboarding(clientId, {
        name,
        gender,
        dateOfBirth: dob,
        phone,
        emergencyContactName: emName,
        emergencyContactPhone: emPhone,
        goalDescription: goal,
        experience,
        healthNotes: health,
        nutritionTrackingMode: mode,
      });
      setSaving(false);
      if (!res.ok) {
        setError(res.error ?? 'Something went wrong. Please try again.');
        return;
      }
      setStep(doneStep);
      return;
    }
    if (!weightKg || !goalKg || !heightCm) return;
    setSaving(true);
    setError(null);
    const res = await completeOnboarding(clientId, {
      name,
      gender,
      dateOfBirth: dob,
      phone,
      emergencyContactName: emName,
      emergencyContactPhone: emPhone,
      goalDescription: goal,
      experience,
      healthNotes: health,
      startWeight: weightKg,
      goalWeight: goalKg,
      heightCm,
      activityLevel: activity,
      bodyFatPct: bfNumber,
      nutritionTrackingMode: mode,
    });
    setSaving(false);
    if (!res.ok) {
      setError(res.error ?? 'Something went wrong. Please try again.');
      return;
    }
    setStep(doneStep);
  }

  const shell = (children: React.ReactNode) => (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-5 pb-8 pt-6">{children}</div>
  );

  if (step === -1) {
    return shell(
      <div className="flex flex-1 flex-col items-center justify-center gap-5 text-center">
        <Logo variant="full" size={96} />
        <h1 className="text-2xl font-extrabold text-black dark:text-zinc-50">{short ? 'Quick details check' : "Let's get you set up"}</h1>
        <p className="text-sm text-zinc-500">
          {short
            ? `${coachFirstName ?? 'Your coach'} would like you to confirm a few details so everything is up to date. It takes about a minute, and your answers are filled in where we already have them.`
            : `A few quick questions so ${coachFirstName ?? 'your coach'} can build your plan. It takes about 3 minutes, and you can change anything later.`}
        </p>
        <ul className="w-full space-y-2 rounded-2xl border border-black/[.06] bg-card p-4 text-left text-sm dark:border-white/10">
          {(short
            ? ['Your contact details', 'Your goal', 'How you want to track food']
            : ['About you and your goal', 'Your body and activity', 'How you want to track food', 'Your daily calories & macros']
          ).map((t) => (
            <li key={t} className="flex items-center gap-2 text-zinc-700 dark:text-zinc-300">
              <Check className="h-4 w-4 text-accent" /> {t}
            </li>
          ))}
        </ul>
        <Button variant="primary" className="w-full !rounded-full py-3 text-base" onClick={() => setStep(0)}>
          {short ? 'Start' : "Let's go"}
        </Button>
        <p className="text-xs text-zinc-400">Signed in as {email}</p>
      </div>
    );
  }

  if (step === doneStep) {
    const firstName = name ? name.split(' ')[0] : '';
    return shell(
      <div className="flex flex-1 flex-col items-center justify-center gap-5 text-center">
        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-accent text-accent-foreground">
          <Check className="h-8 w-8" />
        </span>
        <h1 className="text-2xl font-extrabold text-black dark:text-zinc-50">You&apos;re all set{firstName ? `, ${firstName}` : ''}!</h1>
        <p className="text-sm text-zinc-500">
          {short
            ? 'Thanks, your details are up to date.'
            : `${coachFirstName ?? 'Your coach'} will look over your plan and may tweak it. Your coach will also activate your membership so you can book sessions.`}
        </p>

        {!install.standalone && (
          <div className="w-full space-y-3 rounded-2xl border border-accent/30 bg-card p-4 text-left">
            <p className="text-sm font-extrabold text-black dark:text-zinc-50">Last step: add the app to your home screen</p>
            <p className="text-xs text-zinc-500">
              It opens like any other app, and the first time you open it from your home screen we&apos;ll ask to turn on
              notifications so you never miss a message from your coach.
            </p>
            {install.installEvent ? (
              <Button
                variant="primary"
                className="w-full !rounded-full py-2.5"
                onClick={async () => {
                  await install.installEvent?.prompt();
                }}
              >
                Install the app
              </Button>
            ) : install.ios ? (
              <ol className="space-y-2 text-sm text-zinc-700 dark:text-zinc-300">
                <li className="flex items-center gap-2"><span className="font-bold text-accent">1.</span> Tap the <Share className="inline h-4 w-4" /> Share button in Safari</li>
                <li className="flex items-center gap-2"><span className="font-bold text-accent">2.</span> Choose <PlusSquare className="inline h-4 w-4" /> <b>Add to Home Screen</b></li>
                <li className="flex items-center gap-2"><span className="font-bold text-accent">3.</span> Open Ballistic from your home screen</li>
              </ol>
            ) : (
              <ol className="space-y-2 text-sm text-zinc-700 dark:text-zinc-300">
                <li><span className="font-bold text-accent">1.</span> Open your browser menu (⋮)</li>
                <li><span className="font-bold text-accent">2.</span> Choose <b>Install app</b> or <b>Add to Home screen</b></li>
                <li><span className="font-bold text-accent">3.</span> Open Ballistic from your home screen</li>
              </ol>
            )}
          </div>
        )}

        <Button
          variant={install.standalone ? 'primary' : 'outline'}
          className="w-full !rounded-full py-3 text-base"
          onClick={() => {
            router.refresh();
          }}
        >
          {install.standalone ? 'Go to my dashboard' : "I'll do it later — go to my dashboard"}
        </Button>
      </div>
    );
  }

  return shell(
    <>
      <div className="flex items-center gap-3">
        {step > 0 ? (
          <button type="button" aria-label="Back" onClick={() => { setError(null); setStep(step - 1); }} className="rounded-full bg-black/5 p-2 dark:bg-white/10">
            <ChevronLeft className="h-5 w-5" />
          </button>
        ) : (
          <span className="w-9" />
        )}
        <div className="flex-1">
          <p className="text-xs font-semibold text-zinc-500">
            Step {step + 1} of {steps.length} · {STEP_TITLE[steps[step]]}
          </p>
          <div className="mt-1.5 flex gap-1">
            {steps.map((s, i) => (
              <span key={s} className={`h-1.5 flex-1 rounded-full ${i <= step ? 'bg-accent' : 'bg-black/10 dark:bg-white/10'}`} />
            ))}
          </div>
        </div>
      </div>

      <div className="mt-6 flex-1 space-y-5">
        {steps[step] === 'about' && (
          <>
            <h2 className="text-xl font-extrabold text-black dark:text-zinc-50">First, about you</h2>
            <div className="space-y-1.5">
              <label className={labelCls}>Full name</label>
              <input className={inputCls} autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <label className={labelCls}>Gender</label>
              <div className="flex gap-2">
                <Pill active={gender === 'Female'} onClick={() => setGender('Female')}>Female</Pill>
                <Pill active={gender === 'Male'} onClick={() => setGender('Male')}>Male</Pill>
              </div>
              <p className="text-xs text-zinc-500">Used for your calorie calculation and fitness standards.</p>
            </div>
            <div className="space-y-1.5">
              <label className={labelCls}>Date of birth</label>
              <input type="date" className={inputCls} value={dob} onChange={(e) => setDob(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <label className={labelCls}>Mobile number</label>
              <input type="tel" className={inputCls} autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
            <div className="space-y-3 rounded-2xl border border-black/[.06] bg-card p-4 dark:border-white/10">
              <p className="text-sm font-bold text-black dark:text-zinc-50">Emergency contact</p>
              <input className={inputCls} placeholder="Their name" value={emName} onChange={(e) => setEmName(e.target.value)} />
              <input type="tel" className={inputCls} placeholder="Their number" value={emPhone} onChange={(e) => setEmPhone(e.target.value)} />
            </div>
          </>
        )}

        {steps[step] === 'goal' && (
          <>
            <h2 className="text-xl font-extrabold text-black dark:text-zinc-50">Your goal</h2>
            <div className="space-y-1.5">
              <label className={labelCls}>What do you want to achieve?</label>
              <textarea
                rows={7}
                className={`${inputCls} resize-y leading-relaxed`}
                placeholder="Be as detailed as you can. What do you want to achieve and why does it matter to you? Is there a date or event you're working towards? What has worked or not worked before?"
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <label className={labelCls}>Training experience</label>
              <textarea rows={3} className={`${inputCls} resize-y`} placeholder="e.g. New to the gym, trained on and off for 2 years…" value={experience} onChange={(e) => setExperience(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <label className={labelCls}>Injuries or health conditions <span className="font-normal text-zinc-400">(optional)</span></label>
              <textarea rows={3} className={`${inputCls} resize-y`} placeholder="Anything we should know about: injuries, medical conditions, medication, pregnancy…" value={health} onChange={(e) => setHealth(e.target.value)} />
            </div>
          </>
        )}

        {steps[step] === 'body' && (
          <>
            <h2 className="text-xl font-extrabold text-black dark:text-zinc-50">Your body &amp; activity</h2>
            <HeightField cm={heightCm} onChange={setHeightCm} />
            <WeightField label="Current weight" kg={weightKg} onChange={setWeightKg} />
            <WeightField label="Goal weight" kg={goalKg} onChange={setGoalKg} />
            <div className="space-y-2">
              <label className={labelCls}>How active are you day to day?</label>
              <div className="space-y-2">
                {ACTIVITY_OPTIONS.map((o) => (
                  <button
                    key={o.value}
                    type="button"
                    onClick={() => setActivity(o.value)}
                    className={`flex w-full items-center justify-between rounded-2xl border p-3.5 text-left ${
                      activity === o.value ? 'border-accent bg-accent-soft' : 'border-black/10 dark:border-white/15'
                    }`}
                  >
                    <span>
                      <span className="block text-sm font-bold text-black dark:text-zinc-50">{o.label}</span>
                      <span className="block text-xs text-zinc-500">{o.hint}</span>
                    </span>
                    {activity === o.value && <Check className="h-4 w-4 text-accent" />}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <label className={labelCls}>Do you know your body fat %?</label>
              <div className="flex gap-2">
                <Pill active={!knowsBf} onClick={() => setKnowsBf(false)}>I don&apos;t know</Pill>
                <Pill active={knowsBf} onClick={() => setKnowsBf(true)}>Yes</Pill>
              </div>
              {knowsBf ? (
                <input type="number" inputMode="decimal" step="0.1" className={inputCls} placeholder="e.g. 28" value={bf} onChange={(e) => setBf(e.target.value)} />
              ) : (
                <p className="text-xs text-zinc-500">No problem. We&apos;ll estimate it and your coach can confirm it with a scan.</p>
              )}
            </div>
          </>
        )}

        {steps[step] === 'food' && (
          <>
            <h2 className="text-xl font-extrabold text-black dark:text-zinc-50">How do you want to track your food?</h2>
            <p className="-mt-2 text-sm text-zinc-500">You can change this later with your coach.</p>
            <div className="space-y-2.5">
              {TRACKING_OPTIONS.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => setMode(o.value)}
                  className={`flex w-full items-start justify-between gap-3 rounded-2xl border p-4 text-left ${
                    mode === o.value ? 'border-accent bg-accent-soft' : 'border-black/10 dark:border-white/15'
                  }`}
                >
                  <span>
                    <span className="flex items-center gap-2 text-sm font-extrabold text-black dark:text-zinc-50">
                      {o.label}
                      {o.recommended && <span className="rounded-full bg-accent px-2 py-0.5 text-[10px] font-bold text-accent-foreground">Recommended</span>}
                    </span>
                    <span className="mt-1 block text-xs text-zinc-500">{o.hint}</span>
                  </span>
                  {mode === o.value && <Check className="mt-0.5 h-4 w-4 shrink-0 text-accent" />}
                </button>
              ))}
            </div>
          </>
        )}

        {steps[step] === 'plan' && (
          <>
            <h2 className="text-xl font-extrabold text-black dark:text-zinc-50">Your daily plan</h2>
            {plan ? (
              <>
                <div className="rounded-2xl bg-accent p-5 text-accent-foreground">
                  <p className="text-xs opacity-85">Daily calories to start</p>
                  <p className="text-4xl font-extrabold">{plan.calories} <span className="text-lg font-bold">kcal</span></p>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { l: 'Protein', v: plan.protein, c: '#a07aff' },
                    { l: 'Carbs', v: plan.carbs, c: '#e8a020' },
                    { l: 'Fat', v: plan.fat, c: '#2ecc71' },
                  ].map((m) => (
                    <div key={m.l} className="rounded-2xl border border-black/[.06] bg-card p-3 text-center dark:border-white/10">
                      <p className="text-[11px] font-bold uppercase tracking-wide" style={{ color: m.c }}>{m.l}</p>
                      <p className="mt-0.5 text-xl font-extrabold text-black dark:text-zinc-50">{m.v}<span className="text-xs font-bold text-zinc-500">g</span></p>
                    </div>
                  ))}
                </div>
                <p className="text-sm text-zinc-500">
                  This is your starting point, worked out from your height, weight, age and activity.{' '}
                  {plan.bodyFatEstimated ? 'Your body fat was estimated, so ' : ''}
                  {coachFirstName ?? 'your coach'} will review it and adjust it as you go.
                </p>
              </>
            ) : (
              <p className="text-sm text-zinc-500">We couldn&apos;t work out a plan from those answers. Go back and check your details.</p>
            )}
          </>
        )}
      </div>

      {error && <p className="mt-4 text-sm font-medium text-red-600 dark:text-red-400">{error}</p>}
      <div className="mt-6">
        {step < steps.length - 1 ? (
          <Button variant="primary" className="w-full !rounded-full py-3 text-base" onClick={next}>
            Continue
          </Button>
        ) : (
          <Button variant="primary" className="w-full !rounded-full py-3 text-base" disabled={saving || (!short && !plan)} onClick={finish}>
            {saving ? 'Saving…' : short ? 'Save & finish' : 'Looks good — finish'}
          </Button>
        )}
      </div>
    </>
  );
}
