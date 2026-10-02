'use client';

import { useMemo, useState } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Trash2, Utensils } from 'lucide-react';
import { Button } from '@/app/_components/Button';
import { useAction } from '@/app/_components/useAction';
import { useConfirm } from '@/app/_components/ConfirmDialog';
import { EmptyState } from '@/app/_components/EmptyState';
import {
  addFoodDiaryEntry,
  addQuickAddEntry,
  copyFromDate,
  getFoodDiaryForDate,
  removeFoodDiaryEntry,
  updateFoodDiaryEntryPortions,
  updateFoodDiaryEntrySection,
} from '@/lib/data/foodDiary';
import {
  addManualMacroEntry,
  getManualMacrosForDate,
  removeManualMacroEntry,
} from '@/lib/data/manualMacros';
import {
  createMealSection,
  deleteMealSection,
  renameMealSection,
  reorderMealSections,
} from '@/lib/data/mealSections';
import { logRecipeToDiary } from '@/lib/data/recipes';
import { fail, ok } from '@/lib/data/result';
import { dayCalories, weeklyTarget } from '@/lib/calculations';
import { toEngineProfile } from '@/lib/utils/clientProfile';
import { addDays, DEFAULT_TIMEZONE, todayIsoInTz, toIsoDate } from '@/lib/utils/dates';
import { entryMacros, totalMacros } from '@/lib/utils/foodTotals';
import { AddFoodSheet } from './AddFoodSheet';
import { FeedbackThread } from './FeedbackThread';
import { NutritionSummary } from './NutritionSummary';
import { AddFoodButtons, useBarcodeAdd, useFoodShortcuts } from './FoodEntryTools';
import type { NutritionTrackingMode } from './categories';
import type {
  ClientProfileRow,
  FoodDiaryEntryRow,
  FoodRow,
  ManualMacroEntryRow,
  NutritionFeedbackRow,
  MealSectionRow,
  RecipeRow,
} from '@/lib/data/types';

function ManualMacroForm({ onAdd }: { onAdd: (fields: { calories: number | null; protein: number | null; carbs: number | null; fat: number | null }) => void }) {
  const [protein, setProtein] = useState('');
  const [carbs, setCarbs] = useState('');
  const [fat, setFat] = useState('');
  const p = Number(protein) || 0;
  const c = Number(carbs) || 0;
  const f = Number(fat) || 0;
  const kcal = Math.round(dayCalories(p, c, f));
  const empty = protein === '' && carbs === '' && fat === '';
  const inputCls = 'w-full rounded-xl border border-black/10 bg-transparent px-3 py-2.5 text-base dark:border-white/10';
  const labelCls = 'text-[11px] font-bold uppercase tracking-wide';

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (empty) return;
    onAdd({
      calories: kcal,
      protein: protein === '' ? null : p,
      carbs: carbs === '' ? null : c,
      fat: fat === '' ? null : f,
    });
    setProtein('');
    setCarbs('');
    setFat('');
  }

  return (
    <form onSubmit={handleSubmit} className="mt-3 space-y-2.5 rounded-xl bg-black/[.03] p-3 dark:bg-white/[.04]">
      <div className="grid grid-cols-3 gap-2">
        <label className="space-y-1">
          <span className={labelCls} style={{ color: '#a07aff' }}>Protein</span>
          <input type="number" inputMode="decimal" step="0.1" placeholder="g" value={protein} onChange={(e) => setProtein(e.target.value)} className={inputCls} />
        </label>
        <label className="space-y-1">
          <span className={labelCls} style={{ color: '#e8a020' }}>Carbs</span>
          <input type="number" inputMode="decimal" step="0.1" placeholder="g" value={carbs} onChange={(e) => setCarbs(e.target.value)} className={inputCls} />
        </label>
        <label className="space-y-1">
          <span className={labelCls} style={{ color: '#2ecc71' }}>Fat</span>
          <input type="number" inputMode="decimal" step="0.1" placeholder="g" value={fat} onChange={(e) => setFat(e.target.value)} className={inputCls} />
        </label>
      </div>
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-zinc-500">{empty ? 'Calories are worked out for you' : <><b className="text-black dark:text-zinc-50">{kcal}</b> kcal</>}</p>
        <button
          type="submit"
          disabled={empty}
          className="rounded-full bg-accent px-5 py-2 text-sm font-extrabold text-accent-foreground disabled:opacity-40"
        >
          Add
        </button>
      </div>
    </form>
  );
}

function ManualMacroRow({ entry, readOnly, onRemove }: { entry: ManualMacroEntryRow; readOnly: boolean; onRemove: (id: string) => void }) {
  const kcal = Math.round(dayCalories(entry.protein ?? 0, entry.carbs ?? 0, entry.fat ?? 0)) || Math.round(entry.calories ?? 0);
  return (
    <li className="flex items-center justify-between gap-2 py-2.5">
      <div className="min-w-0">
        <p className="text-sm font-bold text-black dark:text-zinc-50">{kcal} kcal</p>
        <p className="text-xs text-zinc-500">
          <span style={{ color: '#a07aff' }}>P {Math.round(entry.protein ?? 0)}g</span> ·{' '}
          <span style={{ color: '#e8a020' }}>C {Math.round(entry.carbs ?? 0)}g</span> ·{' '}
          <span style={{ color: '#2ecc71' }}>F {Math.round(entry.fat ?? 0)}g</span>
        </p>
      </div>
      {!readOnly && (
        <button type="button" aria-label="Remove entry" onClick={() => onRemove(entry.id)} className="rounded-full p-2 text-zinc-400 hover:text-danger">
          <Trash2 className="h-4 w-4" />
        </button>
      )}
    </li>
  );
}

function SectionNameInput({ sectionId, initial }: { sectionId: string; initial: string }) {
  const { run } = useAction();
  const [value, setValue] = useState(initial);

  async function handleBlur() {
    if (!value.trim() || value === initial) {
      setValue(initial);
      return;
    }
    await run(() => renameMealSection(sectionId, value));
  }

  return (
    <input
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={handleBlur}
      className="rounded-md border border-transparent bg-transparent px-1 py-0.5 font-medium text-black hover:border-black/10 focus:border-black/10 dark:text-zinc-50 dark:hover:border-white/10 dark:focus:border-white/10"
    />
  );
}

// Tap a logged entry to correct its quantity or delete it, instead of only ever being able to
// remove-and-re-add -- opened from EntryRow below, matching the shared bottom-sheet pattern
// used elsewhere in this app.
function EditEntrySheet({
  entry,
  sections,
  onClose,
  onSave,
  onDelete,
  onRefile,
}: {
  entry: FoodDiaryEntryRow;
  sections: MealSectionRow[];
  onClose: () => void;
  onSave: (portions: number) => void;
  onDelete: () => void;
  onRefile?: (sectionId: string) => void;
}) {
  const [portions, setPortions] = useState(entry.portions);
  // The box can be emptied while typing (counts as 0) and shows the real number again on blur.
  const [draft, setDraft] = useState<string | null>(null);
  const unitLabel = entry.food?.portion === '1 gram' ? 'Grams' : `× ${entry.food?.portion ?? 'portion'}`;

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/45" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Edit food entry"
        onClick={(e) => e.stopPropagation()}
        className="w-full rounded-t-2xl bg-[var(--background)] p-4 pb-6"
      >
        <h2 className="mb-3 text-sm font-bold text-black dark:text-zinc-50">
          {entry.food?.name ?? entry.quick_add_name ?? 'Unknown food'}
        </h2>
        {entry.food ? (
          <div className="space-y-1">
            <label className="text-xs font-medium text-zinc-500">Quantity ({unitLabel})</label>
            <input
              type="number"
              inputMode="decimal"
              min={0}
              step="any"
              autoFocus
              value={draft ?? String(portions)}
              onChange={(e) => {
                setDraft(e.target.value);
                setPortions(e.target.value === '' ? 0 : Math.max(0, Number(e.target.value)));
              }}
              onBlur={() => setDraft(null)}
              className="w-full rounded-md border border-black/10 bg-transparent px-3 py-2 text-sm dark:border-white/10"
            />
          </div>
        ) : (
          <p className="text-sm text-zinc-500">
            {Math.round(entryMacros(entry).calories)} kcal · {Math.round(entryMacros(entry).protein)}P /{' '}
            {Math.round(entryMacros(entry).carbs)}C / {Math.round(entryMacros(entry).fat)}F
          </p>
        )}
        {onRefile && (
          <div className="mt-3 space-y-1">
            <label className="text-xs font-medium text-zinc-500">File under</label>
            <select
              defaultValue=""
              onChange={(e) => e.target.value && onRefile(e.target.value)}
              className="w-full rounded-md border border-black/10 bg-transparent px-3 py-2 text-sm dark:border-white/10"
            >
              <option value="" disabled>
                Choose a section…
              </option>
              {sections.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="mt-4 flex gap-2">
          {entry.food && (
            <Button variant="primary" onClick={() => onSave(portions)} disabled={portions <= 0}>
              Save
            </Button>
          )}
          <Button variant="danger" onClick={onDelete}>
            Delete
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}

function EntryRow({
  entry,
  readOnly,
  sections,
  onRemove,
  onRefile,
  onUpdatePortions,
}: {
  entry: FoodDiaryEntryRow;
  readOnly: boolean;
  sections: MealSectionRow[];
  onRemove: (id: string) => void;
  onRefile: (id: string, sectionId: string | null) => void;
  onUpdatePortions: (id: string, portions: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const macros = entryMacros(entry);
  // "150 g" for per-gram foods, "2 × 1 Egg" for unit foods; nothing for quick-adds.
  const amount = entry.food
    ? entry.food.portion === '1 gram'
      ? `${Math.round(entry.portions * 10) / 10} g`
      : `${Math.round(entry.portions * 100) / 100} × ${entry.food.portion}`
    : null;
  return (
    <li>
      <button
        type="button"
        disabled={readOnly}
        onClick={() => setEditing(true)}
        className="flex w-full items-center justify-between gap-2 p-3 text-left disabled:cursor-default"
      >
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold text-black dark:text-zinc-50">
            {entry.food?.name ?? entry.quick_add_name ?? 'Unknown food'}
          </span>
          {amount && <span className="block text-xs text-zinc-500">{amount}</span>}
        </span>
        <span className="shrink-0 text-sm font-semibold text-black dark:text-zinc-50">
          {Math.round(macros.calories)} <span className="text-xs font-normal text-zinc-500">kcal</span>
        </span>
      </button>
      {editing && !readOnly && (
        <EditEntrySheet
          entry={entry}
          sections={sections}
          onClose={() => setEditing(false)}
          onSave={(portions) => {
            onUpdatePortions(entry.id, portions);
            setEditing(false);
          }}
          onDelete={() => {
            onRemove(entry.id);
            setEditing(false);
          }}
          onRefile={
            entry.meal_section_id === null && sections.length > 0
              ? (sectionId) => {
                  onRefile(entry.id, sectionId);
                  setEditing(false);
                }
              : undefined
          }
        />
      )}
    </li>
  );
}

export function FoodTrackingTab({
  clientId,
  dailyLogId,
  initialEntries,
  initialManualMacroEntries,
  sections,
  recipes,
  readOnly,
  canGiveFeedback = false,
  feedback = [],
  profile,
  programWeek,
  nutritionMode,
}: {
  clientId: string;
  dailyLogId: string | null;
  initialEntries: FoodDiaryEntryRow[];
  initialManualMacroEntries: ManualMacroEntryRow[];
  sections: MealSectionRow[];
  recipes: RecipeRow[];
  readOnly: boolean;
  // Coach-only: leave feedback the member can see (their own coach only).
  canGiveFeedback?: boolean;
  feedback?: NutritionFeedbackRow[];
  profile: ClientProfileRow | null;
  programWeek: number;
  nutritionMode: NutritionTrackingMode;
}) {
  const confirm = useConfirm();
  const { run } = useAction();
  const { run: runRecipe } = useAction();
  const { run: runSection, busy: addingSection } = useAction();
  const { run: runManual } = useAction();
  // Shared bottom-sheet "Add food" target -- null means closed; { id: null } targets the
  // unfiled "Other" bucket (the header's "Search foods" button), a section id targets that
  // section's own "+ Add food" button. One sheet for all entry points, matching the
  // prototype's single shared addFoodModal instead of an always-visible inline panel.
  const [addFoodTarget, setAddFoodTarget] = useState<{ id: string | null; label: string } | null>(null);
  const [newSectionLabel, setNewSectionLabel] = useState('');
  const isManual = nutritionMode === 'manual_import';

  // Must match the timezone dashboardBundle used to resolve `dailyLogId`/`initialEntries`
  // server-side (see lib/data/dashboardBundle.ts) -- a raw `toIsoDate(new Date())` here is the
  // UTC date, not the client's local one, so near a day boundary this and the server would
  // disagree on "today" and silently start operating on a different (wrong) daily_logs row.
  const todayIso = useMemo(() => todayIsoInTz(profile?.timezone ?? DEFAULT_TIMEZONE), [profile?.timezone]);
  const [viewingDate, setViewingDate] = useState(todayIso);
  const [currentDailyLogId, setCurrentDailyLogId] = useState(dailyLogId);
  const [entries, setEntries] = useState(initialEntries);
  const [manualEntries, setManualEntries] = useState(initialManualMacroEntries);
  const [dateLoading, setDateLoading] = useState(false);
  const isToday = viewingDate === todayIso;

  // Favourites and recently logged foods for the Add food sheet, loaded once (not for coaches or
  // typed-totals members, who never open it).
  const { favorites, recentlyLogged, favoriteIds, toggleFavorite: handleToggleFavorite } = useFoodShortcuts(clientId, !readOnly && !isManual);

  const totals = isManual
    ? manualEntries.reduce(
        (acc, e) => {
          acc.protein += e.protein ?? 0;
          acc.carbs += e.carbs ?? 0;
          acc.fat += e.fat ?? 0;
          acc.calories = dayCalories(acc.protein, acc.carbs, acc.fat);
          return acc;
        },
        { calories: 0, protein: 0, carbs: 0, fat: 0 }
      )
    : totalMacros(entries);
  // Uses the flat (non-cycling-aware) daily target -- this tab has no per-day day_type
  // context the way Weekly Log does, and threading that through here would be
  // disproportionate to a simple live comparison line.
  const dayTarget = useMemo(() => {
    const engineProfile = toEngineProfile(profile);
    return engineProfile ? weeklyTarget(engineProfile, programWeek)?.dailyFlat ?? null : null;
  }, [profile, programWeek]);

  async function loadDate(date: string) {
    setDateLoading(true);
    try {
      if (isManual) {
        const result = await getManualMacrosForDate(clientId, date, !readOnly);
        setViewingDate(date);
        setCurrentDailyLogId(result.dailyLogId);
        setManualEntries(result.entries);
      } else {
        const result = await getFoodDiaryForDate(clientId, date, !readOnly);
        setViewingDate(date);
        setCurrentDailyLogId(result.dailyLogId);
        setEntries(result.entries);
      }
    } finally {
      setDateLoading(false);
    }
  }

  async function handleAddManual(
    sectionId: string | null,
    fields: { calories: number | null; protein: number | null; carbs: number | null; fat: number | null }
  ) {
    if (!currentDailyLogId) return;
    await runManual(async () => {
      await addManualMacroEntry(currentDailyLogId, sectionId, fields);
      await loadDate(viewingDate);
    });
  }

  async function handleRemoveManual(id: string) {
    if (!currentDailyLogId) return;
    await runManual(async () => {
      await removeManualMacroEntry(id, currentDailyLogId);
      await loadDate(viewingDate);
    });
  }

  async function handleAdd(food: FoodRow, portions: number, sectionId: string | null = null) {
    if (!currentDailyLogId) return;
    await run(
      async () => {
        await addFoodDiaryEntry(currentDailyLogId, food.id, portions, sectionId);
        await loadDate(viewingDate);
      },
      { success: `${food.name} added` }
    );
  }

  async function handleAddQuickAdd(
    fields: { name: string; calories: number | null; protein: number | null; carbs: number | null; fat: number | null },
    sectionId: string | null = null
  ) {
    if (!currentDailyLogId) return;
    await run(
      async () => {
        await addQuickAddEntry(currentDailyLogId, sectionId, fields);
        await loadDate(viewingDate);
      },
      { success: `${fields.name} added` }
    );
  }

  async function handleAddRecipe(recipeId: string, servings: number, sectionId: string | null = null) {
    if (!currentDailyLogId) return;
    const recipe = recipes.find((r) => r.id === recipeId);
    await runRecipe(
      async () => {
        await logRecipeToDiary(currentDailyLogId, recipeId, servings, sectionId);
        await loadDate(viewingDate);
      },
      { success: recipe ? `${recipe.name} added` : 'Recipe added' }
    );
  }

  const scan = useBarcodeAdd((food, portions, target) => handleAdd(food, portions, target?.id ?? null));

  async function handleCopyFromYesterday() {
    if (!currentDailyLogId) return;
    const yesterday = toIsoDate(addDays(new Date(viewingDate + 'T00:00:00Z'), -1));
    await run(
      async () => {
        const count = await copyFromDate(clientId, yesterday, currentDailyLogId);
        if (count === 0) return fail(null, 'Nothing logged yesterday to copy.');
        await loadDate(viewingDate);
        return ok();
      },
      { success: 'Copied from yesterday' }
    );
  }

  async function handleRemove(id: string) {
    if (!currentDailyLogId) return;
    await run(
      async () => {
        await removeFoodDiaryEntry(id, currentDailyLogId);
        await loadDate(viewingDate);
      },
      { success: 'Removed' }
    );
  }

  async function handleRefile(id: string, sectionId: string | null) {
    await run(
      async () => {
        await updateFoodDiaryEntrySection(id, sectionId);
        await loadDate(viewingDate);
      },
      { success: 'Moved' }
    );
  }

  async function handleUpdatePortions(id: string, portions: number) {
    if (!currentDailyLogId) return;
    await run(
      async () => {
        await updateFoodDiaryEntryPortions(id, portions, currentDailyLogId);
        await loadDate(viewingDate);
      },
      { success: 'Updated' }
    );
  }

  async function handleAddSection(e: React.FormEvent) {
    e.preventDefault();
    const label = newSectionLabel.trim();
    if (!label) return;
    await runSection(() => createMealSection(clientId, label), {
      success: 'Section added',
      onDone: () => setNewSectionLabel(''),
    });
  }

  async function handleDeleteSection(section: MealSectionRow) {
    const ok = await confirm({
      title: `Delete "${section.label}"?`,
      body: 'Food already logged under this section moves to "Other" — nothing gets deleted.',
      destructive: true,
    });
    if (!ok) return;
    await run(() => deleteMealSection(section.id));
  }

  async function handleMoveSection(index: number, direction: -1 | 1) {
    const reordered = [...sections];
    const target = index + direction;
    if (target < 0 || target >= reordered.length) return;
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
    await run(() => reorderMealSections(reordered.map((s) => s.id)));
  }

  const otherEntries = entries.filter((e) => e.meal_section_id === null);
  const otherManualEntries = manualEntries.filter((e) => e.meal_section_id === null);
  const dateLabel = new Date(viewingDate + 'T00:00:00Z').toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <Button variant="icon" aria-label="Previous day" onClick={() => loadDate(toIsoDate(addDays(new Date(viewingDate + 'T00:00:00Z'), -1)))} disabled={dateLoading}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div className="text-sm font-medium">{isToday ? 'Today' : dateLabel}</div>
        <div className="flex items-center gap-1">
          {!isToday && (
            <Button variant="ghost" size="sm" onClick={() => loadDate(todayIso)} disabled={dateLoading}>
              Today
            </Button>
          )}
          <Button
            variant="icon"
            aria-label="Next day"
            onClick={() => loadDate(toIsoDate(addDays(new Date(viewingDate + 'T00:00:00Z'), 1)))}
            disabled={dateLoading || isToday}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <FeedbackThread
        clientId={clientId}
        date={viewingDate}
        items={feedback}
        canGive={canGiveFeedback}
        placeholder={`Feedback on ${isToday ? "today's" : dateLabel} nutrition…`}
        buttonLabel="Leave feedback on this day"
      />

      <NutritionSummary totals={totals} target={dayTarget} title={isToday ? "Today's targets" : 'Targets'} dateLabel={dateLabel} />

      {!readOnly && !isManual && (
        <div className="space-y-2">
          {scan.panel}
          {entries.length === 0 && (
            <button type="button" onClick={handleCopyFromYesterday} className="text-sm font-semibold text-accent hover:underline">
              Copy yesterday&apos;s food
            </button>
          )}
        </div>
      )}
      {!readOnly && isManual && (
        <p className="text-xs text-zinc-500">Enter the protein, carbs and fat for each meal. Calories are worked out for you.</p>
      )}

      {sections.map((section, index) => {
        const sectionEntries = entries.filter((e) => e.meal_section_id === section.id);
        const sectionTotals = totalMacros(sectionEntries);
        const sectionManualEntries = manualEntries.filter((e) => e.meal_section_id === section.id);
        const sectionManualCalories = sectionManualEntries.reduce((sum, e) => sum + (dayCalories(e.protein ?? 0, e.carbs ?? 0, e.fat ?? 0) || (e.calories ?? 0)), 0);
        return (
          <div key={section.id} className="rounded-2xl border border-black/[.05] bg-card p-4 dark:border-white/10">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-1">
                {/* Renaming/reordering/deleting a section is structural, coach-only setup --
                    the client just logs food into whatever sections already exist, matching
                    the prototype's client view (name + total + "+ Add food", nothing else). */}
                {readOnly ? (
                  <SectionNameInput sectionId={section.id} initial={section.label} />
                ) : (
                  <h4 className="font-medium text-black dark:text-zinc-50">{section.label}</h4>
                )}
                <span className="shrink-0 text-sm text-zinc-500">
                  {Math.round(isManual ? sectionManualCalories : sectionTotals.calories)} kcal
                </span>
              </div>
              {readOnly && (
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    variant="icon"
                    onClick={() => handleMoveSection(index, -1)}
                    disabled={index === 0}
                    aria-label="Move section up"
                    className="h-7 w-7"
                  >
                    <ChevronUp className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="icon"
                    onClick={() => handleMoveSection(index, 1)}
                    disabled={index === sections.length - 1}
                    aria-label="Move section down"
                    className="h-7 w-7"
                  >
                    <ChevronDown className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="danger" size="sm" onClick={() => handleDeleteSection(section)}>
                    Delete
                  </Button>
                </div>
              )}
            </div>
            {isManual ? (
              <>
                <ul className="mt-2 divide-y divide-black/5 dark:divide-white/5">
                  {sectionManualEntries.map((entry) => (
                    <ManualMacroRow key={entry.id} entry={entry} readOnly={readOnly} onRemove={handleRemoveManual} />
                  ))}
                  {sectionManualEntries.length === 0 && (
                    <li>
                      <EmptyState compact title="Nothing logged here yet" />
                    </li>
                  )}
                </ul>
                {!readOnly && <ManualMacroForm onAdd={(fields) => handleAddManual(section.id, fields)} />}
              </>
            ) : (
              <>
                <ul className="mt-2 divide-y divide-black/5 dark:divide-white/5">
                  {sectionEntries.map((entry) => (
                    <EntryRow key={entry.id} entry={entry} readOnly={readOnly} sections={sections} onRemove={handleRemove} onRefile={handleRefile} onUpdatePortions={handleUpdatePortions} />
                  ))}
                  {sectionEntries.length === 0 && (
                    <li>
                      <EmptyState compact title="Nothing logged here yet" />
                    </li>
                  )}
                </ul>
                {!readOnly && (
                  <div className="mt-3">
                    <AddFoodButtons
                      onAdd={() => setAddFoodTarget({ id: section.id, label: section.label })}
                      onScan={() => scan.start({ id: section.id, label: section.label })}
                      scanLabel={`Scan a barcode into ${section.label}`}
                    />
                  </div>
                )}
              </>
            )}
          </div>
        );
      })}

      {readOnly && (
        <form onSubmit={handleAddSection} className="flex items-center gap-2">
          <input
            value={newSectionLabel}
            onChange={(e) => setNewSectionLabel(e.target.value)}
            placeholder="e.g. Meal 5, Pre-workout…"
            className="min-w-0 flex-1 rounded-xl border border-black/10 bg-transparent px-3.5 py-2 text-sm dark:border-white/10"
          />
          <Button type="submit" variant="outline" size="sm" disabled={addingSection}>
            + Add section
          </Button>
        </form>
      )}

      {isManual
        ? otherManualEntries.length > 0 && (
            <div className="rounded-2xl border border-black/[.05] bg-card p-4 dark:border-white/10">
              <h4 className="font-medium text-black dark:text-zinc-50">Other</h4>
              <p className="text-xs text-zinc-500">Not yet filed under a section.</p>
              <ul className="mt-2 divide-y divide-black/5 dark:divide-white/5">
                {otherManualEntries.map((entry) => (
                  <ManualMacroRow key={entry.id} entry={entry} readOnly={readOnly} onRemove={handleRemoveManual} />
                ))}
              </ul>
            </div>
          )
        : otherEntries.length > 0 && (
            <div className="rounded-2xl border border-black/[.05] bg-card p-4 dark:border-white/10">
              <h4 className="font-medium text-black dark:text-zinc-50">Other</h4>
              <p className="text-xs text-zinc-500">Not yet filed under a section.</p>
              <ul className="mt-2 divide-y divide-black/5 dark:divide-white/5">
                {otherEntries.map((entry) => (
                  <EntryRow key={entry.id} entry={entry} readOnly={readOnly} sections={sections} onRemove={handleRemove} onRefile={handleRefile} onUpdatePortions={handleUpdatePortions} />
                ))}
              </ul>
            </div>
          )}

      {(isManual ? manualEntries.length === 0 : entries.length === 0) && sections.length === 0 && (
        <EmptyState
          icon={Utensils}
          title={isToday ? 'Nothing logged yet today' : 'Nothing logged this day'}
          hint={
            readOnly
              ? 'No food entries for this day.'
              : isManual
                ? 'Add a section above, then log macros against it.'
                : 'Search for a food or scan a barcode to add the first one.'
          }
        />
      )}
      {!readOnly && !isManual && sections.length === 0 && (
        <AddFoodButtons
          prominent
          onAdd={() => setAddFoodTarget({ id: null, label: 'Other' })}
          onScan={() => scan.start({ id: null, label: 'Other' })}
          scanLabel="Scan a barcode"
        />
      )}

      {addFoodTarget && (
        <AddFoodSheet
          sectionLabel={addFoodTarget.label}
          onAdd={(food, portions) => handleAdd(food, portions, addFoodTarget.id)}
          recipes={recipes}
          onAddRecipe={(recipeId, servings) => handleAddRecipe(recipeId, servings, addFoodTarget.id)}
          onAddQuickAdd={(fields) => handleAddQuickAdd(fields, addFoodTarget.id)}
          favorites={favorites}
          recentlyLogged={recentlyLogged}
          favoriteIds={favoriteIds}
          onToggleFavorite={handleToggleFavorite}
          onClose={() => setAddFoodTarget(null)}
        />
      )}
    </div>
  );
}
