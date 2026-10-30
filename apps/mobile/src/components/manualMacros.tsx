import { useState } from 'react';
import { View } from 'react-native';

import type { ClientProfileRow, ManualMacroEntryRow } from '@ballistic/shared/data/types';
import { targetsHeldBack } from '@ballistic/shared/onboarding';
import { manualEntryKcal, manualTotals, validateManualEntry } from '@ballistic/shared/utils/manualMacros';

import { Pressable } from '@/components/press';
import { MyTargetsRow } from '@/components/customTargets';
import { CoachFeedbackCard, DateNav, shortDate, TotalsCard } from '@/components/food';
import { NutritionTabs } from '@/components/pagetabs';
import { Icon } from '@/components/icons';
import { AppText, Button, Card, ScrollScreen, SmallButton, TextField } from '@/components/ui';
import { useFoodTarget } from '@/lib/foodTarget';
import { useMealSections, useNutritionFeedback } from '@/lib/food';
import { useAddManualEntry, useManualMacros, useRemoveManualEntry } from '@/lib/manualMacros';
import { spacing, useTheme } from '@/theme';

const MACRO_COLORS = { protein: '#a07aff', carbs: '#e8a020', fat: '#2ecc71' } as const;

type NewEntry = Parameters<ReturnType<typeof useAddManualEntry>['mutate']>[0]['entry'];

function ManualRow({ entry, onRemove }: { entry: ManualMacroEntryRow; onRemove: () => void }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 8, borderTopWidth: 1, borderTopColor: t.border }}>
      <View style={{ flex: 1 }}>
        <AppText style={{ fontWeight: '700' }}>{manualEntryKcal(entry)} kcal</AppText>
        <AppText variant="small" color="muted">
          <AppText variant="small" style={{ color: MACRO_COLORS.protein }}>P {Math.round(entry.protein ?? 0)}g</AppText>
          {' · '}
          <AppText variant="small" style={{ color: MACRO_COLORS.carbs }}>C {Math.round(entry.carbs ?? 0)}g</AppText>
          {' · '}
          <AppText variant="small" style={{ color: MACRO_COLORS.fat }}>F {Math.round(entry.fat ?? 0)}g</AppText>
        </AppText>
      </View>
      <Pressable onPress={onRemove} accessibilityRole="button" accessibilityLabel="Remove entry" hitSlop={10} style={{ padding: 6 }}>
        <Icon name="trash2" size={18} color={t.muted} />
      </Pressable>
    </View>
  );
}

// Protein, carbs and fat in grams; calories are worked out from them and shown as the member types.
function ManualForm({ onAdd }: { onAdd: (entry: NewEntry) => void }) {
  const [typed, setTyped] = useState({ protein: '', carbs: '', fat: '' });
  const [error, setError] = useState<string | null>(null);
  const checked = validateManualEntry(typed);
  const set = (key: keyof typeof typed) => (text: string) => {
    setError(null);
    setTyped((p) => ({ ...p, [key]: text }));
  };
  function add() {
    if ('error' in checked) return setError(checked.error);
    onAdd(checked.entry);
    setTyped({ protein: '', carbs: '', fat: '' });
  }
  return (
    <View style={{ gap: spacing.sm, paddingTop: spacing.sm }}>
      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        <View style={{ flex: 1 }}><TextField label="Protein (g)" value={typed.protein} onChangeText={set('protein')} keyboardType="decimal-pad" /></View>
        <View style={{ flex: 1 }}><TextField label="Carbs (g)" value={typed.carbs} onChangeText={set('carbs')} keyboardType="decimal-pad" /></View>
        <View style={{ flex: 1 }}><TextField label="Fat (g)" value={typed.fat} onChangeText={set('fat')} keyboardType="decimal-pad" /></View>
      </View>
      <AppText variant="small" color="muted">{'entry' in checked ? `${checked.entry.calories} kcal` : 'Calories are worked out from your protein, carbs and fat.'}</AppText>
      {error ? <AppText variant="small" color="danger">{error}</AppText> : null}
      <Button title="Add" onPress={add} disabled={typed.protein === '' && typed.carbs === '' && typed.fat === ''} />
    </View>
  );
}

// One meal section: its entries, and a form to add another.
function ManualSection({ label, entries, onAdd, onRemove }: { label: string; entries: ManualMacroEntryRow[]; onAdd?: (entry: NewEntry) => void; onRemove: (id: string) => void }) {
  const [adding, setAdding] = useState(false);
  const kcal = entries.reduce((sum, e) => sum + manualEntryKcal(e), 0);
  return (
    <Card style={{ gap: spacing.xs }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <AppText variant="heading">{label}</AppText>
        <AppText variant="small" color="muted">{kcal} kcal</AppText>
      </View>
      {entries.length === 0 ? <AppText variant="small" color="muted">Nothing logged yet.</AppText> : null}
      {entries.map((e) => <ManualRow key={e.id} entry={e} onRemove={() => onRemove(e.id)} />)}
      {onAdd ? (
        adding ? (
          <>
            <ManualForm onAdd={onAdd} />
            <SmallButton title="Done" tone="muted" onPress={() => setAdding(false)} />
          </>
        ) : (
          <View style={{ marginTop: spacing.xs }}><Button title="Add" variant="secondary" onPress={() => setAdding(true)} /></View>
        )
      ) : null}
    </Card>
  );
}

// The Food screen for a member whose coach chose "type in your totals".
export function ManualDiaryScreen({ profile, today }: { profile: ClientProfileRow | null; today: string }) {
  const [picked, setPicked] = useState<string | null>(null);
  const date = picked ?? today;
  const manualQ = useManualMacros(date);
  const sectionsQ = useMealSections();
  const feedbackQ = useNutritionFeedback(date);
  const target = useFoodTarget(profile, today, date);
  const add = useAddManualEntry(date);
  const remove = useRemoveManualEntry(date);

  const sections = sectionsQ.data ?? [];
  const entries = manualQ.data?.entries ?? [];
  const byCreated = (a: ManualMacroEntryRow, b: ManualMacroEntryRow) => a.created_at.localeCompare(b.created_at);
  const known = new Set(sections.map((s) => s.id));
  const other = entries.filter((e) => !e.meal_section_id || !known.has(e.meal_section_id)).sort(byCreated);

  return (
    <ScrollScreen refreshing={manualQ.isRefetching} onRefresh={() => manualQ.refetch()}>
      <NutritionTabs current="food" />
      <DateNav date={date} today={today} ahead={1} onChange={(d) => setPicked(d === today ? null : d)} />
      <TotalsCard totals={manualTotals(entries)} target={target} held={targetsHeldBack(profile, false)} title={date === today ? "Today's targets" : 'Targets'} note={shortDate(date)} />
      <MyTargetsRow profile={profile} />
      <CoachFeedbackCard items={feedbackQ.data ?? []} />
      {manualQ.isError ? <AppText color="danger">Could not load this day: {manualQ.error.message}</AppText> : null}
      {sections.map((s) => (
        <ManualSection
          key={s.id}
          label={s.label}
          entries={entries.filter((e) => e.meal_section_id === s.id).sort(byCreated)}
          onAdd={(entry) => add.mutate({ sectionId: s.id, entry })}
          onRemove={(id) => remove.mutate({ id })}
        />
      ))}
      {other.length ? <ManualSection label="Other" entries={other} onRemove={(id) => remove.mutate({ id })} /> : null}
    </ScrollScreen>
  );
}
