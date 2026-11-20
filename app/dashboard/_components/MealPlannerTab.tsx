'use client';

import { useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { NotebookPen, Plus, ScanBarcode } from 'lucide-react';
import { useAction } from '@/app/_components/useAction';
import { useToast } from '@/app/_components/ToastProvider';
import { planLoggedMessage } from '@/lib/planLogging';
import { addMealPlanEntry, logPlanToDiary, removeMealPlanEntry, updateMealPlanEntryPortions } from '@/lib/data/mealPlan';
import { addRecipeToMealPlan } from '@/lib/data/recipes';
import { weeklyTarget } from '@/lib/calculations';
import { toMemberEngineProfile } from '@/lib/utils/clientProfile';
import { dayTargetFor, HIGH_DAYS_PER_WEEK, isCyclingTarget } from '@/lib/utils/dayTarget';
import { targetsHeldBack } from '@/lib/onboarding';
import { entryMacros, totalMacros } from '@/lib/utils/foodTotals';
import { AddFoodSheet } from './AddFoodSheet';
import { useBarcodeAdd, useFoodShortcuts } from './FoodEntryTools';
import { NutritionSummary } from './NutritionSummary';
import { QuantitySheet } from './QuantitySheet';
import { useGrowIn } from '@/app/_components/motion/useGrowIn';
import { orderedSections, planEntrySectionId, type PlanPick } from '@/lib/utils/planSections';
import type { ClientProfileRow, MealPlanEntryRow, MealSectionRow, FoodRow, RecipeRow } from '@/lib/data/types';

// A meal in the planner: one of the member's diary sections (NU12), or "Other" (id null) for planned items with none.
type PlanMeal = { id: string | null; label: string };

const amountLabel = (entry: MealPlanEntryRow) =>
  entry.food?.portion === '1 gram' ? `${Math.round(entry.portions * 10) / 10}g` : `${Math.round(entry.portions * 100) / 100}× ${entry.food?.portion ?? ''}`;

function EntryRow({
  entry,
  readOnly,
  onRemove,
  onUpdatePortions,
}: {
  entry: MealPlanEntryRow;
  readOnly: boolean;
  onRemove: (id: string) => void;
  onUpdatePortions: (id: string, portions: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const macros = entryMacros(entry);
  return (
    <li>
      <button
        type="button"
        disabled={readOnly}
        onClick={() => setEditing(true)}
        className="flex min-h-12 w-full items-center justify-between gap-3 px-4 py-2.5 text-left transition-colors hover:bg-black/[.02] disabled:cursor-default dark:hover:bg-white/[.03]"
      >
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold text-black dark:text-zinc-50">{entry.food?.name ?? 'Unknown food'}</span>
          <span className="block text-xs text-zinc-500">{amountLabel(entry)}</span>
        </span>
        <span className="shrink-0 text-sm font-bold text-black dark:text-zinc-50">{Math.round(macros.calories)} kcal</span>
      </button>
      {editing && !readOnly && (
        <QuantitySheet
          title={entry.food?.name ?? 'Planned food'}
          limit={entry.food?.portion === '1 gram' ? 'grams' : 'portions'}
          unitLabel={entry.food?.portion === '1 gram' ? 'grams' : `× ${entry.food?.portion ?? 'portion'}`}
          initial={entry.portions}
          food={entry.food}
          onClose={() => setEditing(false)}
          onSave={(portions) => {
            onUpdatePortions(entry.id, portions);
            setEditing(false);
          }}
          onDelete={() => {
            onRemove(entry.id);
            setEditing(false);
          }}
        />
      )}
    </li>
  );
}

export function MealPlannerTab({
  clientId,
  initialEntries,
  sections,
  recipes,
  readOnly,
  profile,
  programWeek,
  todayLogId,
}: {
  clientId: string;
  initialEntries: MealPlanEntryRow[];
  // The member's own diary sections (their coach's meals): the planner is laid out in them, so copying a plan into the diary lands each
  // item in the same meal (NU12).
  sections: MealSectionRow[];
  recipes: RecipeRow[];
  readOnly: boolean;
  profile: ClientProfileRow | null;
  programWeek: number;
  // Today's diary, so a planned meal can be copied into it. Null for a coach's read-only view.
  todayLogId: string | null;
}) {
  const router = useRouter();
  const toast = useToast();
  const { run } = useAction();
  const { run: runRecipe } = useAction();
  const { run: runUpdate } = useAction();
  const { run: runLog, busy: logging } = useAction();
  const { favorites, recentlyLogged, favoriteIds, toggleFavorite } = useFoodShortcuts(clientId, !readOnly);
  const [addFoodSection, setAddFoodSection] = useState<PlanMeal | null>(null);

  const weekTarget = useMemo(() => {
    const engineProfile = toMemberEngineProfile(profile, readOnly);
    return engineProfile ? weeklyTarget(engineProfile, programWeek) : null;
  }, [profile, programWeek, readOnly]);
  // A typical day. For a calorie-cycling member that is a normal (low) day, and a line under the rings gives the high days.
  const dayTarget = dayTargetFor(weekTarget, null);
  const highDay = isCyclingTarget(weekTarget) ? weekTarget?.dailyHigh ?? null : null;

  // Returns whether it worked, so the Add food sheet stays open (keeping what was typed) when it did not (FS5).
  async function handleAdd(sectionId: string | null, food: FoodRow, portions: number) {
    return run(() => addMealPlanEntry(clientId, sectionId, food.id, portions), { success: `${food.name} added` });
  }

  const scan = useBarcodeAdd(async (food, portions, target) => {
    await addMealPlanEntry(clientId, target?.id ?? null, food.id, portions);
    router.refresh();
  });

  async function handleAddRecipe(sectionId: string | null, recipeId: string, servings: number) {
    const recipe = recipes.find((r) => r.id === recipeId);
    return runRecipe(() => addRecipeToMealPlan(clientId, sectionId, recipeId, servings), {
      success: recipe ? `${recipe.name} added` : 'Recipe added',
    });
  }

  async function handleRemove(id: string) {
    await run(() => removeMealPlanEntry(id), { success: 'Removed' });
  }

  async function handleUpdatePortions(id: string, portions: number) {
    await runUpdate(() => updateMealPlanEntryPortions(id, portions), { success: 'Updated' });
  }

  async function handleLog(which: PlanPick, label: string) {
    if (!todayLogId) return;
    // What is already in today's diary is skipped, so a second tap says "already there" instead of adding everything again (MP1).
    await runLog(
      async () => {
        const result = await logPlanToDiary(clientId, todayLogId, which);
        if (result.ok) {
          toast.success(planLoggedMessage(result.added, result.planned, which === 'all' ? 'Plan' : label));
          if (result.added > 0) router.refresh();
        }
        return result;
      },
      { refresh: false }
    );
  }

  // The member's meals in diary order, then "Other" for anything planned with no section (only when there is some).
  const meals: PlanMeal[] = useMemo(() => {
    const own = orderedSections(sections).map((s) => ({ id: s.id as string | null, label: s.label }));
    const unfiled = initialEntries.some((e) => planEntrySectionId(e, sections) === null);
    return unfiled || own.length === 0 ? [...own, { id: null, label: 'Other' }] : own;
  }, [sections, initialEntries]);

  const dayTotals = totalMacros(initialEntries);
  const canLog = !readOnly && !!todayLogId;
  const held = targetsHeldBack(profile, readOnly);
  const gap = dayTarget ? Math.round(dayTarget.calories - dayTotals.calories) : 0;
  // The planned-against-target bar fills when the planner opens.
  const screen = useRef<HTMLDivElement>(null);
  useGrowIn(screen, 0.15);

  return (
    <div ref={screen} className="space-y-4">
      {!readOnly ? (
        // The member's summary (the mock-up): calories planned against the target, as a bar, with how far under or over.
        <div className="space-y-3 rounded-[20px] border border-black/[.08] bg-card p-4 dark:border-white/10">
          {dayTarget && !held ? (
            <>
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[15px] font-bold text-black dark:text-zinc-50">
                    <span className="text-[28px] font-black leading-none">{Math.round(dayTotals.calories).toLocaleString('en-GB')}</span> kcal planned
                  </p>
                  <p className="text-[13px] text-zinc-500 dark:text-zinc-400">
                    Target {Math.round(dayTarget.calories).toLocaleString('en-GB')} · {Math.round(dayTotals.protein)} of {Math.round(dayTarget.protein)} g protein
                  </p>
                </div>
                {initialEntries.length > 0 && (
                  <span className={`flex h-6 shrink-0 items-center rounded-full px-2.5 text-xs font-extrabold ${Math.abs(gap) <= 100 ? 'bg-accent-soft text-accent' : 'bg-amber-100 text-amber-800 dark:bg-amber-400/15 dark:text-amber-300'}`}>
                    {gap >= 0 ? `${gap.toLocaleString('en-GB')} under` : `${Math.abs(gap).toLocaleString('en-GB')} over`}
                  </span>
                )}
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-black/10 dark:bg-white/15" role="img" aria-label={`${Math.round(dayTotals.calories)} of ${Math.round(dayTarget.calories)} calories planned`}>
                <div data-grow="bar" className="h-2 rounded-full bg-accent" style={{ width: `${Math.min(100, (dayTotals.calories / dayTarget.calories) * 100)}%` }} />
              </div>
              {highDay && (
                <p className="text-xs leading-snug text-zinc-500 dark:text-zinc-400">
                  Calorie cycling: this plan is for a normal day. High days (up to {HIGH_DAYS_PER_WEEK} a week, marked in the food diary) are{' '}
                  {Math.round(highDay.calories).toLocaleString()} kcal.
                </p>
              )}
            </>
          ) : (
            <p className="text-sm font-semibold text-zinc-600 dark:text-zinc-400">
              {held ? 'Your coach is setting up your plan. Your targets show here once they have been checked.' : 'No daily targets yet. Plan your meals below.'}
            </p>
          )}
        </div>
      ) : (
      <NutritionSummary
        totals={dayTotals}
        target={dayTarget}
        title={readOnly ? "Their typical day" : "Your typical day"}
        dateLabel={readOnly ? "vs their daily target" : "vs your daily target"}
        held={targetsHeldBack(profile, readOnly)}
        footer={
          highDay && !targetsHeldBack(profile, readOnly) ? (
            <p className="text-center text-xs text-zinc-500">
              Calorie cycling: this plan is for a normal day. High days (up to {HIGH_DAYS_PER_WEEK} a week, marked in the food diary) are{' '}
              {Math.round(highDay.calories).toLocaleString()} kcal.
            </p>
          ) : undefined
        }
      />
      )}

      {!readOnly && <div className="space-y-2">{scan.panel}</div>}

      {meals.map(({ id, label }) => {
        const entries = initialEntries.filter((e) => planEntrySectionId(e, sections) === id);
        const sectionKcal = totalMacros(entries).calories;
        return (
          <div key={id ?? 'other'} className="overflow-hidden rounded-[20px] border border-black/[.08] bg-card dark:border-white/10">
            <div className="flex items-center justify-between gap-2 py-2 pl-4 pr-2">
              <div className="flex min-h-11 min-w-0 flex-1 items-baseline gap-2 self-center pt-2.5">
                <h3 className="truncate text-[15px] font-extrabold text-black dark:text-zinc-50">{label}</h3>
                {entries.length > 0 && <span className="shrink-0 text-[13px] font-semibold text-zinc-500 dark:text-zinc-400">{Math.round(sectionKcal)} kcal</span>}
              </div>
              {!readOnly && (
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    aria-label={`Scan a barcode into ${label}`}
                    onClick={() => scan.start({ id, label })}
                    className="flex h-11 w-11 items-center justify-center rounded-xl text-zinc-600 hover:bg-black/5 dark:text-zinc-300 dark:hover:bg-white/10"
                  >
                    <ScanBarcode className="h-[18px] w-[18px]" />
                  </button>
                  <button
                    type="button"
                    aria-label={`Add food to ${label}`}
                    onClick={() => setAddFoodSection({ id, label })}
                    className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent-soft text-accent"
                  >
                    <Plus className="h-[18px] w-[18px]" strokeWidth={2.6} />
                  </button>
                </div>
              )}
            </div>
            <ul className="divide-y divide-black/[.07] border-t border-black/[.07] dark:divide-white/10 dark:border-white/10">
              {entries.map((entry) => (
                <EntryRow key={entry.id} entry={entry} readOnly={readOnly} onRemove={handleRemove} onUpdatePortions={handleUpdatePortions} />
              ))}
              {entries.length === 0 && <li className="px-4 py-3 text-[13px] text-zinc-500 dark:text-zinc-400">Nothing planned yet.</li>}
            </ul>
            {canLog && entries.length > 0 && (
              <div className="border-t border-black/[.07] px-2 py-1 dark:border-white/10">
                <button type="button" disabled={logging} onClick={() => handleLog({ sectionId: id }, label)} className="min-h-11 px-2 text-[13px] font-bold text-accent disabled:opacity-60">
                  Add {label} to today&apos;s diary
                </button>
              </div>
            )}
          </div>
        );
      })}

      {canLog && initialEntries.length > 0 && (
        <button
          type="button"
          disabled={logging}
          onClick={() => handleLog('all', 'Plan')}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#1d1d1b] text-[15px] font-bold text-white disabled:opacity-60 dark:bg-zinc-100 dark:text-[#1d1d1b]"
        >
          <NotebookPen className="h-4 w-4" /> Add all to my diary
        </button>
      )}

      {addFoodSection && (
        <AddFoodSheet
          sectionLabel={addFoodSection.label}
          onAdd={(food, portions) => handleAdd(addFoodSection.id, food, portions)}
          recipes={recipes}
          onAddRecipe={(recipeId, servings) => handleAddRecipe(addFoodSection.id, recipeId, servings)}
          favorites={favorites}
          recentlyLogged={recentlyLogged}
          favoriteIds={favoriteIds}
          onToggleFavorite={toggleFavorite}
          onScanBarcode={(name) => scan.start(addFoodSection, name)}
          onClose={() => setAddFoodSection(null)}
        />
      )}
    </div>
  );
}
