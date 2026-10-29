import { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';

import type { ClientProfileRow } from '@ballistic/shared/data/types';
import { ACTIVITY_OPTIONS, needsBodyStep, PLAN_BEING_SET_UP, TRACKING_OPTIONS } from '@ballistic/shared/onboarding';
import { CONSENT_LABEL, CONSENT_POINTS, CONSENT_TITLE } from '@ballistic/shared/utils/consentText';
import { worthSaving } from '@ballistic/shared/utils/onboardingDraft';
import { BLANK_ANSWERS, FULL_STEPS, SHORT_STEPS, SHORT_STEPS_WITH_BODY, STEP_TITLE, answersFromProfile, planFor, stepError, type OnboardingAnswers, type OnboardingStep } from '@ballistic/shared/utils/onboardingForm';
import { cmToFtIn, ftInToCm, kgToStLb, stLbToKg } from '@ballistic/shared/utils/units';

import { Pressable } from '@/components/press';
import { ChoiceRow, DateField, FieldLabel, Input, Pill } from '@/components/fields';
import { BrandMark } from '@/components/brand';
import { Icon } from '@/components/icons';
import { AppText, Button, ScrollScreen } from '@/components/ui';
import { useCompleteOnboarding } from '@/lib/details';
import { loadOnboardingDraft, saveOnboardingDraft } from '@/lib/drafts';
import { useSession } from '@/lib/session';
import { radius, spacing, useTheme } from '@/theme';

// A weight the member can type in kg, or in stones and pounds (UK members often only know stones).
function WeightField({ label, kg, onChange }: { label: string; kg: number | null; onChange: (kg: number | null) => void }) {
  const [unit, setUnit] = useState<'kg' | 'st'>('kg');
  const [text, setText] = useState(kg != null ? String(kg) : '');
  const initial = kg != null ? kgToStLb(kg) : null;
  const [st, setSt] = useState(initial ? String(initial.st) : '');
  const [lb, setLb] = useState(initial ? String(initial.lb) : '');

  const pushStLb = (nextSt: string, nextLb: string) => onChange(stLbToKg(nextSt, nextLb));
  return (
    <View style={{ gap: 6 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <FieldLabel>{label}</FieldLabel>
        <UnitToggle options={[['kg', 'kg'], ['st', 'st & lb']]} value={unit} onChange={(u) => setUnit(u as 'kg' | 'st')} />
      </View>
      {unit === 'kg' ? (
        <Input
          accessibilityLabel={`${label} in kilograms`}
          keyboardType="decimal-pad"
          placeholder="e.g. 82.5"
          value={text}
          maxLength={6}
          onChangeText={(v) => {
            setText(v);
            const n = v.trim() === '' ? null : Number(v.replace(',', '.'));
            onChange(n != null && Number.isFinite(n) ? n : null);
          }}
        />
      ) : (
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          <Input accessibilityLabel={`${label}, stone`} style={{ flex: 1 }} keyboardType="number-pad" placeholder="stone" value={st} maxLength={2} onChangeText={(v) => { setSt(v); pushStLb(v, lb); }} />
          <Input accessibilityLabel={`${label}, pounds`} style={{ flex: 1 }} keyboardType="decimal-pad" placeholder="lb" value={lb} maxLength={5} onChangeText={(v) => { setLb(v); pushStLb(st, v); }} />
        </View>
      )}
      {kg != null && unit === 'st' ? <AppText variant="small" color="muted">{kg.toFixed(1)} kg</AppText> : null}
    </View>
  );
}

function HeightField({ cm, onChange }: { cm: number | null; onChange: (cm: number | null) => void }) {
  const [unit, setUnit] = useState<'cm' | 'ft'>('cm');
  const [text, setText] = useState(cm != null ? String(cm) : '');
  const initial = cm != null ? cmToFtIn(cm) : null;
  const [ft, setFt] = useState(initial ? String(initial.ft) : '');
  const [inch, setInch] = useState(initial ? String(initial.inch) : '');
  const pushFtIn = (nextFt: string, nextIn: string) => onChange(ftInToCm(nextFt, nextIn));
  return (
    <View style={{ gap: 6 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <FieldLabel>Height</FieldLabel>
        <UnitToggle options={[['cm', 'cm'], ['ft', 'ft & in']]} value={unit} onChange={(u) => setUnit(u as 'cm' | 'ft')} />
      </View>
      {unit === 'cm' ? (
        <Input
          accessibilityLabel="Height in centimetres"
          keyboardType="number-pad"
          placeholder="e.g. 172"
          value={text}
          maxLength={3}
          onChangeText={(v) => {
            setText(v);
            onChange(v === '' ? null : Number(v));
          }}
        />
      ) : (
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          <Input accessibilityLabel="Height, feet" style={{ flex: 1 }} keyboardType="number-pad" placeholder="feet" value={ft} maxLength={1} onChangeText={(v) => { setFt(v); pushFtIn(v, inch); }} />
          <Input accessibilityLabel="Height, inches" style={{ flex: 1 }} keyboardType="decimal-pad" placeholder="inches" value={inch} maxLength={4} onChangeText={(v) => { setInch(v); pushFtIn(ft, v); }} />
        </View>
      )}
      {cm != null && unit === 'ft' ? <AppText variant="small" color="muted">{cm} cm</AppText> : null}
    </View>
  );
}

function UnitToggle({ options, value, onChange }: { options: [string, string][]; value: string; onChange: (v: string) => void }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', backgroundColor: t.cardMuted, borderRadius: 999, padding: 2 }}>
      {options.map(([v, label]) => (
        <Pressable key={v} onPress={() => onChange(v)} accessibilityRole="button" accessibilityState={{ selected: value === v }} style={{ borderRadius: 999, paddingHorizontal: 11, paddingVertical: 4, backgroundColor: value === v ? t.accent : 'transparent' }}>
          <AppText style={{ color: value === v ? t.accentForeground : t.muted, fontSize: 12, fontWeight: '800' }}>{label}</AppText>
        </Pressable>
      ))}
    </View>
  );
}

function Heading({ children }: { children: React.ReactNode }) {
  return <AppText style={{ fontSize: 22, fontWeight: '800' }}>{children}</AppText>;
}

// The new-member questions (or, for an existing member the coach asked to confirm their details, the short version).
// Answers are only saved on the last step; nothing is written before then.
export function OnboardingFlow({
  email,
  coachFirstName,
  existing,
  onFinished,
}: {
  email: string;
  coachFirstName: string | null;
  existing: ClientProfileRow | null;
  onFinished: (info: { firstName: string; short: boolean }) => void;
}) {
  const t = useTheme();
  const { session, signOut } = useSession();
  const userId = session?.user.id ?? '';
  const short = existing != null;
  // A member whose profile has no height or weights is asked for them in the short version too (OB3).
  const withBody = short && needsBodyStep(existing);
  const steps: readonly OnboardingStep[] = short ? (withBody ? SHORT_STEPS_WITH_BODY : SHORT_STEPS) : FULL_STEPS;
  // Answers typed before the app was closed or the phone ran out of memory come back (kept on this phone for a week at most).
  const [draft] = useState(() => (userId ? loadOnboardingDraft(userId) : null));
  const [step, setStep] = useState(() => (draft ? Math.min(draft.step, steps.length - 1) : -1)); // -1 = welcome, 0..n-1 = the questions
  const [answers, setAnswers] = useState<OnboardingAnswers>(() => {
    const base = existing ? answersFromProfile(existing) : BLANK_ANSWERS;
    if (!draft) return base;
    const { v: _v, savedAt: _savedAt, step: _step, ...saved } = draft as typeof draft & { v: 1 };
    return { ...base, ...saved };
  });
  const [error, setError] = useState<string | null>(null);
  const complete = useCompleteOnboarding();
  const set = (patch: Partial<OnboardingAnswers>) => setAnswers((a) => ({ ...a, ...patch }));
  const plan = useMemo(() => planFor(answers), [answers]);
  const coach = coachFirstName ?? 'Your coach';

  // Each change is kept as the member types (not on the welcome screen).
  useEffect(() => {
    if (!userId || step < 0) return;
    const d = { savedAt: Date.now(), step, ...answers };
    if (worthSaving({ step, name: answers.name, goal: answers.goal, phone: answers.phone, dob: answers.dob, health: answers.health, heightCm: answers.heightCm, weightKg: answers.weightKg })) saveOnboardingDraft(userId, d);
  }, [userId, step, answers]);

  function next() {
    const e = stepError(steps[step], answers);
    if (e) return setError(e);
    setError(null);
    setStep(step + 1);
  }
  function finish() {
    setError(null);
    complete.mutate(
      { answers, existing: short, withBody },
      { onSuccess: () => onFinished({ firstName: answers.name.trim().split(/\s+/)[0] ?? '', short }), onError: (e) => setError(e.message) },
    );
  }

  if (step === -1) {
    return (
      <ScrollScreen>
        <View style={{ alignItems: 'center', gap: spacing.md, paddingTop: spacing.xl }}>
          <BrandMark height={96} />
          <AppText style={{ fontSize: 26, fontWeight: '800', textAlign: 'center' }}>{short ? 'Quick details check' : "Let's get you set up"}</AppText>
          <AppText color="muted" style={{ textAlign: 'center' }}>
            {short
              ? `${coach} would like you to confirm a few details so everything is up to date. It takes about a minute, and your answers are filled in where we already have them.`
              : `A few quick questions so ${coachFirstName ?? 'your coach'} can build your plan. It takes about 3 minutes, and you can change anything later.`}
          </AppText>
          <View style={{ width: '100%', backgroundColor: t.card, borderWidth: 1, borderColor: t.border, borderRadius: radius.lg, padding: spacing.md, gap: 10 }}>
            {(short ? ['Your contact details', 'Your goal', ...(withBody ? ['Your height and weight'] : []), 'How you want to track food'] : ['About you and your goal', 'Your body and activity', 'How you want to track food', 'Your plan']).map((line) => (
              <View key={line} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Icon name="check" size={16} color={t.accent} strokeWidth={3} />
                <AppText>{line}</AppText>
              </View>
            ))}
          </View>
          <View style={{ width: '100%' }}>
            <Button title={short ? 'Start' : "Let's go"} onPress={() => setStep(0)} />
          </View>
          <AppText variant="small" color="muted">Signed in as {email}</AppText>
          <Pressable onPress={signOut} accessibilityRole="button" hitSlop={8}>
            <AppText variant="small" color="accent" style={{ fontWeight: '700' }}>Not you? Sign out</AppText>
          </Pressable>
        </View>
      </ScrollScreen>
    );
  }

  const key = steps[step];
  const last = step === steps.length - 1;
  return (
    <ScrollScreen>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        {step > 0 ? (
          <Pressable onPress={() => { setError(null); setStep(step - 1); }} accessibilityRole="button" accessibilityLabel="Back" style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: t.cardMuted, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="chevronLeft" size={20} color={t.foreground} />
          </Pressable>
        ) : (
          <View style={{ width: 38 }} />
        )}
        <View style={{ flex: 1, gap: 6 }}>
          <AppText variant="small" color="muted" style={{ fontWeight: '700' }}>Step {step + 1} of {steps.length} · {STEP_TITLE[key]}</AppText>
          <View style={{ flexDirection: 'row', gap: 4 }}>
            {steps.map((s, i) => <View key={s} style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: i <= step ? t.accent : t.border }} />)}
          </View>
        </View>
      </View>

      {key === 'consent' ? (
        <View style={{ gap: spacing.md }}>
          <Heading>{CONSENT_TITLE}</Heading>
          <View style={{ backgroundColor: t.card, borderWidth: 1, borderColor: t.border, borderRadius: radius.lg, padding: spacing.md, gap: 10 }}>
            {CONSENT_POINTS.map((point) => (
              <View key={point} style={{ flexDirection: 'row', gap: 10 }}>
                <Icon name="check" size={16} color={t.accent} strokeWidth={3} />
                <AppText style={{ flex: 1 }}>{point}</AppText>
              </View>
            ))}
          </View>
          <Pressable
            onPress={() => { setError(null); set({ consent: !answers.consent }); }}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: answers.consent }}
            accessibilityLabel={CONSENT_LABEL}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44 }}
          >
            <View style={{ width: 26, height: 26, borderRadius: 7, borderWidth: 2, borderColor: answers.consent ? t.accent : t.border, backgroundColor: answers.consent ? t.accent : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
              {answers.consent ? <Icon name="check" size={16} color={t.accentForeground} strokeWidth={3} /> : null}
            </View>
            <AppText style={{ flex: 1, fontWeight: '700' }}>{CONSENT_LABEL}</AppText>
          </Pressable>
        </View>
      ) : null}

      {key === 'about' ? (
        <View style={{ gap: spacing.md }}>
          <Heading>First, about you</Heading>
          <View style={{ gap: 6 }}>
            <FieldLabel>Full name</FieldLabel>
            <Input accessibilityLabel="Full name" autoComplete="name" textContentType="name" value={answers.name} maxLength={100} onChangeText={(v) => set({ name: v })} />
          </View>
          <View style={{ gap: 6 }}>
            <FieldLabel>Gender</FieldLabel>
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              <Pill label="Female" active={answers.gender === 'Female'} onPress={() => set({ gender: 'Female' })} />
              <Pill label="Male" active={answers.gender === 'Male'} onPress={() => set({ gender: 'Male' })} />
            </View>
            <AppText variant="small" color="muted">Used for your calorie calculation and fitness standards.</AppText>
          </View>
          <DateField label="Date of birth" value={answers.dob} onChange={(dob) => set({ dob })} />
          <View style={{ gap: 6 }}>
            <FieldLabel>Mobile number</FieldLabel>
            <Input accessibilityLabel="Mobile number" keyboardType="phone-pad" autoComplete="tel" textContentType="telephoneNumber" value={answers.phone} maxLength={30} onChangeText={(v) => set({ phone: v })} />
          </View>
          <View style={{ backgroundColor: t.card, borderWidth: 1, borderColor: t.border, borderRadius: radius.lg, padding: spacing.md, gap: spacing.sm }}>
            <AppText style={{ fontWeight: '800' }}>Emergency contact</AppText>
            <Input accessibilityLabel="Emergency contact name" placeholder="Their name" value={answers.emName} maxLength={100} onChangeText={(v) => set({ emName: v })} />
            <Input accessibilityLabel="Emergency contact number" placeholder="Their number" keyboardType="phone-pad" value={answers.emPhone} maxLength={30} onChangeText={(v) => set({ emPhone: v })} />
          </View>
        </View>
      ) : null}

      {key === 'goal' ? (
        <View style={{ gap: spacing.md }}>
          <Heading>Your goal</Heading>
          <View style={{ gap: 6 }}>
            <FieldLabel>What do you want to achieve?</FieldLabel>
            <Input accessibilityLabel="What do you want to achieve?" multiline style={{ minHeight: 150 }} maxLength={5000} value={answers.goal} onChangeText={(v) => set({ goal: v })} placeholder="Be as detailed as you can. What do you want to achieve and why does it matter to you? Is there a date or event you're working towards? What has worked or not worked before?" />
          </View>
          <View style={{ gap: 6 }}>
            <FieldLabel>Training experience</FieldLabel>
            <Input accessibilityLabel="Training experience" multiline maxLength={2000} value={answers.experience} onChangeText={(v) => set({ experience: v })} placeholder="e.g. New to the gym, trained on and off for 2 years…" />
          </View>
          <View style={{ gap: 6 }}>
            <FieldLabel hint="(optional)">Injuries or health conditions</FieldLabel>
            <Input accessibilityLabel="Injuries or health conditions" multiline maxLength={2000} value={answers.health} onChangeText={(v) => set({ health: v })} placeholder="Anything we should know about: injuries, medical conditions, medication, pregnancy…" />
          </View>
        </View>
      ) : null}

      {key === 'body' ? (
        <View style={{ gap: spacing.md }}>
          <Heading>Your body &amp; activity</Heading>
          <HeightField cm={answers.heightCm} onChange={(heightCm) => set({ heightCm })} />
          <WeightField label="Current weight" kg={answers.weightKg} onChange={(weightKg) => set({ weightKg })} />
          <WeightField label="Goal weight" kg={answers.goalKg} onChange={(goalKg) => set({ goalKg })} />
          <View style={{ gap: 8 }}>
            <FieldLabel>How active are you day to day?</FieldLabel>
            {ACTIVITY_OPTIONS.map((o) => <ChoiceRow key={o.value} title={o.label} hint={o.hint} selected={answers.activity === o.value} onPress={() => set({ activity: o.value })} />)}
          </View>
          <View style={{ gap: 8 }}>
            <FieldLabel>Do you know your body fat %?</FieldLabel>
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              <Pill label="I don't know" active={!answers.knowsBf} onPress={() => set({ knowsBf: false })} />
              <Pill label="Yes" active={answers.knowsBf} onPress={() => set({ knowsBf: true })} />
            </View>
            {answers.knowsBf ? (
              <Input accessibilityLabel="Body fat percentage" keyboardType="decimal-pad" placeholder="e.g. 28" value={answers.bf} maxLength={5} onChangeText={(v) => set({ bf: v })} />
            ) : (
              <AppText variant="small" color="muted">No problem. We&apos;ll estimate it and your coach can confirm it with a scan.</AppText>
            )}
          </View>
        </View>
      ) : null}

      {key === 'food' ? (
        <View style={{ gap: spacing.md }}>
          <Heading>How do you want to track your food?</Heading>
          <AppText color="muted" style={{ marginTop: -spacing.sm }}>You can change this later with your coach.</AppText>
          {TRACKING_OPTIONS.map((o) => <ChoiceRow key={o.value} title={o.label} hint={o.hint} badge={o.recommended ? 'Recommended' : undefined} selected={answers.mode === o.value} onPress={() => set({ mode: o.value })} />)}
        </View>
      ) : null}

      {key === 'plan' ? (
        <View style={{ gap: spacing.md }}>
          <Heading>Your daily plan</Heading>
          {plan ? (
            // The starting numbers come straight from a formula and nobody has looked at them, so they are not shown (M8, D6): the
            // coach checks them first, and they appear in the app once the coach has marked the plan reviewed.
            <View style={{ backgroundColor: t.accent, borderRadius: radius.lg, padding: spacing.lg, gap: 6 }}>
              <AppText style={{ color: t.accentForeground, fontSize: 22, fontWeight: '800' }}>{PLAN_BEING_SET_UP}</AppText>
              <AppText style={{ color: t.accentForeground, opacity: 0.9 }}>
                {coachFirstName ?? 'Your coach'} will look over the numbers worked out from your height, weight, age and activity{plan.bodyFatEstimated ? ' (your body fat was estimated, so they will confirm that too)' : ''}. Your daily calories and macros appear in the app as soon as they have checked them.
              </AppText>
            </View>
          ) : (
            <AppText color="muted">We couldn&apos;t work out a plan from those answers. Go back and check your details.</AppText>
          )}
        </View>
      ) : null}

      {error ? <AppText color="danger" style={{ fontWeight: '600' }}>{error}</AppText> : null}
      {last ? (
        <Button title={complete.isPending ? 'Saving…' : short ? 'Save & finish' : 'Looks good — finish'} onPress={finish} loading={complete.isPending} disabled={!short && !plan} />
      ) : (
        <Button title="Continue" onPress={next} />
      )}
    </ScrollScreen>
  );
}

// "You're all set": shown once the answers are saved, until the member taps through to the app.
export function OnboardingDone({ firstName, short, coachFirstName, onContinue }: { firstName: string; short: boolean; coachFirstName: string | null; onContinue: () => void }) {
  const t = useTheme();
  return (
    <ScrollScreen>
      <View style={{ alignItems: 'center', gap: spacing.md, paddingTop: spacing.xl }}>
        <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: t.accent, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="check" size={32} color={t.accentForeground} strokeWidth={3} />
        </View>
        <AppText style={{ fontSize: 26, fontWeight: '800', textAlign: 'center' }}>You&apos;re all set{firstName ? `, ${firstName}` : ''}!</AppText>
        <AppText color="muted" style={{ textAlign: 'center' }}>
          {short ? 'Thanks, your details are up to date.' : `${coachFirstName ?? 'Your coach'} will look over your plan and may tweak it. Your coach will also activate your membership so you can book sessions.`}
        </AppText>
        <View style={{ width: '100%' }}>
          <Button title="Go to my dashboard" onPress={onContinue} />
        </View>
      </View>
    </ScrollScreen>
  );
}
