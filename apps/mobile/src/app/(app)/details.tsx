import { useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

import type { ClientProfileRow } from '@ballistic/shared/data/types';
import { DETAIL_LIMITS, normalizeGender, validatePersonalDetails, type PersonalDetailsInput } from '@ballistic/shared/utils/personalDetails';

import { DateField, FieldLabel, Input, Pill } from '@/components/fields';
import { AppText, Button, Card, Screen, ScrollScreen } from '@/components/ui';
import { startWeightLocked, useSaveDetails } from '@/lib/details';
import { useClientProfile } from '@/lib/today';
import { spacing, useTheme } from '@/theme';

// The member's own details: who they are, how to reach them, their goal and their start and goal weight. Opened from Profile.
export default function Details() {
  const t = useTheme();
  const q = useClientProfile();
  if (q.isPending) {
    return (
      <Screen style={{ justifyContent: 'center' }}>
        <ActivityIndicator color={t.accent} />
      </Screen>
    );
  }
  if (q.isError) {
    return (
      <Screen style={{ justifyContent: 'center', gap: spacing.md }}>
        <AppText color="danger">Could not load your details: {q.error.message}</AppText>
        <Button title="Try again" onPress={() => q.refetch()} />
      </Screen>
    );
  }
  if (!q.data) {
    return (
      <Screen style={{ justifyContent: 'center', gap: spacing.sm }}>
        <AppText variant="heading">No details yet</AppText>
        <AppText color="muted">Finish setting up your account first.</AppText>
      </Screen>
    );
  }
  return <DetailsForm profile={q.data} />;
}

function fromProfile(p: ClientProfileRow): PersonalDetailsInput {
  return {
    name: p.name ?? '',
    gender: normalizeGender(p.gender),
    phone: p.phone ?? '',
    dateOfBirth: p.date_of_birth ?? '',
    address: p.address ?? '',
    emergencyContactName: p.emergency_contact_name ?? '',
    emergencyContactPhone: p.emergency_contact_phone ?? '',
    goalDescription: p.goal_description ?? '',
    experience: p.experience ?? '',
    startWeight: p.start_weight ? String(p.start_weight) : '',
    goalWeight: p.goal_weight ? String(p.goal_weight) : '',
  };
}

function DetailsForm({ profile }: { profile: ClientProfileRow }) {
  const save = useSaveDetails();
  // The form starts from what is saved and then belongs to the member; a refetch in the background never overwrites typing.
  const [f, setF] = useState<PersonalDetailsInput>(() => fromProfile(profile));
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [dobInvalid, setDobInvalid] = useState(false);
  const locked = startWeightLocked(profile);
  const set = (patch: Partial<PersonalDetailsInput>) => {
    setF((prev) => ({ ...prev, ...patch }));
    setDirty(true);
    setError(null);
    save.reset();
  };

  function submit() {
    // A date that is half typed or not a real day must not be saved as "no date".
    const problem = dobInvalid ? 'Please check your date of birth.' : validatePersonalDetails(f);
    if (problem) return setError(problem);
    save.mutate({ input: f, profile }, { onSuccess: () => setDirty(false) });
  }

  return (
    <ScrollScreen>
      <Card style={{ gap: spacing.md }}>
        <AppText variant="heading">About you</AppText>
        <View style={{ gap: 6 }}>
          <FieldLabel>Name</FieldLabel>
          <Input accessibilityLabel="Name" value={f.name} maxLength={DETAIL_LIMITS.name} autoComplete="name" textContentType="name" onChangeText={(v) => set({ name: v })} />
        </View>
        <View style={{ gap: 6 }}>
          <FieldLabel>Gender</FieldLabel>
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <Pill label="Female" active={f.gender === 'Female'} onPress={() => set({ gender: 'Female' })} />
            <Pill label="Male" active={f.gender === 'Male'} onPress={() => set({ gender: 'Male' })} />
          </View>
        </View>
        <View style={{ gap: 6 }}>
          <FieldLabel>Phone</FieldLabel>
          <Input accessibilityLabel="Phone" value={f.phone} keyboardType="phone-pad" autoComplete="tel" textContentType="telephoneNumber" maxLength={DETAIL_LIMITS.phone} onChangeText={(v) => set({ phone: v })} />
        </View>
        <DateField label="Date of birth" value={f.dateOfBirth} onChange={(dateOfBirth) => set({ dateOfBirth })} onInvalidChange={setDobInvalid} />
        <View style={{ gap: 6 }}>
          <FieldLabel>Address</FieldLabel>
          <Input accessibilityLabel="Address" value={f.address} autoComplete="street-address" textContentType="fullStreetAddress" maxLength={DETAIL_LIMITS.address} onChangeText={(v) => set({ address: v })} />
        </View>
        <View style={{ gap: 6 }}>
          <FieldLabel>Emergency contact name</FieldLabel>
          <Input accessibilityLabel="Emergency contact name" value={f.emergencyContactName} maxLength={DETAIL_LIMITS.emergencyName} onChangeText={(v) => set({ emergencyContactName: v })} />
        </View>
        <View style={{ gap: 6 }}>
          <FieldLabel>Emergency contact phone</FieldLabel>
          <Input accessibilityLabel="Emergency contact phone" value={f.emergencyContactPhone} keyboardType="phone-pad" maxLength={DETAIL_LIMITS.phone} onChangeText={(v) => set({ emergencyContactPhone: v })} />
        </View>
      </Card>

      <Card style={{ gap: spacing.md }}>
        <AppText variant="heading">Your goal</AppText>
        <View style={{ gap: 6 }}>
          <FieldLabel>What do you want to achieve?</FieldLabel>
          <Input accessibilityLabel="What do you want to achieve?" multiline style={{ minHeight: 140 }} value={f.goalDescription} maxLength={DETAIL_LIMITS.goal} onChangeText={(v) => set({ goalDescription: v })} placeholder="Be as detailed as you can. What do you want to achieve and why does it matter to you? Is there a date or event you're working towards? What has worked or not worked before? Any injuries, health conditions or things we should know about?" />
          <AppText variant="small" color="muted">The more your coach knows, the better they can tailor your plan.</AppText>
        </View>
        <View style={{ gap: 6 }}>
          <FieldLabel>Training experience</FieldLabel>
          <Input accessibilityLabel="Training experience" multiline value={f.experience} maxLength={DETAIL_LIMITS.experience} onChangeText={(v) => set({ experience: v })} placeholder="e.g. Trained on and off for 2 years, new to lifting weights, ex-athlete..." />
        </View>
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          <View style={{ flex: 1, gap: 6 }}>
            <FieldLabel>Start weight (kg)</FieldLabel>
            <Input accessibilityLabel="Start weight in kilograms" value={f.startWeight} keyboardType="decimal-pad" maxLength={6} editable={!locked} style={locked ? { opacity: 0.6 } : undefined} onChangeText={(v) => set({ startWeight: v.replace(',', '.') })} />
          </View>
          <View style={{ flex: 1, gap: 6 }}>
            <FieldLabel>Goal weight (kg)</FieldLabel>
            <Input accessibilityLabel="Goal weight in kilograms" value={f.goalWeight} keyboardType="decimal-pad" maxLength={6} onChangeText={(v) => set({ goalWeight: v.replace(',', '.') })} />
          </View>
        </View>
        {locked ? <AppText variant="small" color="muted">Your start weight is the baseline for your plan and progress charts, so only your coach can change it.</AppText> : null}
      </Card>

      {error ? <AppText color="danger" style={{ fontWeight: '600' }}>{error}</AppText> : null}
      {save.isError ? <AppText color="danger" style={{ fontWeight: '600' }}>{save.error.message}</AppText> : null}
      <Button title={save.isPending ? 'Saving…' : save.isSuccess && !dirty ? 'Saved ✓' : 'Save changes'} onPress={submit} loading={save.isPending} disabled={!dirty && !save.isSuccess} />
    </ScrollScreen>
  );
}
