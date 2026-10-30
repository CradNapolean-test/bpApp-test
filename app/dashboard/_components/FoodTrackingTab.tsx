'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Copy, Trash2, Utensils } from 'lucide-react';
import { Button } from '@/app/_components/Button';
import { useAction } from '@/app/_components/useAction';
import { useBackHandler } from '@/app/_components/useBackHandler';
import { useConfirm } from '@/app/_components/ConfirmDialog';
import { useToast } from '@/app/_components/ToastProvider';
import { EmptyState } from '@/app/_components/EmptyState';
import {
  addFoodDiaryEntry,
  addQuickAddEntry,
  copyDiaryBetweenDates,
  getFoodDiaryForDate,
  removeFoodDiaryEntry,
  updateFoodDiaryEntryPortions,
  updateFoodDiaryEntrySection,
  updateQuickAddEntry,
} from '@/lib/data/foodDiary';
import { getOrCreateDailyLog } from '@/lib/data/dailyLogs';
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
import { ok } from '@/lib/data/result';
import { LOCKED_DAY_MESSAGE, canBrowseDate, canEditFoodDay } from '@/lib/dayPatch';
import { FOOD_LIMITS, checkFoodNumber, firstFoodProblem } from '@/lib/foodLimits';
import { dayCalories, weeklyTarget } from '@/lib/calculations';
import { toMemberEngineProfile } from '@/lib/utils/clientProfile';
import { targetsHeldBack } from '@/lib/onboarding';
import { CustomTargetsSheet } from './CustomTargetsSheet';
import { addDays, DEFAULT_TIMEZONE, toIsoDate } from '@/lib/utils/dates';
import { copyMessage, dayLabel, type DiaryCopyRequest } from '@/lib/diaryCopy';
import { suggestPairs, type PairSuggestion } from '@/lib/foodPairs';
import { dayFieldsFromManual, entryMacros, totalMacros } from '@/lib/utils/foodTotals';
import { AddFoodSheet } from './AddFoodSheet';
import { CopyFoodSheet, type CopyScope } from './CopyFoodSheet';
import { FeedbackThread } from './FeedbackThread';
import { NutritionSummary } from './NutritionSummary';
import { AddFoodButtons, useBarcodeAdd, useFoodPairs, useFoodShortcuts } from './FoodEntryTools';
import { PairSuggestions } from './PairSuggestions';
import { useDialog } from '@/app/_components/useDialog';
import { ServingAmount } from './ServingAmount';
import { useTodayIso } from './useTodayIso';
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
  const problem = firstFoodProblem([
    checkFoodNumber(protein, 'grams', { allowBlank: true }),
    checkFoodNumber(carbs, 'grams', { allowBlank: true }),
    checkFoodNumber(fat, 'grams', { allowBlank: true }),
    kcal > FOOD_LIMITS.kcal ? `That is ${kcal.toLocaleString('en-GB')} kcal; one entry can be at most ${FOOD_LIMITS.kcal.toLocaleString('en-GB')}.` : null,
  ]);
  const inputCls = 'w-full rounded-xl border border-black/10 bg-transparent px-3 py-2.5 text-base dark:border-white/10';
  const labelCls = 'text-[11px] font-bold uppercase tracking-wide';

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (empty || problem) return;
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
          <input type="number" inputMode="decimal" step="0.1" min={0} max={FOOD_LIMITS.grams} placeholder="g" aria-label="Protein in grams" value={protein} onChange={(e) => setProtein(e.target.value)} className={inputCls} />
        </label>
        <label className="space-y-1">
          <span className={labelCls} style={{ color: '#e8a020' }}>Carbs</span>
          <input type="number" inputMode="decimal" step="0.1" min={0} max={FOOD_LIMITS.grams} placeholder="g" aria-label="Carbs in grams" value={carbs} onChange={(e) => setCarbs(e.target.value)} className={inputCls} />
        </label>
        <label className="space-y-1">
          <span className={labelCls} style={{ color: '#2ecc71' }}>Fat</span>
          <input type="number" inputMode="decimal" step="0.1" min={0} max={FOOD_LIMITS.grams} placeholder="g" aria-label="Fat in grams" value={fat} onChange={(e) => setFat(e.target.value)} className={inputCls} />
        </label>
      </div>
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-zinc-500">{empty ? 'Calories are worked out for you' : <><b className="text-black dark:text-zinc-50">{kcal}</b> kcal</>}</p>
        <button
          type="submit"
          disabled={empty || problem != null}
          className="rounded-full bg-accent px-5 py-2 text-sm font-extrabold text-accent-foreground disabled:opacity-40"
        >
          Add
        </button>
      </div>
      {problem && <p className="text-xs font-semibold text-danger">{problem}</p>}
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
// used elsewhere in this app. A Quick Add (no food behind it) can be corrected too: its name, calories and macros (FS5).
type QuickAddFields = { name: string; calories: number | null; protein: number | null; carbs: number | null; fat: number | null };

function EditEntrySheet({
  entry,
  sections,
  onClose,
  onSave,
  onSaveQuickAdd,
  onDelete,
  onRefile,
}: {
  entry: FoodDiaryEntryRow;
  sections: MealSectionRow[];
  onClose: () => void;
  onSave: (portions: number) => void;
  onSaveQuickAdd: (fields: QuickAddFields) => void;
  onDelete: () => void;
  onRefile?: (sectionId: string) => void;
}) {
  useBackHandler(true, onClose);
  const [portions, setPortions] = useState(entry.portions);
  const isPerGram = entry.food?.portion === '1 gram';
  const unitLabel = isPerGram ? 'Grams' : `× ${entry.food?.portion ?? 'portion'}`;
  const quantityProblem = entry.food && portions > 0 ? checkFoodNumber(portions, isPerGram ? 'grams' : 'portions') : null;

  // Quick Add fields, as text so a box can be emptied.
  const [qName, setQName] = useState(entry.quick_add_name ?? '');
  const [qCalories, setQCalories] = useState(entry.quick_add_calories != null ? String(entry.quick_add_calories) : '');
  const [qProtein, setQProtein] = useState(entry.quick_add_protein != null ? String(entry.quick_add_protein) : '');
  const [qCarbs, setQCarbs] = useState(entry.quick_add_carbs != null ? String(entry.quick_add_carbs) : '');
  const [qFat, setQFat] = useState(entry.quick_add_fat != null ? String(entry.quick_add_fat) : '');
  const quickProblem = firstFoodProblem([
    checkFoodNumber(qCalories, 'kcal', { allowBlank: true }),
    checkFoodNumber(qProtein, 'grams', { allowBlank: true }),
    checkFoodNumber(qCarbs, 'grams', { allowBlank: true }),
    checkFoodNumber(qFat, 'grams', { allowBlank: true }),
  ]);
  const quickReady = qName.trim() !== '' && (qCalories !== '' || qProtein !== '' || qCarbs !== '' || qFat !== '') && quickProblem == null;
  const num = (text: string) => (text.trim() === '' ? null : Number(text));
  const boxCls = 'w-full rounded-md border border-black/10 bg-transparent px-3 py-2 text-sm dark:border-white/10';
  // A real dialog (SH3): focus moves in and returns, Tab stays inside, Escape closes, the page behind is inert.
  const dialogRef = useDialog<HTMLDivElement>({ onClose });

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/45" onClick={onClose}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Edit food entry"
        onClick={(e) => e.stopPropagation()}
        className="max-h-[85vh] w-full overflow-y-auto rounded-t-2xl bg-[var(--background)] p-4 pb-6"
      >
        <h2 className="mb-3 text-sm font-bold text-black dark:text-zinc-50">
          {entry.food?.name ?? entry.quick_add_name ?? 'Unknown food'}
        </h2>
        {entry.food ? (
          <div className="space-y-1">
            <ServingAmount food={entry.food} value={portions} onChange={setPortions} unitLabel={unitLabel} inputClassName={boxCls} autoFocus />
            {quantityProblem && <p className="text-xs font-semibold text-danger">{quantityProblem}</p>}
          </div>
        ) : (
          <div className="space-y-2">
            <input type="text" aria-label="Name" value={qName} onChange={(e) => setQName(e.target.value)} className={boxCls} />
            <div className="grid grid-cols-2 gap-1.5">
              <input type="number" inputMode="decimal" min={0} max={FOOD_LIMITS.kcal} placeholder="kcal" aria-label="Calories" value={qCalories} onChange={(e) => setQCalories(e.target.value)} className={boxCls} />
              <input type="number" inputMode="decimal" min={0} max={FOOD_LIMITS.grams} placeholder="protein g" aria-label="Protein in grams" value={qProtein} onChange={(e) => setQProtein(e.target.value)} className={boxCls} />
              <input type="number" inputMode="decimal" min={0} max={FOOD_LIMITS.grams} placeholder="carbs g" aria-label="Carbs in grams" value={qCarbs} onChange={(e) => setQCarbs(e.target.value)} className={boxCls} />
              <input type="number" inputMode="decimal" min={0} max={FOOD_LIMITS.grams} placeholder="fat g" aria-label="Fat in grams" value={qFat} onChange={(e) => setQFat(e.target.value)} className={boxCls} />
            </div>
            {quickProblem && <p className="text-xs font-semibold text-danger">{quickProblem}</p>}
          </div>
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
          {entry.food ? (
            <Button variant="primary" onClick={() => onSave(portions)} disabled={portions <= 0 || quantityProblem != null}>
              Save
            </Button>
          ) : (
            <Button
              variant="primary"
              onClick={() => onSaveQuickAdd({ name: qName.trim(), calories: num(qCalories), protein: num(qProtein), carbs: num(qCarbs), fat: num(qFat) })}
              disabled={!quickReady}
            >
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
  onUpdateQuickAdd,
}: {
  entry: FoodDiaryEntryRow;
  readOnly: boolean;
  sections: MealSectionRow[];
  onRemove: (id: string) => void;
  onRefile: (id: string, sectionId: string | null) => void;
  onUpdatePortions: (id: string, portions: number) => void;
  onUpdateQuickAdd: (id: string, fields: QuickAddFields) => void;
}) {
  const [editing, setEditing] = useState(false);
  const macros = entryMacros(entry);
  // A quick-add can be calories only ("650 kcal, don't know the split"); showing P 0 / C 0 / F 0 there would be wrong.
  const hasMacroSplit =
    entry.food != null || entry.quick_add_protein != null || entry.quick_add_carbs != null || entry.quick_add_fat != null;
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
          {hasMacroSplit && (
            <span className="block text-xs text-zinc-500">
              <span style={{ color: '#a07aff' }}>P {Math.round(macros.protein)}g</span> ·{' '}
              <span style={{ color: '#e8a020' }}>C {Math.round(macros.carbs)}g</span> ·{' '}
              <span style={{ color: '#2ecc71' }}>F {Math.round(macros.fat)}g</span>
            </span>
          )}
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
          onSaveQuickAdd={(fields) => {
            onUpdateQuickAdd(entry.id, fields);
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
  recentDays,
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
  // Coach view: the last seven days (oldest first) with calories, to see the week at a glance.
  recentDays?: { date: string; calories: number | null }[];
}) {
  // The coach sets up a member's meal sections (rename, reorder, delete, add); that stays folded away until asked for.
  const [editingSections, setEditingSections] = useState(false);
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
  // The Copy sheet: null is closed, otherwise it copies the whole day or one meal.
  const [copyScope, setCopyScope] = useState<CopyScope | null>(null);
  const [newSectionLabel, setNewSectionLabel] = useState('');
  const isManual = nutritionMode === 'manual_import';

  const toast = useToast();
  const router = useRouter();
  // Changes here no longer reload the whole dashboard after every tap (FT3). They are counted, and the dashboard is refreshed once when the
  // member leaves this screen, so Home, Weekly Log and the coach see the day's food.
  const changed = useRef(false);
  useEffect(
    () => () => {
      if (changed.current) router.refresh();
    },
    [router]
  );
  // Today at the member's own timezone, kept current: it moves on at midnight and when the app returns to the foreground, so a phone left
  // open overnight no longer logs the new day's food on yesterday (FT2).
  const todayIso = useTodayIso(profile?.timezone ?? DEFAULT_TIMEZONE);
  const [viewingDate, setViewingDate] = useState(todayIso);
  const viewingRef = useRef(viewingDate);
  const loadTicket = useRef(0);
  const [currentDailyLogId, setCurrentDailyLogId] = useState(dailyLogId);
  const [entries, setEntries] = useState(initialEntries);
  const [manualEntries, setManualEntries] = useState(initialManualMacroEntries);
  const [dateLoading, setDateLoading] = useState(false);
  const isToday = viewingDate === todayIso;
  // When the server sends fresh data for today (after that refresh), show it if the member is looking at today. Without this a quick
  // return to this screen could show the entries from before their last change.
  const [seenEntries, setSeenEntries] = useState(initialEntries);
  const [seenManual, setSeenManual] = useState(initialManualMacroEntries);
  if (seenEntries !== initialEntries) {
    setSeenEntries(initialEntries);
    if (viewingDate === todayIso) {
      setEntries(initialEntries);
      setCurrentDailyLogId(dailyLogId);
    }
  }
  if (seenManual !== initialManualMacroEntries) {
    setSeenManual(initialManualMacroEntries);
    if (viewingDate === todayIso) setManualEntries(initialManualMacroEntries);
  }
  // Members change the last two weeks of food and look back a month (D20, FT1); a coach sees any day and changes none.
  const dayLocked = !readOnly && !canEditFoodDay(viewingDate, todayIso);
  const tomorrowIso = toIsoDate(addDays(new Date(todayIso + 'T00:00:00Z'), 1));
  const isTomorrow = viewingDate === tomorrowIso;
  const entryReadOnly = readOnly || dayLocked;
  const previousDay = toIsoDate(addDays(new Date(viewingDate + 'T00:00:00Z'), -1));
  const atBrowseLimit = !readOnly && !canBrowseDate(previousDay, todayIso);

  // When the date rolls over while the member is looking at "today", move to the new today.
  const lastToday = useRef(todayIso);
  useEffect(() => {
    if (lastToday.current === todayIso) return;
    const wasViewingToday = viewingRef.current === lastToday.current;
    lastToday.current = todayIso;
    if (wasViewingToday) Promise.resolve().then(() => loadDate(todayIso));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todayIso]);

  // Favourites and recently logged foods for the Add food sheet, loaded once (not for coaches or
  // typed-totals members, who never open it).
  const { favorites, recentlyLogged, favoriteIds, toggleFavorite: handleToggleFavorite } = useFoodShortcuts(clientId, !readOnly && !isManual);
  // What they usually eat with what, and the food just added (and where) that the "usually with" row under its meal is built on.
  const pairIndex = useFoodPairs(clientId, !readOnly && !isManual);
  const [pairBase, setPairBase] = useState<{ foodId: string; name: string; sectionId: string | null; date: string } | null>(null);

  const manualDay = dayFieldsFromManual(manualEntries);
  const totals = isManual
    ? { calories: manualDay.calories ?? 0, protein: manualDay.protein ?? 0, carbs: manualDay.carbs ?? 0, fat: manualDay.fat ?? 0 }
    : totalMacros(entries);
  // Uses the flat (non-cycling-aware) daily target -- this tab has no per-day day_type
  // context the way Weekly Log does, and threading that through here would be
  // disproportionate to a simple live comparison line.
  const [targetsOpen, setTargetsOpen] = useState(false);
  const dayTarget = useMemo(() => {
    const engineProfile = toMemberEngineProfile(profile, readOnly);
    return engineProfile ? weeklyTarget(engineProfile, programWeek)?.dailyFlat ?? null : null;
  }, [profile, programWeek, readOnly]);

  // Reads a day (never creates it: browsing back used to leave a blank row for every day looked at). A slow answer for a day the member
  // has already moved off is dropped.
  async function loadDate(date: string) {
    const ticket = ++loadTicket.current;
    setDateLoading(true);
    try {
      if (isManual) {
        const result = await getManualMacrosForDate(clientId, date);
        if (ticket !== loadTicket.current) return;
        viewingRef.current = date;
        setViewingDate(date);
        setCurrentDailyLogId(result.dailyLogId);
        setManualEntries(result.entries);
      } else {
        const result = await getFoodDiaryForDate(clientId, date);
        if (ticket !== loadTicket.current) return;
        viewingRef.current = date;
        setViewingDate(date);
        setCurrentDailyLogId(result.dailyLogId);
        setEntries(result.entries);
      }
    } catch (err) {
      if (ticket === loadTicket.current) toast.error(err instanceof Error && err.message ? err.message : 'Could not load that day. Please try again.');
    } finally {
      if (ticket === loadTicket.current) setDateLoading(false);
    }
  }

  // The day's row is made the moment the first food is added to it, not when the day is looked at (FT1). It also means an add can no
  // longer do nothing at all when the day had no row yet (FT4).
  async function ensureLogId(): Promise<string> {
    if (currentDailyLogId) return currentDailyLogId;
    const log = await getOrCreateDailyLog(clientId, viewingDate);
    setCurrentDailyLogId(log.id);
    return log.id;
  }

  // Each change returns the day's entries; they are shown straight away (if the member is still on that day) with no second trip to the
  // server and no reload of the whole dashboard (FT3). Every handler returns whether it worked, so the Add food sheet can stay open if not.
  const quiet = {
    refresh: false,
    onDone: () => {
      changed.current = true;
    },
  } as const;

  async function handleAddManual(
    sectionId: string | null,
    fields: { calories: number | null; protein: number | null; carbs: number | null; fat: number | null }
  ) {
    const date = viewingDate;
    return runManual(async () => {
      const rows = await addManualMacroEntry(await ensureLogId(), sectionId, fields);
      if (viewingRef.current === date) setManualEntries(rows);
    }, quiet);
  }

  async function handleRemoveManual(id: string) {
    if (!currentDailyLogId) return;
    const date = viewingDate;
    return runManual(async () => {
      const rows = await removeManualMacroEntry(id, currentDailyLogId);
      if (viewingRef.current === date) setManualEntries(rows);
    }, quiet);
  }

  async function handleAdd(food: FoodRow, portions: number, sectionId: string | null = null, startsPairs = true) {
    const date = viewingDate;
    const added = await run(
      async () => {
        const rows = await addFoodDiaryEntry(await ensureLogId(), food.id, portions, sectionId);
        if (viewingRef.current === date) setEntries(rows);
      },
      { success: `${food.name} added`, ...quiet }
    );
    // A food the member picked starts a row of "usually with" suggestions under its meal; tapping one of those leaves the row as it was.
    if (added && startsPairs && viewingRef.current === date) setPairBase({ foodId: food.id, name: food.name, sectionId, date });
    return added;
  }

  async function handleAddQuickAdd(
    fields: { name: string; calories: number | null; protein: number | null; carbs: number | null; fat: number | null },
    sectionId: string | null = null
  ) {
    const date = viewingDate;
    return run(
      async () => {
        const rows = await addQuickAddEntry(await ensureLogId(), sectionId, fields);
        if (viewingRef.current === date) setEntries(rows);
      },
      { success: `${fields.name} added`, ...quiet }
    );
  }

  async function handleUpdateQuickAdd(id: string, fields: QuickAddFields) {
    if (!currentDailyLogId) return;
    const date = viewingDate;
    return run(
      async () => {
        const rows = await updateQuickAddEntry(id, currentDailyLogId, fields);
        if (viewingRef.current === date) setEntries(rows);
      },
      { success: 'Updated', ...quiet }
    );
  }

  async function handleAddRecipe(recipeId: string, servings: number, sectionId: string | null = null) {
    const recipe = recipes.find((r) => r.id === recipeId);
    const date = viewingDate;
    return runRecipe(
      async () => {
        const rows = await logRecipeToDiary(await ensureLogId(), recipeId, servings, sectionId);
        if (viewingRef.current === date) setEntries(rows);
      },
      { success: recipe ? `${recipe.name} added` : 'Recipe added', ...quiet }
    );
  }

  const scan = useBarcodeAdd((food, portions, target) => handleAdd(food, portions, target?.id ?? null));

  // Copies a day or a meal between two days. When the food lands on the day on screen it is shown straight away; when it goes to another
  // day there is nothing to show but the message. Returns whether it worked, so the sheet can stay open if not.
  async function handleCopy(request: DiaryCopyRequest): Promise<boolean> {
    const date = viewingDate;
    const intoViewed = request.toDate === date;
    return run(
      async () => {
        const copied = await copyDiaryBetweenDates(clientId, request.fromDate, request.toDate, {
          fromSectionId: request.fromSectionId,
          toSectionId: request.toSectionId,
        });
        if (!copied.ok) return copied;
        if (intoViewed && viewingRef.current === date) {
          setCurrentDailyLogId(copied.dailyLogId);
          setEntries(copied.entries);
        }
        const where = intoViewed ? `from ${dayLabel(request.fromDate, todayIso, true)}` : `to ${dayLabel(request.toDate, todayIso, true)}`;
        toast.success(copyMessage(copied.added, copied.found, where));
        return ok();
      },
      quiet
    );
  }

  function handleCopyFromYesterday() {
    const yesterday = toIsoDate(addDays(new Date(viewingDate + 'T00:00:00Z'), -1));
    return handleCopy({ fromDate: yesterday, toDate: viewingDate });
  }

  async function handleRemove(id: string) {
    if (!currentDailyLogId) return;
    const date = viewingDate;
    await run(
      async () => {
        const rows = await removeFoodDiaryEntry(id, currentDailyLogId);
        if (viewingRef.current === date) setEntries(rows);
      },
      { success: 'Removed', ...quiet }
    );
  }

  async function handleRefile(id: string, sectionId: string | null) {
    await run(
      async () => {
        await updateFoodDiaryEntrySection(id, sectionId);
        setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, meal_section_id: sectionId } : e)));
      },
      { success: 'Moved', ...quiet }
    );
  }

  async function handleUpdatePortions(id: string, portions: number) {
    if (!currentDailyLogId) return;
    const date = viewingDate;
    await run(
      async () => {
        const rows = await updateFoodDiaryEntryPortions(id, portions, currentDailyLogId);
        if (viewingRef.current === date) setEntries(rows);
      },
      { success: 'Updated', ...quiet }
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

  // The foods in a meal by id (a Quick Add has no food), to suggest what goes with them.
  const foodIdsIn = (sectionId: string | null) => entries.filter((e) => e.meal_section_id === sectionId && e.food_id).map((e) => e.food_id as string);

  // Under a meal, right after a food went into it: what the member usually has with that food, if anything. It is gone once that food is,
  // on another day, and when every suggestion has been added.
  function pairStrip(sectionId: string | null) {
    if (!pairIndex || !pairBase || pairBase.date !== viewingDate || pairBase.sectionId !== sectionId) return null;
    const inMeal = foodIdsIn(sectionId);
    if (!inMeal.includes(pairBase.foodId)) return null;
    const suggestions = suggestPairs(pairIndex, [pairBase.foodId], new Set(inMeal));
    if (suggestions.length === 0) return null;
    return (
      <PairSuggestions
        basedOn={pairBase.name}
        suggestions={suggestions}
        onAdd={(s) => handleAdd(s.food, s.portions, sectionId, false)}
        onDismiss={() => setPairBase(null)}
      />
    );
  }

  // For the Add food sheet: what goes with the foods already in the meal it is adding to.
  function goesWithMeal(sectionId: string | null): PairSuggestion[] {
    const inMeal = foodIdsIn(sectionId);
    return pairIndex && inMeal.length > 0 ? suggestPairs(pairIndex, inMeal, new Set(inMeal), 5) : [];
  }

  const otherEntries = entries.filter((e) => e.meal_section_id === null);
  const otherManualEntries = manualEntries.filter((e) => e.meal_section_id === null);
  const dateLabel = new Date(viewingDate + 'T00:00:00Z').toLocaleDateString('en-GB', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <Button variant="icon" aria-label="Previous day" onClick={() => loadDate(previousDay)} disabled={dateLoading || atBrowseLimit}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div className="text-sm font-medium">{isToday ? 'Today' : isTomorrow ? 'Tomorrow' : dateLabel}</div>
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
            disabled={dateLoading || viewingDate >= (readOnly ? todayIso : tomorrowIso)}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {isTomorrow && !readOnly && (
        <p className="rounded-xl bg-card-muted px-3 py-2 text-xs text-zinc-600 dark:text-zinc-400">
          Planning tomorrow. This food counts towards tomorrow, and stays out of this week&apos;s averages until then.
        </p>
      )}
      {dayLocked && <p className="rounded-xl bg-card-muted px-3 py-2 text-xs text-zinc-600 dark:text-zinc-400">{LOCKED_DAY_MESSAGE}</p>}

      {readOnly && recentDays && (() => {
        const logged = recentDays.filter((d) => d.calories != null);
        const avg = logged.length ? Math.round(logged.reduce((a, d) => a + (d.calories ?? 0), 0) / logged.length) : null;
        const top = Math.max(dayTarget?.calories ?? 0, ...logged.map((d) => d.calories ?? 0), 1);
        return (
          <div className="rounded-2xl border border-black/[.05] bg-card p-4 dark:border-white/10">
            <div className="flex items-baseline justify-between gap-2">
              <p className="text-xs font-bold uppercase tracking-wide text-zinc-500">Last 7 days</p>
              <p className="text-xs text-zinc-500">
                {logged.length} of 7 days logged{avg != null ? ` · avg ${avg.toLocaleString()} kcal` : ''}
                {dayTarget ? ` · target ${Math.round(dayTarget.calories).toLocaleString()}` : ''}
              </p>
            </div>
            <div className="mt-3 grid grid-cols-7 gap-1.5">
              {recentDays.map((d) => {
                const active = d.date === viewingDate;
                const h = d.calories != null ? Math.max(8, Math.round((d.calories / top) * 56)) : 0;
                return (
                  <button
                    key={d.date}
                    type="button"
                    onClick={() => loadDate(d.date)}
                    aria-label={`${d.date}: ${d.calories != null ? `${Math.round(d.calories)} kcal` : 'nothing logged'}`}
                    className={`flex flex-col items-center gap-1 rounded-lg py-1 ${active ? 'bg-accent/10' : ''}`}
                  >
                    <span className="flex h-14 w-full items-end justify-center">
                      {d.calories != null ? <span className="w-4 rounded-sm bg-accent" style={{ height: h }} /> : <span className="h-1 w-4 rounded-sm bg-black/10 dark:bg-white/15" />}
                    </span>
                    <span className="text-[10px] font-semibold text-zinc-500">{new Date(d.date + 'T00:00:00Z').toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'UTC' }).slice(0, 2)}</span>
                    <span className="text-[10px] text-zinc-400">{d.calories != null ? Math.round(d.calories) : '·'}</span>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })()}

      <FeedbackThread
        clientId={clientId}
        date={viewingDate}
        items={feedback}
        canGive={canGiveFeedback}
        placeholder={`Feedback on ${isToday ? "today's" : dateLabel} nutrition…`}
        buttonLabel="Leave feedback on this day"
      />

      <NutritionSummary totals={totals} target={dayTarget} title={isToday ? "Today's targets" : 'Targets'} dateLabel={dateLabel} held={targetsHeldBack(profile, readOnly)} memberView={!readOnly} />
      {!readOnly && (
        <div className="-mt-2 flex items-center justify-between gap-3 px-1">
          <p className="text-xs text-zinc-500">
            {profile?.custom_calories != null ? 'Using the daily targets you set.' : 'Track somewhere else, or want different numbers?'}
          </p>
          <button type="button" onClick={() => setTargetsOpen(true)} className="shrink-0 text-xs font-bold text-accent hover:underline">
            {profile?.custom_calories != null ? 'Change my targets' : 'Set my own targets'}
          </button>
        </div>
      )}
      {targetsOpen && <CustomTargetsSheet clientId={clientId} profile={profile} isCoach={false} onClose={() => setTargetsOpen(false)} />}

      {!entryReadOnly && !isManual && (
        <div className="space-y-2">
          {scan.panel}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            {entries.length === 0 && (
              <button type="button" onClick={handleCopyFromYesterday} className="text-sm font-semibold text-accent hover:underline">
                Copy yesterday&apos;s food
              </button>
            )}
            <button type="button" onClick={() => setCopyScope({ kind: 'day' })} className="text-sm font-semibold text-accent hover:underline">
              {entries.length === 0 ? 'Choose another day…' : 'Copy this day…'}
            </button>
          </div>
        </div>
      )}
      {!entryReadOnly && isManual && (
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
                {readOnly && editingSections ? (
                  <SectionNameInput sectionId={section.id} initial={section.label} />
                ) : (
                  <h4 className="font-medium text-black dark:text-zinc-50">{section.label}</h4>
                )}
                <span className="shrink-0 text-sm text-zinc-500">
                  {Math.round(isManual ? sectionManualCalories : sectionTotals.calories)} kcal
                </span>
              </div>
              {!entryReadOnly && !isManual && (
                <button
                  type="button"
                  aria-label={`Copy ${section.label}`}
                  onClick={() => setCopyScope({ kind: 'meal', section })}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-zinc-400 hover:bg-black/5 hover:text-accent dark:hover:bg-white/10"
                >
                  <Copy className="h-4 w-4" />
                </button>
              )}
              {readOnly && editingSections && (
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
                    <ManualMacroRow key={entry.id} entry={entry} readOnly={entryReadOnly} onRemove={handleRemoveManual} />
                  ))}
                  {sectionManualEntries.length === 0 && (
                    <li>
                      <EmptyState compact title="Nothing logged here yet" />
                    </li>
                  )}
                </ul>
                {!entryReadOnly && <ManualMacroForm onAdd={(fields) => handleAddManual(section.id, fields)} />}
              </>
            ) : (
              <>
                <ul className="mt-2 divide-y divide-black/5 dark:divide-white/5">
                  {sectionEntries.map((entry) => (
                    <EntryRow key={entry.id} entry={entry} readOnly={entryReadOnly} sections={sections} onRemove={handleRemove} onRefile={handleRefile} onUpdatePortions={handleUpdatePortions} onUpdateQuickAdd={handleUpdateQuickAdd} />
                  ))}
                  {sectionEntries.length === 0 && (
                    <li>
                      <EmptyState compact title="Nothing logged here yet" />
                    </li>
                  )}
                </ul>
                {!entryReadOnly && pairStrip(section.id)}
                {!entryReadOnly && (
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
        <button type="button" onClick={() => setEditingSections((v) => !v)} className="text-sm font-bold text-accent">
          {editingSections ? 'Done editing meal sections' : 'Edit meal sections'}
        </button>
      )}
      {readOnly && editingSections && (
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
                  <ManualMacroRow key={entry.id} entry={entry} readOnly={entryReadOnly} onRemove={handleRemoveManual} />
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
                  <EntryRow key={entry.id} entry={entry} readOnly={entryReadOnly} sections={sections} onRemove={handleRemove} onRefile={handleRefile} onUpdatePortions={handleUpdatePortions} onUpdateQuickAdd={handleUpdateQuickAdd} />
                ))}
              </ul>
              {!entryReadOnly && pairStrip(null)}
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
      {!entryReadOnly && !isManual && sections.length === 0 && (
        <AddFoodButtons
          prominent
          onAdd={() => setAddFoodTarget({ id: null, label: 'Other' })}
          onScan={() => scan.start({ id: null, label: 'Other' })}
          scanLabel="Scan a barcode"
        />
      )}

      {copyScope && (
        <CopyFoodSheet
          scope={copyScope}
          sections={sections}
          clientId={clientId}
          viewingDate={viewingDate}
          todayIso={todayIso}
          hasFood={copyScope.kind === 'meal' ? entries.some((e) => e.meal_section_id === copyScope.section.id) : entries.length > 0}
          onCopy={handleCopy}
          onClose={() => setCopyScope(null)}
        />
      )}

      {addFoodTarget && (
        <AddFoodSheet
          sectionLabel={addFoodTarget.label}
          onAdd={(food, portions) => handleAdd(food, portions, addFoodTarget.id)}
          recipes={recipes}
          onAddRecipe={(recipeId, servings) => handleAddRecipe(recipeId, servings, addFoodTarget.id)}
          onAddQuickAdd={(fields) => handleAddQuickAdd(fields, addFoodTarget.id)}
          goesWith={goesWithMeal(addFoodTarget.id)}
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
