'use client';

import { useEffect, useMemo, useState } from 'react';
import { Barcode, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Search, Utensils } from 'lucide-react';
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
import { getFavoriteFoods, getFoodByBarcode, getRecentlyLoggedFoods, setFavoriteFood, upsertFoodFromBarcode } from '@/lib/data/foods';
import { logRecipeToDiary } from '@/lib/data/recipes';
import { addJournalEntry } from '@/lib/data/clientJournal';
import { fail, ok } from '@/lib/data/result';
import { lookupBarcode } from '@/lib/openFoodFacts';
import { weeklyTarget } from '@/lib/calculations';
import { toEngineProfile } from '@/lib/utils/clientProfile';
import { addDays, DEFAULT_TIMEZONE, todayIsoInTz, toIsoDate } from '@/lib/utils/dates';
import { entryMacros, totalMacros } from '@/lib/utils/foodTotals';
import { AddFoodSheet } from './AddFoodSheet';
import { BarcodeScanner } from './BarcodeScanner';
import type { NutritionTrackingMode } from './categories';
import type {
  ClientProfileRow,
  FoodDiaryEntryRow,
  FoodRow,
  ManualMacroEntryRow,
  MealSectionRow,
  RecipeRow,
} from '@/lib/data/types';

function ManualMacroForm({ onAdd }: { onAdd: (fields: { calories: number | null; protein: number | null; carbs: number | null; fat: number | null }) => void }) {
  const [calories, setCalories] = useState('');
  const [protein, setProtein] = useState('');
  const [carbs, setCarbs] = useState('');
  const [fat, setFat] = useState('');
  const inputCls = 'w-full rounded-md border border-black/10 bg-transparent px-2 py-1.5 text-sm dark:border-white/10';

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!calories && !protein && !carbs && !fat) return;
    onAdd({
      calories: calories === '' ? null : Number(calories),
      protein: protein === '' ? null : Number(protein),
      carbs: carbs === '' ? null : Number(carbs),
      fat: fat === '' ? null : Number(fat),
    });
    setCalories('');
    setProtein('');
    setCarbs('');
    setFat('');
  }

  return (
    <form onSubmit={handleSubmit} className="mt-2 grid grid-cols-2 gap-1.5 sm:grid-cols-5">
      <input type="number" placeholder="kcal" value={calories} onChange={(e) => setCalories(e.target.value)} className={inputCls} />
      <input type="number" placeholder="protein g" value={protein} onChange={(e) => setProtein(e.target.value)} className={inputCls} />
      <input type="number" placeholder="carbs g" value={carbs} onChange={(e) => setCarbs(e.target.value)} className={inputCls} />
      <input type="number" placeholder="fat g" value={fat} onChange={(e) => setFat(e.target.value)} className={inputCls} />
      <Button type="submit" variant="ghost" size="sm" className="col-span-2 sm:col-span-1">
        Add
      </Button>
    </form>
  );
}

function ManualMacroRow({ entry, readOnly, onRemove }: { entry: ManualMacroEntryRow; readOnly: boolean; onRemove: (id: string) => void }) {
  return (
    <li className="flex items-center justify-between gap-2 p-3">
      <p className="text-sm text-zinc-700 dark:text-zinc-300">
        {entry.calories != null ? `${Math.round(entry.calories)} kcal` : '—'} ·{' '}
        {Math.round(entry.protein ?? 0)}P / {Math.round(entry.carbs ?? 0)}C / {Math.round(entry.fat ?? 0)}F
      </p>
      {!readOnly && (
        <Button variant="danger" size="sm" onClick={() => onRemove(entry.id)}>
          Remove
        </Button>
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
              min={0}
              step="any"
              autoFocus
              value={portions}
              onChange={(e) => setPortions(Number(e.target.value))}
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
  return (
    <li>
      <button
        type="button"
        disabled={readOnly}
        onClick={() => setEditing(true)}
        className="flex w-full items-center justify-between gap-2 p-3 text-left disabled:cursor-default"
      >
        <p className="truncate text-sm text-black dark:text-zinc-50">{entry.food?.name ?? entry.quick_add_name ?? 'Unknown food'}</p>
        <span className="shrink-0 text-sm text-zinc-500">{Math.round(macros.calories)} kcal</span>
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
  profile: ClientProfileRow | null;
  programWeek: number;
  nutritionMode: NutritionTrackingMode;
}) {
  const confirm = useConfirm();
  const { run } = useAction();
  const { run: runRecipe } = useAction();
  const { run: runSection, busy: addingSection } = useAction();
  const { run: runFeedback, busy: sendingFeedback } = useAction();
  const { run: runManual } = useAction();
  // Which meal section a scan will file into -- null means closed; { id: null } targets the
  // unfiled "Other" bucket (the header's "Scan barcode" button), a section id targets that
  // section's own "Scan" trigger. Mirrors addFoodTarget below so a scanned item can land
  // directly in a meal instead of always going to "Other" for a manual re-file afterward.
  const [scanTarget, setScanTarget] = useState<{ id: string | null; label: string } | null>(null);
  const [scanStatus, setScanStatus] = useState<string | null>(null);
  // Shared bottom-sheet "Add food" target -- null means closed; { id: null } targets the
  // unfiled "Other" bucket (the header's "Search foods" button), a section id targets that
  // section's own "+ Add food" button. One sheet for all entry points, matching the
  // prototype's single shared addFoodModal instead of an always-visible inline panel.
  const [addFoodTarget, setAddFoodTarget] = useState<{ id: string | null; label: string } | null>(null);
  const [newSectionLabel, setNewSectionLabel] = useState('');
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedbackBody, setFeedbackBody] = useState('');
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
  const [favorites, setFavorites] = useState<FoodRow[]>([]);
  const [recentlyLogged, setRecentlyLogged] = useState<FoodRow[]>([]);
  const isToday = viewingDate === todayIso;
  const favoriteIds = useMemo(() => new Set(favorites.map((f) => f.id)), [favorites]);

  // Lazy, not part of initialEntries -- cheap derived/lookup queries the sheet only needs once
  // it's actually opened for the first time, not on every Food Tracking tab visit.
  useEffect(() => {
    if (readOnly || isManual) return;
    getFavoriteFoods(clientId).then(setFavorites);
    getRecentlyLoggedFoods(clientId).then(setRecentlyLogged);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once per client, not on every entries/date change
  }, [clientId]);

  async function handleToggleFavorite(food: FoodRow, isFavorite: boolean) {
    setFavorites((prev) => (isFavorite ? [food, ...prev.filter((f) => f.id !== food.id)] : prev.filter((f) => f.id !== food.id)));
    await setFavoriteFood(clientId, food.id, isFavorite);
  }

  const totals = isManual
    ? manualEntries.reduce(
        (acc, e) => {
          acc.calories += e.calories ?? 0;
          acc.protein += e.protein ?? 0;
          acc.carbs += e.carbs ?? 0;
          acc.fat += e.fat ?? 0;
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

  // Coach-only: leaves a note tagged to the day being viewed rather than granting edit
  // access to the client's own logged food -- shows up under the client's Info tab.
  async function handleSendFeedback(e: React.FormEvent) {
    e.preventDefault();
    if (!feedbackBody.trim()) return;
    await runFeedback(() => addJournalEntry(clientId, 'note', feedbackBody.trim(), viewingDate), {
      success: 'Feedback saved to Info tab',
      onDone: () => {
        setFeedbackBody('');
        setFeedbackOpen(false);
      },
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

  async function handleBarcodeDetected(barcode: string) {
    const target = scanTarget;
    setScanTarget(null);
    setScanStatus('Looking up…');
    try {
      let food = await getFoodByBarcode(barcode);
      if (!food) {
        const product = await lookupBarcode(barcode);
        if (!product) {
          setScanStatus(`No product found for barcode ${barcode} — try search below.`);
          return;
        }
        food = await upsertFoodFromBarcode(barcode, { ...product, portion: '1 gram' });
      }
      await handleAdd(food, 100, target?.id ?? null);
      setScanStatus(`Added ${food.name} to ${target?.label ?? 'Other'}.`);
    } catch (err) {
      setScanStatus(err instanceof Error ? err.message : 'Lookup failed.');
    }
  }

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

      {readOnly && (
        <div>
          {!feedbackOpen ? (
            <Button variant="outline" size="sm" onClick={() => setFeedbackOpen(true)}>
              Leave feedback on this day
            </Button>
          ) : (
            <form onSubmit={handleSendFeedback} className="space-y-2 rounded-2xl border border-black/[.05] p-3 dark:border-white/10">
              <textarea
                value={feedbackBody}
                onChange={(e) => setFeedbackBody(e.target.value)}
                placeholder={`Feedback on ${isToday ? "today's" : dateLabel} nutrition…`}
                rows={2}
                autoFocus
                className="w-full rounded-md border border-black/10 bg-transparent px-2.5 py-1.5 text-sm dark:border-white/10"
              />
              <div className="flex gap-2">
                <Button type="submit" variant="primary" size="sm" disabled={sendingFeedback || !feedbackBody.trim()}>
                  Save to Info tab
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => setFeedbackOpen(false)}>
                  Cancel
                </Button>
              </div>
            </form>
          )}
        </div>
      )}

      <div className="rounded-2xl border border-black/[.05] p-4 dark:border-white/10">
        <p className="text-2xl font-bold text-black dark:text-zinc-50">
          {Math.round(totals.calories).toLocaleString()}
          <span className="text-base font-normal text-zinc-500">
            {dayTarget ? ` / ${Math.round(dayTarget.calories).toLocaleString()} kcal` : ' kcal'}
          </span>
        </p>
        <dl className="mt-3 grid grid-cols-3 gap-2 text-sm">
          <div>
            <dt className="text-zinc-500">Protein</dt>
            <dd className="font-semibold text-black dark:text-zinc-50">{Math.round(totals.protein)}g</dd>
          </div>
          <div>
            <dt className="text-zinc-500">Carbs</dt>
            <dd className="font-semibold text-black dark:text-zinc-50">{Math.round(totals.carbs)}g</dd>
          </div>
          <div>
            <dt className="text-zinc-500">Fat</dt>
            <dd className="font-semibold text-black dark:text-zinc-50">{Math.round(totals.fat)}g</dd>
          </div>
        </dl>
      </div>

      {!readOnly && !isManual && (
        <div className="space-y-2">
          {!scanTarget && (
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex flex-1 items-center justify-center gap-1.5"
                onClick={() => {
                  setScanTarget({ id: null, label: 'Other' });
                  setScanStatus(null);
                }}
              >
                <Barcode className="h-4 w-4" />
                Scan barcode
              </Button>
              <Button
                variant="outline"
                className="flex flex-1 items-center justify-center gap-1.5"
                onClick={() => setAddFoodTarget({ id: null, label: 'Other' })}
              >
                <Search className="h-4 w-4" />
                Search foods
              </Button>
            </div>
          )}
          {scanTarget && (
            <BarcodeScanner onDetected={handleBarcodeDetected} onClose={() => setScanTarget(null)} />
          )}
          {scanStatus && <p className="text-sm text-zinc-500">{scanStatus}</p>}
          <p className="text-xs text-zinc-500">This scans into &quot;Other&quot; below, unfiled — use a section&apos;s own &quot;Scan&quot; or &quot;+ Add food&quot; link to file directly into that meal instead.</p>
          <button type="button" onClick={handleCopyFromYesterday} className="text-sm font-medium text-accent hover:underline">
            Copy from yesterday
          </button>
        </div>
      )}
      {!readOnly && isManual && (
        <p className="text-xs text-zinc-500">No food search in this mode — enter macros directly per section below.</p>
      )}

      {sections.map((section, index) => {
        const sectionEntries = entries.filter((e) => e.meal_section_id === section.id);
        const sectionTotals = totalMacros(sectionEntries);
        const sectionManualEntries = manualEntries.filter((e) => e.meal_section_id === section.id);
        const sectionManualCalories = sectionManualEntries.reduce((sum, e) => sum + (e.calories ?? 0), 0);
        return (
          <div key={section.id} className="rounded-2xl border border-black/[.05] p-4 dark:border-white/10">
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
                  <div className="mt-2 flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setAddFoodTarget({ id: section.id, label: section.label })}
                      className="text-sm font-medium text-accent hover:underline"
                    >
                      + Add food
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setScanTarget({ id: section.id, label: section.label });
                        setScanStatus(null);
                      }}
                      className="text-sm font-medium text-accent hover:underline"
                    >
                      Scan
                    </button>
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
            className="flex-1 rounded-md border border-black/10 bg-transparent px-3 py-1.5 text-sm dark:border-white/10"
          />
          <Button type="submit" variant="outline" disabled={addingSection}>
            + Add section
          </Button>
        </form>
      )}

      {isManual
        ? otherManualEntries.length > 0 && (
            <div className="rounded-2xl border border-black/[.05] p-4 dark:border-white/10">
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
            <div className="rounded-2xl border border-black/[.05] p-4 dark:border-white/10">
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
                : 'Scan a barcode or search below to add the first one.'
          }
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
