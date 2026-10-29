import { useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

import type { MealPlanEntryRow, MealPlanSection } from '@ballistic/shared/data/types';
import { entryMacros, totalMacros } from '@ballistic/shared/utils/foodTotals';
import { amountLabel, MEAL_PLAN_SECTIONS } from '@ballistic/shared/utils/mealPlan';
import { planLoggedMessage } from '@ballistic/shared/utils/planLogging';

import { Pressable } from '@/components/press';
import { AddFoodButtons, CompleteScanSheet, FoodPickerSheet, QuantitySheet, ScanAmountSheet, ScannerSheet, TotalsCard } from '@/components/food';
import { NutritionTabs } from '@/components/pagetabs';
import { AppText, Button, Card, Screen, ScrollScreen } from '@/components/ui';
import { useBarcodeFlow } from '@/lib/barcodeFlow';
import { useDayContext } from '@/lib/day';
import { useMealSections } from '@/lib/food';
import { PLAN_CHECK_FAILED, useAddPlanFood, useAddPlanRecipe, useLogPlanToDiary, useMealPlan, useRemovePlanEntry, useUpdatePlanPortions } from '@/lib/mealPlan';
import { useRecipes } from '@/lib/recipes';
import { spacing, useTheme } from '@/theme';

// The Meal Planner: a typical day laid out meal by meal, with its totals against the member's target. A planned meal (or the
// whole plan) can be copied into today's food diary in one tap.
export default function MealPlan() {
  const t = useTheme();
  const { todayIso, target } = useDayContext();
  const planQ = useMealPlan();
  const recipesQ = useRecipes();
  const sectionsQ = useMealSections();
  const addFood = useAddPlanFood();
  const addRecipe = useAddPlanRecipe();
  const updatePortions = useUpdatePlanPortions();
  const remove = useRemovePlanEntry();
  const diary = useLogPlanToDiary(todayIso);

  const [adding, setAdding] = useState<{ key: MealPlanSection; label: string } | null>(null);
  const [editing, setEditing] = useState<MealPlanEntryRow | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [logging, setLogging] = useState(false);
  const [noteIsError, setNoteIsError] = useState(false);
  const scan = useBarcodeFlow((food, grams, scanTarget) => {
    const section = MEAL_PLAN_SECTIONS.find((s) => s.key === scanTarget?.id);
    if (section) addFood.mutate({ section: section.key, food, portions: grams });
  });

  if (planQ.isPending) {
    return (
      <Screen style={{ justifyContent: 'center' }}>
        <ActivityIndicator color={t.accent} />
      </Screen>
    );
  }
  if (planQ.isError) {
    return (
      <Screen style={{ justifyContent: 'center', gap: spacing.md }}>
        <AppText color="danger">Could not load your meal plan: {planQ.error.message}</AppText>
        <Button title="Try again" onPress={() => planQ.refetch()} />
      </Screen>
    );
  }

  const entries = planQ.data;
  const sections = sectionsQ.data ?? [];
  // (Adding to the diary is a queued write: a refusal is reported by the line under the header, not here.)
  const error = [addFood, addRecipe, updatePortions, remove].find((m) => m.isError)?.error?.message;

  async function logToDiary(which: MealPlanSection | 'all', label: string) {
    if (logging) return;
    setLogging(true);
    try {
      const { added, planned } = await diary.logPlan(entries, which, sections);
      setNoteIsError(false);
      setNote(planned === 0 ? 'Nothing planned to add.' : planLoggedMessage(added, planned, which === 'all' ? 'Plan' : label));
    } catch (e) {
      setNoteIsError(true);
      setNote(e instanceof Error ? e.message : PLAN_CHECK_FAILED);
    } finally {
      setLogging(false);
    }
  }

  return (
    <>
      <ScrollScreen refreshing={planQ.isRefetching} onRefresh={() => planQ.refetch()}>
        <NutritionTabs current="meal-plan" />
        <TotalsCard entries={entries} target={target} title="Your typical day" note="vs your daily target" />
        {error ? <AppText color="danger" style={{ fontWeight: '600' }}>{error}</AppText> : null}
        {note ? <AppText color={noteIsError ? 'danger' : 'success'} style={{ fontWeight: '600' }}>{note}</AppText> : null}
        {scan.status ? <AppText variant="small" color="muted">{scan.status}</AppText> : null}

        {entries.length > 0 ? <Button title="Add the whole plan to today's diary" onPress={() => logToDiary('all', 'Plan')} loading={logging} /> : null}

        {MEAL_PLAN_SECTIONS.map(({ key, label }) => {
          const mine = entries.filter((e) => e.section === key);
          const kcal = totalMacros(mine).calories;
          return (
            <Card key={key} style={{ gap: spacing.sm }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <AppText variant="heading">{label}</AppText>
                {mine.length > 0 ? <AppText variant="small" color="muted">{Math.round(kcal)} kcal</AppText> : null}
              </View>
              {mine.length === 0 ? <AppText variant="small" color="muted">Nothing planned yet.</AppText> : null}
              {mine.map((e) => (
                <Pressable key={e.id} onPress={() => setEditing(e)} accessibilityRole="button" style={{ flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm, paddingVertical: 6, borderTopWidth: 1, borderTopColor: t.border }}>
                  <View style={{ flexShrink: 1 }}>
                    <AppText numberOfLines={1}>{e.food?.name ?? 'Unknown food'}</AppText>
                    <AppText variant="small" color="muted">{amountLabel(e.portions, e.food)}</AppText>
                  </View>
                  <AppText color="muted">{Math.round(entryMacros(e).calories)} kcal</AppText>
                </Pressable>
              ))}
              <AddFoodButtons onAdd={() => setAdding({ key, label })} onScan={() => scan.start({ id: key, label })} scanLabel={`Scan a barcode into ${label}`} />
              {mine.length > 0 ? <Button title={`Add ${label} to today's diary`} variant="secondary" disabled={logging} onPress={() => logToDiary(key, label)} /> : null}
            </Card>
          );
        })}
      </ScrollScreen>

      {adding ? (
        <FoodPickerSheet
          title={`Add to ${adding.label}`}
          onClose={() => setAdding(null)}
          onAddFood={(food, portions) => addFood.mutate({ section: adding.key, food, portions })}
          recipes={recipesQ.data ?? []}
          onAddRecipe={(recipe, servings) => addRecipe.mutate({ section: adding.key, recipe, servings })}
        />
      ) : null}
      {editing ? (
        <QuantitySheet
          title={editing.food?.name ?? 'Planned food'}
          food={editing.food}
          initial={editing.portions}
          onClose={() => setEditing(null)}
          onSave={(portions) => { updatePortions.mutate({ id: editing.id, portions }); setEditing(null); }}
          onRemove={() => { remove.mutate({ id: editing.id }); setEditing(null); }}
        />
      ) : null}
      {scan.scanTarget ? <ScannerSheet onClose={scan.cancelScan} onDetected={scan.handleDetected} /> : null}
      {scan.pending ? <CompleteScanSheet pending={scan.pending} onCancel={scan.cancelPending} onSave={scan.handleComplete} /> : null}
      <ScanAmountSheet scan={scan} />
    </>
  );
}
