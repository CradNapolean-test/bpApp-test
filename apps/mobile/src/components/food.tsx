import { CameraView, useCameraPermissions } from 'expo-camera';
import { useState } from 'react';
import { FlatList, Modal, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { dayCalories, type DayTarget } from '@ballistic/shared/calculations';
import type { FoodDiaryEntryRow, FoodRow, MealPlanEntryRow, MealSectionRow, NutritionFeedbackRow, RecipeWithIngredients } from '@ballistic/shared/data/types';
import { NO_TARGETS_YET, PLAN_BEING_SET_UP } from '@ballistic/shared/onboarding';
import { parseQuantity, quantityConfig, quantityProblem } from '@ballistic/shared/utils/foodQuantity';
import { MAX_UNIT_LABEL, countFromGrams, gramsFromCount, defaultUnit, parseUnitInput, startingAmount, unitForAmount, unitText, unitsFor, type FoodUnit } from '@ballistic/shared/utils/foodUnits';
import { entryMacros, formatQuantity, totalMacros } from '@ballistic/shared/utils/foodTotals';
import { perServing, scaleIngredients, validatePortions } from '@ballistic/shared/utils/mealPlan';
import { quickAddText, readQuickAdd, type QuickAddText } from '@ballistic/shared/utils/quickAdd';

import { Pressable } from '@/components/press';
import { Icon } from '@/components/icons';
import { ProgressRing } from '@/components/ProgressRing';
import { AppText, Button, Card, Chip, SheetFrame, SmallButton, TextField } from '@/components/ui';
import type { PendingScan } from '@/lib/barcodeFlow';
import { useAddFood, useAddFoods, useAddQuickAdd, useFavoriteFoods, useFoodSearch, useOwnFoodUnits, useRecentFoods, useToggleFavorite, type QuickAddFields } from '@/lib/food';
import { useDebounced } from '@/lib/hooks';
import { radius, spacing, useTheme } from '@/theme';

const kcal = (entry: FoodDiaryEntryRow) => Math.round(entryMacros(entry).calories);
const entryName = (e: FoodDiaryEntryRow) => e.food?.name ?? e.quick_add_name ?? 'Quick add';

// ---------- small pieces ----------
// What the coach wrote about this day's food. Nothing when there is none.
export function CoachFeedbackCard({ items }: { items: NutritionFeedbackRow[] }) {
  const t = useTheme();
  if (items.length === 0) return null;
  return (
    <Card style={{ gap: spacing.sm }}>
      <AppText variant="small" color="muted" style={{ fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8 }}>From your coach</AppText>
      {items.map((f) => (
        <View key={f.id} style={{ gap: 2, borderLeftWidth: 3, borderLeftColor: t.accent, paddingLeft: spacing.sm }}>
          {f.photo_id ? <AppText variant="small" color="muted">On a meal photo</AppText> : null}
          <AppText>{f.body}</AppText>
        </View>
      ))}
    </Card>
  );
}

// ---------- date navigation + totals ----------
// `ahead` is how many days past today food can be planned (1 = tomorrow).
export function DateNav({ date, today, ahead = 0, onChange }: { date: string; today: string; ahead?: number; onChange: (d: string) => void }) {
  const t = useTheme();
  const shift = (n: number) => {
    const d = new Date(date + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + n);
    onChange(d.toISOString().slice(0, 10));
  };
  const yesterday = (() => { const d = new Date(today + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() - 1); return d.toISOString().slice(0, 10); })();
  const last = (() => { const d = new Date(today + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + ahead); return d.toISOString().slice(0, 10); })();
  const label = date === today ? 'Today' : date === yesterday ? 'Yesterday' : ahead > 0 && date === last ? 'Tomorrow' : new Date(date + 'T00:00:00Z').toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
  // As on the web: plain chevrons either side of the day, no tiles.
  const arrow = { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' } as const;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
      <Pressable accessibilityRole="button" accessibilityLabel="Previous day" onPress={() => shift(-1)} style={arrow}><Icon name="chevronLeft" size={20} color={t.muted} /></Pressable>
      <Pressable onPress={() => date !== today && onChange(today)} style={{ alignItems: 'center' }}>
        <AppText variant="heading">{label}</AppText>
        {date !== today ? <AppText variant="small" color="accent">Back to today</AppText> : null}
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Next day" onPress={() => date < last && shift(1)} style={[arrow, { opacity: date < last ? 1 : 0.3 }]} disabled={date >= last}><Icon name="chevronRight" size={20} color={t.muted} /></Pressable>
    </View>
  );
}

// Ring colours, from the owner's "My coaching" mockup (the web uses the same four): teal, purple, amber, green.
export const RING_COLORS = { protein: '#a07aff', carbs: '#e8a020', fat: '#2ecc71' } as const;

type Macros = { calories: number; protein: number; carbs: number; fat: number };

function MacroRing({ label, unit, value, target, color }: { label: string; unit: string; value: number; target: number | null; color: string }) {
  const t = useTheme();
  return (
    <View style={{ flex: 1, alignItems: 'center', gap: 4 }}>
      <ProgressRing value={value} target={target ?? 0} size={64} strokeWidth={6} color={color} trackColor={t.border}>
        <AppText maxFontSizeMultiplier={1.2} style={{ fontSize: 12, fontWeight: '900' }}>{Math.round(value).toLocaleString('en-GB')}{unit}</AppText>
      </ProgressRing>
      <AppText maxFontSizeMultiplier={1.2} style={{ fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, color: t.muted }}>{label}</AppText>
      <AppText maxFontSizeMultiplier={1.2} style={{ fontSize: 11, color: t.muted }}>{target != null ? `of ${Math.round(target).toLocaleString('en-GB')}${unit}` : '—'}</AppText>
    </View>
  );
}

// The four rings from the web's "My coaching" overview: calories, protein, carbs and fats, each with what has been eaten and its daily target.
export function TargetRings({ totals, target }: { totals: Macros; target: DayTarget | null }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', gap: 8 }}>
      <MacroRing label="Calories" unit="" value={totals.calories} target={target?.calories ?? null} color={t.accent} />
      <MacroRing label="Protein" unit="g" value={totals.protein} target={target?.protein ?? null} color={RING_COLORS.protein} />
      <MacroRing label="Carbs" unit="g" value={totals.carbs} target={target?.carbs ?? null} color={RING_COLORS.carbs} />
      <MacroRing label="Fats" unit="g" value={totals.fat} target={target?.fat ?? null} color={RING_COLORS.fat} />
    </View>
  );
}

// The day's calories and macros against the target, as the web's "Today's targets" card. Give it the entries to add up, or the
// totals themselves (manual macro entry). `note` is the small grey text at the right of the title (the date).
export function TotalsCard({ entries, totals: given, target, held = false, title = "Today's targets", note }: { entries?: (FoodDiaryEntryRow | MealPlanEntryRow)[]; totals?: Macros; target: DayTarget | null; held?: boolean; title?: string; note?: string }) {
  const totals = given ?? totalMacros(entries ?? []);
  return (
    <Card style={{ gap: spacing.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: spacing.sm }}>
        <AppText style={{ fontWeight: '800' }}>{title}</AppText>
        {note ? <AppText variant="small" color="muted">{note}</AppText> : null}
      </View>
      <TargetRings totals={totals} target={target} />
      {!target && held ? <AppText variant="small" color="muted">{PLAN_BEING_SET_UP}. Your targets appear once they have been checked.</AppText> : null}
      {!target && !held ? <AppText variant="small" color="muted">{NO_TARGETS_YET}</AppText> : null}
    </Card>
  );
}

// "Wed, 14 Oct": the date at the right of the targets card.
export const shortDate = (iso: string) => new Date(iso + 'T00:00:00Z').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });

// ---------- diary sections ----------
// The web's "Add food" pair: a tinted pill with a search icon, and a round outlined barcode button beside it.
export function AddFoodButtons({ onAdd, onScan, scanLabel }: { onAdd: () => void; onScan: () => void; scanLabel: string }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <Pressable onPress={onAdd} accessibilityRole="button" accessibilityLabel="Add food" style={{ flex: 1, height: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 999, backgroundColor: t.accentSoft }}>
        <Icon name="search" size={16} color={t.accentText} />
        <AppText style={{ color: t.accentText, fontWeight: '700' }}>Add food</AppText>
      </Pressable>
      <Pressable onPress={onScan} accessibilityRole="button" accessibilityLabel={scanLabel} style={{ width: 52, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 999, borderWidth: 1, borderColor: t.border }}>
        <Icon name="barcode" size={18} color={t.chromeIcon} />
      </Pressable>
    </View>
  );
}

export function DiarySection({
  label, entries, onAdd, onScan, onEdit,
}: {
  label: string;
  entries: FoodDiaryEntryRow[];
  onAdd: () => void;
  onScan: () => void;
  onEdit: (e: FoodDiaryEntryRow) => void;
}) {
  const t = useTheme();
  const sectionKcal = Math.round(entries.reduce((s, e) => s + entryMacros(e).calories, 0));
  return (
    <Card style={{ gap: spacing.sm }}>
      {/* The meal's calories sit right beside its name, as on the web. */}
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
        <AppText variant="heading" style={{ flexShrink: 1 }}>{label}</AppText>
        <AppText variant="small" color="muted">{sectionKcal} kcal</AppText>
      </View>
      {entries.length === 0 ? <AppText variant="small" color="muted">Nothing logged yet.</AppText> : null}
      {entries.map((e) => (
        <Pressable key={e.id} onPress={() => onEdit(e)} accessibilityRole="button" style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, paddingVertical: 10, borderTopWidth: 1, borderTopColor: t.border }}>
          <View style={{ flexShrink: 1 }}>
            <AppText style={{ fontWeight: '600' }} numberOfLines={1}>{entryName(e)}</AppText>
            <AppText variant="small" color="muted">{e.food ? formatQuantity(e) : 'Quick add'}</AppText>
          </View>
          <AppText style={{ fontWeight: '600' }}>{kcal(e)} <AppText variant="small" color="muted">kcal</AppText></AppText>
        </Pressable>
      ))}
      <AddFoodButtons onAdd={onAdd} onScan={onScan} scanLabel={`Scan a barcode into ${label}`} />
    </Card>
  );
}

// ---------- sheets ----------
// Change how much of a food there is, or remove it.
// How much of a food, for the sheets that change an amount already chosen (an entry in the diary, the amount asked after a scan, a planned
// meal, a recipe ingredient). The same way as the Add food list: the food's own servings (and the member's) to pick from, and a number of
// them. `value` stays grams (or portions, for a food that is not per gram); the box only shows it in the unit chosen.
function ServingAmount({ food, value, onChange, autoFocus = false }: { food: FoodRow; value: number; onChange: (n: number) => void; autoFocus?: boolean }) {
  const cfg = quantityConfig(food);
  const own = useOwnFoodUnits();
  const units = cfg.perGram ? unitsFor(food, own.units) : [];
  // Opens on the serving the amount is a neat count of; the member's own choice takes over once they pick.
  const [opening] = useState(value);
  const [chosen, setChosen] = useState<string | null | undefined>(undefined);
  const unit = (chosen === undefined ? unitForAmount(units, opening) : units.find((u) => u.key === chosen)) ?? null;
  const [text, setText] = useState<string | null>(null);
  const shown = unit ? countFromGrams(value, unit) : value;
  return (
    <View style={{ gap: spacing.sm }}>
      {units.length > 0 ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          <Chip label="grams" active={unit == null} onPress={() => { setText(null); setChosen(null); }} />
          {units.map((u) => <Chip key={u.key} label={unitText(u)} active={unit?.key === u.key} onPress={() => { setText(null); setChosen(u.key); }} />)}
        </View>
      ) : null}
      <TextField
        label={unit ? `How many (${unit.label})` : `Quantity (${cfg.perGram ? 'grams' : food.portion ?? 'units'})`}
        value={text ?? String(shown)}
        onChangeText={(v) => {
          setText(v);
          const n = parseQuantity(v);
          onChange(unit ? gramsFromCount(n, unit) : n);
        }}
        onBlur={() => setText(null)}
        keyboardType="decimal-pad"
        autoFocus={autoFocus}
      />
      {unit ? <AppText variant="small" color="muted">= {Math.round(value * 10) / 10} g</AppText> : null}
    </View>
  );
}

export function EditEntrySheet({ entry, sections = [], onSave, onSaveQuick, onRemove, onRefile, onClose }: { entry: FoodDiaryEntryRow; sections?: MealSectionRow[]; onSave: (portions: number) => void; onSaveQuick?: (fields: QuickAddFields) => void; onRemove: () => void; onRefile?: (sectionId: string) => void; onClose: () => void }) {
  const cfg = entry.food ? quantityConfig(entry.food) : null;
  const [value, setValue] = useState(entry.portions);
  const problem = cfg ? quantityProblem(cfg.perGram, value) : null;
  return (
    <SheetFrame title={entryName(entry)} onClose={onClose}>
      {cfg ? (
        <View style={{ gap: spacing.md }}>
          <ServingAmount food={entry.food!} value={value} onChange={setValue} autoFocus />
          <AppText variant="small" color={problem ? 'danger' : 'muted'}>
            {problem ?? `${Math.round(dayCalories(entry.food!.protein * value, entry.food!.carbs * value, entry.food!.fat * value))} kcal · ${Math.round(entry.food!.protein * value)}P / ${Math.round(entry.food!.carbs * value)}C / ${Math.round(entry.food!.fat * value)}F`}
          </AppText>
          <Button title="Save" disabled={!!problem} onPress={() => onSave(value)} />
        </View>
      ) : onSaveQuick ? (
        <QuickAddForm initial={quickAddText(entry)} submitLabel="Save" onAdd={onSaveQuick} />
      ) : (
        <AppText color="muted">Quick add entries can only be removed. Add a new one to change it.</AppText>
      )}
      {/* An entry sitting in "Other" can be filed under one of the member's own sections. */}
      {onRefile && entry.meal_section_id === null && sections.length > 0 ? (
        <View style={{ gap: spacing.sm }}>
          <AppText variant="small" color="muted">File under</AppText>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {sections.map((s) => <Chip key={s.id} label={s.label} onPress={() => onRefile(s.id)} />)}
          </View>
        </View>
      ) : null}
      <Button title="Remove" variant="secondary" onPress={onRemove} />
    </SheetFrame>
  );
}

// ml-sized units (under 5 g each) preset and step in bigger counts than a rasher or a slice.
const isSmallUnit = (u: FoodUnit) => u.grams < 5;

function FoodResultRow({ food, selected, qty, onQty, onSelect, onAdd, isFavorite, onToggleFavorite, units, onSaveUnit, onDeleteUnit }: {
  food: FoodRow; selected: boolean; qty: number; onQty: (n: number) => void; onSelect: () => void; onAdd: () => void; isFavorite: boolean; onToggleFavorite: () => void;
  // Units for this food (built-in and the member's own) next to grams. What is added is always grams.
  units: FoodUnit[]; onSaveUnit: (foodId: string, label: string, grams: number) => Promise<string | null>; onDeleteUnit: (key: string) => void;
}) {
  const t = useTheme();
  const cfg = quantityConfig(food);
  const [text, setText] = useState<string | null>(null);
  // Starts on the food's own serving when the amount is exactly one of it.
  const [unitKey, setUnitKey] = useState<string | null>(() => {
    const stated = defaultUnit(units);
    return stated && qty === stated.grams ? stated.key : null;
  });
  const [adding, setAdding] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [newGrams, setNewGrams] = useState('');
  const [unitError, setUnitError] = useState<string | null>(null);
  const unit = units.find((u) => u.key === unitKey) ?? null;
  const small = unit ? isSmallUnit(unit) : false;
  // With a unit chosen the box counts that unit (2 rasher); qty stays grams for the caller.
  const shown = unit ? countFromGrams(qty, unit) : qty;
  const step = unit ? (small ? 10 : 0.5) : cfg.step;
  const presets = unit ? (small ? [100, 200, 250, 330] : [0.5, 1, 2, 3]) : cfg.perGram ? [] : cfg.presets;
  const setShown = (n: number) => onQty(unit ? gramsFromCount(Math.max(0, n), unit) : n);
  const cal = dayCalories(food.protein * qty, food.carbs * qty, food.fat * qty);
  const problem = quantityProblem(cfg.perGram, qty);

  const chooseUnit = (next: FoodUnit | null) => {
    setUnitKey(next?.key ?? null);
    setText(null);
    // Choosing a unit starts at one of it (250 ml for a millilitre unit); going back to grams keeps the weight as it is.
    if (next) onQty(gramsFromCount(isSmallUnit(next) ? 250 : 1, next));
  };
  const saveNewUnit = async () => {
    const parsed = parseUnitInput(newLabel, newGrams);
    if (!parsed.ok) return setUnitError(parsed.error);
    const failure = await onSaveUnit(food.id, parsed.label, parsed.grams);
    if (failure) return setUnitError(failure);
    setUnitError(null);
    setAdding(false);
    setNewLabel('');
    setNewGrams('');
  };

  return (
    <View style={{ paddingVertical: 8, borderTopWidth: 1, borderTopColor: t.border, gap: spacing.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        <Pressable onPress={onToggleFavorite} accessibilityLabel={isFavorite ? 'Remove favorite' : 'Add favorite'} hitSlop={10}>
          <Icon name="star" size={22} color={isFavorite ? t.warning : t.muted} fill={isFavorite ? t.warning : 'none'} />
        </Pressable>
        <Pressable onPress={onSelect} style={{ flex: 1 }} accessibilityRole="button">
          <AppText numberOfLines={2} style={{ fontWeight: '600' }}>{food.name}</AppText>
          <AppText variant="small" color="muted">
            {unit && !small
              ? `per ${unitText(unit)} · ${Math.round(dayCalories(food.protein * unit.grams, food.carbs * unit.grams, food.fat * unit.grams))} kcal`
              : cfg.perGram ? `per 100 g · ${Math.round(dayCalories(food.protein * 100, food.carbs * 100, food.fat * 100))} kcal` : `per ${food.portion}`}
          </AppText>
        </Pressable>
      </View>
      {selected ? (
        <View style={{ gap: spacing.sm }}>
          {cfg.perGram ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              <Chip label="grams" active={unit == null} onPress={() => chooseUnit(null)} />
              {units.map((u) => <Chip key={u.key} label={unitText(u)} active={unitKey === u.key} onPress={() => chooseUnit(u)} />)}
              <Chip label={adding ? 'Cancel' : '+ Own serving'} active={false} onPress={() => setAdding((v) => !v)} />
            </View>
          ) : null}
          {adding ? (
            <View style={{ gap: spacing.sm }}>
              <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                <View style={{ flex: 2 }}><TextField label="1 … (e.g. rasher)" value={newLabel} maxLength={MAX_UNIT_LABEL} onChangeText={(v) => { setNewLabel(v); setUnitError(null); }} /></View>
                <View style={{ flex: 1 }}><TextField label="= grams" value={newGrams} keyboardType="decimal-pad" onChangeText={(v) => { setNewGrams(v); setUnitError(null); }} /></View>
              </View>
              {unitError ? <AppText color="danger" style={{ fontWeight: '600' }}>{unitError}</AppText> : null}
              <SmallButton title="Save unit" onPress={saveNewUnit} />
            </View>
          ) : null}
          {unit?.own ? <SmallButton title={`Remove "${unit.label}"`} tone="muted" onPress={() => { onDeleteUnit(unit.key); setUnitKey(null); }} /> : null}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {presets.map((p) => <Chip key={p} label={unit ? `${p} ${unit.label}` : cfg.perGram ? `${p}g` : `${p}×`} active={shown === p} onPress={() => { setText(null); setShown(p); }} />)}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
            <SmallButton title="−" tone="muted" onPress={() => { setText(null); setShown(Math.max(0, shown - step)); }} />
            <View style={{ width: 90 }}><TextField label={unit ? unit.label : cfg.perGram ? 'Grams' : 'Quantity'} value={text ?? String(shown)} keyboardType="decimal-pad" onChangeText={(v) => { setText(v); setShown(parseQuantity(v)); }} onBlur={() => setText(null)} /></View>
            <SmallButton title="+" tone="muted" onPress={() => { setText(null); setShown(shown + step); }} />
          </View>
          <AppText variant="small" color={problem && qty > 0 ? 'danger' : 'muted'}>{problem && qty > 0 ? problem : `${unit ? `${Math.round(qty)} g · ` : ''}${Math.round(cal)} kcal · ${Math.round(food.protein * qty)}P / ${Math.round(food.carbs * qty)}C / ${Math.round(food.fat * qty)}F`}</AppText>
          <Button title="Add" disabled={!!problem} onPress={onAdd} />
        </View>
      ) : null}
    </View>
  );
}

export function QuickAddForm({ onAdd, initial, submitLabel = 'Add' }: { onAdd: (f: QuickAddFields) => void; initial?: QuickAddText; submitLabel?: string }) {
  const [vals, setVals] = useState<QuickAddText>(initial ?? { name: '', calories: '', protein: '', carbs: '', fat: '' });
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof QuickAddText) => (v: string) => {
    setVals((p) => ({ ...p, [k]: v }));
    setError(null);
  };
  function submit() {
    const result = readQuickAdd(vals);
    if ('error' in result) return setError(result.error);
    onAdd(result.fields);
  }
  return (
    <View style={{ gap: spacing.md }}>
      <AppText variant="small" color="muted">For something not in the food database: a restaurant meal, an estimate. Calories or macros, whatever you know.</AppText>
      <TextField label="What is it?" value={vals.name} onChangeText={set('name')} maxLength={100} />
      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        <View style={{ flex: 1 }}><TextField label="kcal" value={vals.calories} onChangeText={set('calories')} keyboardType="decimal-pad" /></View>
        <View style={{ flex: 1 }}><TextField label="Protein g" value={vals.protein} onChangeText={set('protein')} keyboardType="decimal-pad" /></View>
      </View>
      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        <View style={{ flex: 1 }}><TextField label="Carbs g" value={vals.carbs} onChangeText={set('carbs')} keyboardType="decimal-pad" /></View>
        <View style={{ flex: 1 }}><TextField label="Fat g" value={vals.fat} onChangeText={set('fat')} keyboardType="decimal-pad" /></View>
      </View>
      {error ? <AppText color="danger" style={{ fontWeight: '600' }}>{error}</AppText> : null}
      <Button title={submitLabel} onPress={submit} />
    </View>
  );
}

// Search, favourites and recently logged, with an amount picker on the food you tap. `onAdd` gets the food and the amount.
// Shared by the diary's Add food sheet, the recipe ingredient picker and the Meal Planner.
export function FoodSearchList({ onAdd }: { onAdd: (food: FoodRow, portions: number) => void }) {
  const [text, setText] = useState('');
  const q = useDebounced(text, 200);
  const search = useFoodSearch(q);
  const favorites = useFavoriteFoods();
  const recents = useRecentFoods();
  const toggleFavorite = useToggleFavorite();
  const own = useOwnFoodUnits();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [qtys, setQtys] = useState<Record<string, number>>({});

  const favoriteIds = new Set((favorites.data ?? []).map((f) => f.id));
  const searching = text.trim().length >= 2;
  const list: { title?: string; foods: FoodRow[] }[] = searching
    ? [{ foods: search.data ?? [] }]
    : [
        ...(favorites.data?.length ? [{ title: 'Favorites', foods: favorites.data }] : []),
        ...(recents.data?.length ? [{ title: 'Recently logged', foods: recents.data }] : []),
      ];

  const row = (food: FoodRow) => {
    const qty = qtys[food.id] ?? startingAmount(food);
    return (
      <FoodResultRow
        key={food.id}
        food={food}
        selected={selectedId === food.id}
        qty={qty}
        onQty={(n) => setQtys((p) => ({ ...p, [food.id]: n }))}
        onSelect={() => setSelectedId((cur) => (cur === food.id ? null : food.id))}
        onAdd={() => onAdd(food, qty)}
        isFavorite={favoriteIds.has(food.id)}
        onToggleFavorite={() => toggleFavorite.mutate({ food, isFavorite: !favoriteIds.has(food.id) })}
        units={unitsFor(food, own.units)}
        onSaveUnit={own.save}
        onDeleteUnit={own.remove}
      />
    );
  };

  return (
    <>
      <TextField label="Search foods" value={text} onChangeText={setText} placeholder="e.g. chicken breast" autoCorrect={false} autoCapitalize="none" returnKeyType="search" />
      <FlatList
        data={list}
        keyExtractor={(g, i) => g.title ?? 'results' + i}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item: group }) => (
          <View style={{ gap: 2, marginBottom: spacing.sm }}>
            {group.title ? <AppText variant="small" color="muted" style={{ fontWeight: '700' }}>{group.title}</AppText> : null}
            {group.foods.map(row)}
          </View>
        )}
        ListEmptyComponent={
          <AppText color="muted">
            {search.isFetching ? 'Searching…' : searching ? `No results for "${text.trim()}"` : text ? 'Keep typing…' : 'Start typing to search foods'}
          </AppText>
        }
      />
    </>
  );
}

// The saved recipes, each with a servings picker: logging or planning a recipe copies its ingredients, scaled.
export function RecipePickList({ recipes, onAdd }: { recipes: RecipeWithIngredients[]; onAdd: (recipe: RecipeWithIngredients, servings: number) => void }) {
  const t = useTheme();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [servings, setServings] = useState<Record<string, string>>({});
  if (recipes.length === 0) return <AppText color="muted">No recipes yet. Build one under Coach &gt; Recipes.</AppText>;
  return (
    <ScrollView keyboardShouldPersistTaps="handled">
      {recipes.map((r) => {
        const per = perServing(r);
        const text = servings[r.id] ?? '1';
        const n = parseQuantity(text);
        return (
          <View key={r.id} style={{ paddingVertical: 8, borderTopWidth: 1, borderTopColor: t.border, gap: spacing.sm }}>
            <Pressable onPress={() => setSelectedId((cur) => (cur === r.id ? null : r.id))} accessibilityRole="button">
              <AppText style={{ fontWeight: '600' }}>{r.name}</AppText>
              <AppText variant="small" color="muted">{r.recipe_ingredients.length ? `${Math.round(per.calories)} kcal per serving · makes ${r.servings}` : 'No ingredients yet'}</AppText>
            </Pressable>
            {selectedId === r.id ? (
              <View style={{ gap: spacing.sm }}>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                  {[0.5, 1, 2].map((p) => <Chip key={p} label={`${p}×`} active={n === p} onPress={() => setServings((s) => ({ ...s, [r.id]: String(p) }))} />)}
                </View>
                <View style={{ width: 120 }}><TextField label="Servings" value={text} keyboardType="decimal-pad" onChangeText={(v) => setServings((s) => ({ ...s, [r.id]: v }))} /></View>
                <Button title="Add" disabled={!(n > 0) || !r.recipe_ingredients.length} onPress={() => onAdd(r, n)} />
              </View>
            ) : null}
          </View>
        );
      })}
    </ScrollView>
  );
}

function SheetTabs<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[] }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', backgroundColor: t.cardMuted, borderRadius: radius.md, padding: 4 }}>
      {options.map((o) => (
        <Pressable key={o.value} onPress={() => onChange(o.value)} accessibilityRole="button" accessibilityState={{ selected: value === o.value }} style={{ flex: 1, paddingVertical: 8, borderRadius: radius.md - 4, backgroundColor: value === o.value ? t.card : 'transparent', alignItems: 'center' }}>
          <AppText variant="small" style={{ fontWeight: '700', color: value === o.value ? t.foreground : t.muted }}>{o.label}</AppText>
        </Pressable>
      ))}
    </View>
  );
}

// The "Add food" sheet: search, favourites, recently logged, saved recipes and Quick Add. Adding closes the sheet.
export function AddFoodSheet({ section, date, onClose, recipes = [] }: { section: { id: string | null; label: string }; date: string; onClose: () => void; recipes?: RecipeWithIngredients[] }) {
  const [tab, setTab] = useState<'search' | 'recipes' | 'quick'>('search');
  const addFood = useAddFood(date);
  const addFoods = useAddFoods(date);
  const addQuick = useAddQuickAdd(date);
  const tabs = [
    { value: 'search' as const, label: 'Search' },
    ...(recipes.length ? [{ value: 'recipes' as const, label: 'Recipes' }] : []),
    { value: 'quick' as const, label: 'Quick add' },
  ];
  return (
    <SheetFrame title={`Add food · ${section.label}`} onClose={onClose}>
      <SheetTabs value={tab} onChange={setTab} options={tabs} />
      {tab === 'quick' ? (
        <ScrollView keyboardShouldPersistTaps="handled">
          <QuickAddForm onAdd={(fields) => { addQuick.mutate({ fields, sectionId: section.id }); onClose(); }} />
        </ScrollView>
      ) : tab === 'recipes' ? (
        <RecipePickList
          recipes={recipes}
          onAdd={(recipe, servings) => {
            const items = scaleIngredients(recipe.recipe_ingredients, servings, recipe.servings)
              .map((i) => ({ food: recipe.recipe_ingredients.find((r) => r.food_id === i.food_id)?.food, portions: i.portions, sectionId: section.id }))
              .filter((i): i is { food: FoodRow; portions: number; sectionId: string | null } => !!i.food);
            addFoods.mutate({ items });
            onClose();
          }}
        />
      ) : (
        <FoodSearchList onAdd={(food, portions) => { addFood.mutate({ food, portions, sectionId: section.id }); onClose(); }} />
      )}
    </SheetFrame>
  );
}

// Pick a food (or a saved recipe) and an amount for somewhere other than the diary: a recipe's ingredients or a planned meal.
export function FoodPickerSheet({
  title,
  onClose,
  onAddFood,
  recipes,
  onAddRecipe,
}: {
  title: string;
  onClose: () => void;
  onAddFood: (food: FoodRow, portions: number) => void;
  recipes?: RecipeWithIngredients[];
  onAddRecipe?: (recipe: RecipeWithIngredients, servings: number) => void;
}) {
  const [tab, setTab] = useState<'search' | 'recipes'>('search');
  return (
    <SheetFrame title={title} onClose={onClose}>
      {onAddRecipe ? <SheetTabs value={tab} onChange={setTab} options={[{ value: 'search', label: 'Search' }, { value: 'recipes', label: 'Recipes' }]} /> : null}
      {tab === 'recipes' && onAddRecipe ? (
        <RecipePickList recipes={recipes ?? []} onAdd={(r, n) => { onAddRecipe(r, n); onClose(); }} />
      ) : (
        <FoodSearchList onAdd={(food, portions) => { onAddFood(food, portions); onClose(); }} />
      )}
    </SheetFrame>
  );
}

// Change how much of a food there is (a recipe ingredient or a planned meal), or remove it.
export function QuantitySheet({ title, food, initial, saveLabel = 'Save', onSave, onRemove, onClose }: { title: string; food: FoodRow | null; initial: number; saveLabel?: string; onSave: (portions: number) => void; onRemove?: () => void; onClose: () => void }) {
  const cfg = food ? quantityConfig(food) : null;
  const [value, setValue] = useState(initial);
  const problem = cfg ? quantityProblem(cfg.perGram, value) : validatePortions(value);
  return (
    <SheetFrame title={title} onClose={onClose}>
      {cfg && food ? (
        <View style={{ gap: spacing.md }}>
          <ServingAmount food={food} value={value} onChange={setValue} autoFocus />
          <AppText variant="small" color={problem ? 'danger' : 'muted'}>
            {problem ?? `${Math.round(dayCalories(food.protein * value, food.carbs * value, food.fat * value))} kcal · ${Math.round(food.protein * value)}P / ${Math.round(food.carbs * value)}C / ${Math.round(food.fat * value)}F`}
          </AppText>
          <Button title={saveLabel} disabled={!!problem} onPress={() => onSave(value)} />
        </View>
      ) : null}
      {onRemove ? <Button title="Remove" variant="secondary" onPress={onRemove} /> : null}
    </SheetFrame>
  );
}

// After a barcode scan: ask how much before the food is added (FT7). Opens with the pack's serving size when it has one, else 100 g.
export function ScanAmountSheet({ scan }: { scan: { confirming: { food: FoodRow; amount: number } | null; confirmAmount: (amount: number) => void; cancelConfirm: () => void } }) {
  const c = scan.confirming;
  if (!c) return null;
  return <QuantitySheet title={c.food.name} food={c.food} initial={c.amount} saveLabel="Add" onSave={scan.confirmAmount} onClose={scan.cancelConfirm} />;
}

// ---------- barcode ----------
export function ScannerSheet({ onDetected, onClose }: { onDetected: (barcode: string) => void; onClose: () => void }) {
  const t = useTheme();
  const [permission, requestPermission] = useCameraPermissions();
  const [torch, setTorch] = useState(false);
  const [done, setDone] = useState(false);
  const [manual, setManual] = useState('');
  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: '#000' }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: spacing.md }}>
          <AppText variant="heading" style={{ color: '#fff' }}>Scan a barcode</AppText>
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <SmallButton title={torch ? 'Torch off' : 'Torch'} tone="muted" onPress={() => setTorch((v) => !v)} />
            <SmallButton title="Close" tone="muted" onPress={onClose} />
          </View>
        </View>
        <View style={{ flex: 1, justifyContent: 'center' }}>
          {!permission ? null : !permission.granted ? (
            <View style={{ padding: spacing.md, gap: spacing.md }}>
              <AppText style={{ color: '#fff' }}>Allow camera access to scan barcodes, or enter the number below.</AppText>
              <Button title="Allow camera" onPress={requestPermission} />
            </View>
          ) : (
            <CameraView
              style={{ flex: 1 }}
              facing="back"
              enableTorch={torch}
              barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e'] }}
              onBarcodeScanned={(r) => {
                if (done) return;
                setDone(true);
                onDetected(r.data);
              }}
            />
          )}
        </View>
        <View style={{ padding: spacing.md, gap: spacing.sm, backgroundColor: t.background }}>
          <TextField label="Can't scan it? Enter the barcode number" value={manual} onChangeText={setManual} keyboardType="number-pad" />
          <Button title="Look up" disabled={!manual.trim()} onPress={() => onDetected(manual.trim())} />
        </View>
      </SafeAreaView>
    </Modal>
  );
}

// Open Food Facts had the product but not every nutrient: ask for what is missing (per 100 g, as printed on the pack).
export function CompleteScanSheet({ pending, onCancel, onSave }: { pending: PendingScan; onCancel: () => void; onSave: (per100: { protein: number; carbs: number; fat: number }) => void }) {
  const toText = (v: number | null) => (v != null ? String(Math.round(v * 100 * 10) / 10) : '');
  const [protein, setProtein] = useState(toText(pending.protein));
  const [carbs, setCarbs] = useState(toText(pending.carbs));
  const [fat, setFat] = useState(toText(pending.fat));
  const ready = protein !== '' && carbs !== '' && fat !== '';
  return (
    <SheetFrame title={pending.name} onClose={onCancel}>
      <AppText color="muted">Found on Open Food Facts, but missing some nutrition info. Fill in the rest (per 100 g) to save it.</AppText>
      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        <View style={{ flex: 1 }}><TextField label="Protein g" value={protein} onChangeText={setProtein} keyboardType="decimal-pad" /></View>
        <View style={{ flex: 1 }}><TextField label="Carbs g" value={carbs} onChangeText={setCarbs} keyboardType="decimal-pad" /></View>
        <View style={{ flex: 1 }}><TextField label="Fat g" value={fat} onChangeText={setFat} keyboardType="decimal-pad" /></View>
      </View>
      <Button title="Save & add" disabled={!ready} onPress={() => onSave({ protein: parseQuantity(protein), carbs: parseQuantity(carbs), fat: parseQuantity(fat) })} />
    </SheetFrame>
  );
}

export type { MealSectionRow };
