import { useState } from 'react';
import { ActivityIndicator } from 'react-native';

import type { ClientProfileRow, FoodDiaryEntryRow } from '@ballistic/shared/data/types';
import { targetsHeldBack } from '@ballistic/shared/onboarding';
import { addDays, isoDateInTz, toIsoDate } from '@ballistic/shared/utils/dates';

import { MyTargetsRow } from '@/components/customTargets';
import { AddFoodSheet, CoachFeedbackCard, CompleteScanSheet, DateNav, DiarySection, EditEntrySheet, ScanAmountSheet, ScannerSheet, shortDate, TotalsCard } from '@/components/food';
import { ManualDiaryScreen } from '@/components/manualMacros';
import { NutritionTabs } from '@/components/pagetabs';
import { PhotoDiaryScreen } from '@/components/photoDiary';
import { AppText, Button, Card, Screen, ScrollScreen } from '@/components/ui';
import { useBarcodeFlow } from '@/lib/barcodeFlow';
import { useFoodTarget } from '@/lib/foodTarget';
import { useRecipes } from '@/lib/recipes';
import { useAddFood, useCopyFromDate, useDiary, useMealSections, useNutritionFeedback, useRefileEntry, useRemoveEntry, useUpdatePortions, useUpdateQuickAdd } from '@/lib/food';
import { useScreenAccess } from '@/lib/screens';
import { timezoneOf, useClientProfile, useNow } from '@/lib/today';
import { spacing, useTheme } from '@/theme';

// The Food screen has three forms, chosen by the coach for each member: the full food diary (search and scan foods), typed
// protein / carbs / fat totals, or a photo diary.
export default function Food() {
  const t = useTheme();
  const now = useNow(60_000);
  const profileQ = useClientProfile();
  const profile = profileQ.data ?? null;

  if (profileQ.isPending) {
    return (
      <Screen style={{ justifyContent: 'center' }}>
        <ActivityIndicator color={t.accent} />
      </Screen>
    );
  }
  if (profileQ.isError) {
    return (
      <Screen style={{ justifyContent: 'center', gap: spacing.md }}>
        <AppText color="danger">Could not load your food diary.</AppText>
        <Button title="Try again" onPress={() => profileQ.refetch()} />
      </Screen>
    );
  }

  // "Today" depends on the member's timezone, so nothing date-specific is fetched until the profile is known.
  const today = isoDateInTz(now, timezoneOf(profile));
  if (profile?.nutrition_tracking_mode === 'photo_diary') return <PhotoDiaryScreen today={today} />;
  if (profile?.nutrition_tracking_mode === 'manual_import') return <ManualDiaryScreen profile={profile} today={today} />;
  return <FullDiary profile={profile} today={today} />;
}

function FullDiary({ profile, today }: { profile: ClientProfileRow | null; today: string }) {
  const t = useTheme();
  const { areas } = useScreenAccess();
  const [picked, setPicked] = useState<string | null>(null);
  const date = picked ?? today;

  const diaryQ = useDiary(date);
  const feedbackQ = useNutritionFeedback(date);
  const sectionsQ = useMealSections();
  const target = useFoodTarget(profile, today, date);
  const addFood = useAddFood(date);
  const removeEntry = useRemoveEntry(date);
  const updatePortions = useUpdatePortions(date);
  const updateQuick = useUpdateQuickAdd(date);
  const refile = useRefileEntry(date);
  const copy = useCopyFromDate(date);
  const recipesQ = useRecipes();
  const scan = useBarcodeFlow((food, grams, target) => addFood.mutate({ food, portions: grams, sectionId: target?.id ?? null }));

  const [addTarget, setAddTarget] = useState<{ id: string | null; label: string } | null>(null);
  const [editing, setEditing] = useState<FoodDiaryEntryRow | null>(null);
  const [note, setNote] = useState<string | null>(null);

  if (sectionsQ.isPending) {
    return (
      <Screen style={{ justifyContent: 'center' }}>
        <ActivityIndicator color={t.accent} />
      </Screen>
    );
  }
  if (sectionsQ.isError) {
    return (
      <Screen style={{ justifyContent: 'center', gap: spacing.md }}>
        <AppText color="danger">Could not load your food diary.</AppText>
        <Button title="Try again" onPress={() => sectionsQ.refetch()} />
      </Screen>
    );
  }

  const sections = sectionsQ.data ?? [];
  const entries = diaryQ.data?.entries ?? [];
  const byCreated = (a: FoodDiaryEntryRow, b: FoodDiaryEntryRow) => a.created_at.localeCompare(b.created_at);
  const known = new Set(sections.map((s) => s.id));
  const other = entries.filter((e) => !e.meal_section_id || !known.has(e.meal_section_id)).sort(byCreated);
  const dayEmpty = diaryQ.isSuccess && entries.length === 0;

  async function copyYesterday() {
    const yesterday = toIsoDate(addDays(new Date(date + 'T00:00:00Z'), -1));
    setNote(null);
    try {
      const n = await copy.mutateAsync(yesterday);
      setNote(n === 0 ? 'Nothing logged the day before to copy.' : `Copied ${n} item${n === 1 ? '' : 's'}.`);
    } catch (e) {
      setNote(e instanceof Error ? e.message : 'Could not copy.');
    }
  }

  return (
    <>
      <ScrollScreen refreshing={diaryQ.isRefetching} onRefresh={() => diaryQ.refetch()}>
        <NutritionTabs current="food" />
        <DateNav date={date} today={today} ahead={1} onChange={(d) => { setNote(null); scan.clearStatus(); setPicked(d === today ? null : d); }} />
        <TotalsCard entries={entries} target={target} held={targetsHeldBack(profile, false)} title={date === today ? "Today's targets" : 'Targets'} note={shortDate(date)} />
        <MyTargetsRow profile={profile} />
        <CoachFeedbackCard items={feedbackQ.data ?? []} />
        {date > today ? <AppText variant="small" color="muted">Planning tomorrow. This food counts towards tomorrow, and stays out of this week's averages until then.</AppText> : null}
        {scan.status ? <AppText variant="small" color="muted">{scan.status}</AppText> : null}
        {note ? <AppText variant="small" color="muted">{note}</AppText> : null}
        {diaryQ.isError ? <AppText color="danger">Could not load this day: {diaryQ.error.message}</AppText> : null}
        {dayEmpty ? (
          <Card style={{ gap: spacing.sm }}>
            <AppText color="muted">Nothing logged for this day yet.</AppText>
            <Button title="Copy from the day before" variant="secondary" loading={copy.isPending} onPress={copyYesterday} />
          </Card>
        ) : null}
        {sections.map((s) => (
          <DiarySection
            key={s.id}
            label={s.label}
            entries={entries.filter((e) => e.meal_section_id === s.id).sort(byCreated)}
            onAdd={() => setAddTarget({ id: s.id, label: s.label })}
            onScan={() => scan.start({ id: s.id, label: s.label })}
            onEdit={setEditing}
          />
        ))}
        {other.length ? <DiarySection label="Other" entries={other} onAdd={() => setAddTarget({ id: null, label: 'Other' })} onScan={() => scan.start({ id: null, label: 'Other' })} onEdit={setEditing} /> : null}
      </ScrollScreen>

      {addTarget ? <AddFoodSheet section={addTarget} date={date} recipes={areas.recipes ? recipesQ.data ?? [] : []} onClose={() => setAddTarget(null)} /> : null}
      {editing ? (
        <EditEntrySheet
          entry={editing}
          sections={sections}
          onClose={() => setEditing(null)}
          onSave={(portions) => { updatePortions.mutate({ id: editing.id, portions }); setEditing(null); }}
          onSaveQuick={(fields) => { updateQuick.mutate({ id: editing.id, fields }); setEditing(null); }}
          onRemove={() => { removeEntry.mutate({ id: editing.id }); setEditing(null); }}
          onRefile={(sectionId) => { refile.mutate({ id: editing.id, sectionId }); setEditing(null); }}
        />
      ) : null}
      {scan.scanTarget ? <ScannerSheet onClose={scan.cancelScan} onDetected={scan.handleDetected} /> : null}
      {scan.pending ? <CompleteScanSheet pending={scan.pending} onCancel={scan.cancelPending} onSave={scan.handleComplete} /> : null}
      <ScanAmountSheet scan={scan} />
    </>
  );
}
