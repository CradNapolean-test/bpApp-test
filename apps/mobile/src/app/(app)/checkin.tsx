import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';

import { CALORIE_FLOOR, cycleDayFor, weeklyTarget } from '@ballistic/shared/calculations';
import { isMetricOn } from '@ballistic/shared/utils/checkinMetrics';
import { canBrowseWeek, canEditDay, LOCKED_DAY_MESSAGE } from '@ballistic/shared/utils/dayPatch';
import { dayCaloriesOf } from '@ballistic/shared/utils/dailyLog';
import { toMemberEngineProfile } from '@ballistic/shared/utils/clientProfile';
import { dayTargetFor } from '@ballistic/shared/utils/dayTarget';
import { normalizeGender } from '@ballistic/shared/utils/personalDetails';
import { blankDailyLog, datesOfWeek, SCALE_FIELDS, shiftWeek, validateDayPatch, weekAverages, weekOffset, weekStartOf, LOG_LIMITS, type DayPatch } from '@ballistic/shared/utils/weeklyLog';

import { AutoSaveInput, AvgCard, DayStrip, MoodDots, TrackerCard, WeekHeader } from '@/components/checkin';
import { Icon } from '@/components/icons';
import { CheckinTabs } from '@/components/pagetabs';
import { AppText, Button, Card, Screen, ScrollScreen } from '@/components/ui';
import { useDayContext } from '@/lib/day';
import { useDisabledMetrics, useScreenAccess } from '@/lib/screens';
import { useAttendedSessions, usePeriodStarts, useSaveDay, useWeekLogs } from '@/lib/weeklyLog';
import { spacing, useTheme } from '@/theme';

const dayMonth = (iso: string) => new Date(iso + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const fmt = (v: number | null, digits = 0) => (v == null ? '—' : digits ? v.toFixed(digits) : Math.round(v).toLocaleString('en-GB'));

// The daily check-in (the web's "Weekly Log"): pick a week and a day, then sleep, steps, water, bodyweight, how you feel,
// whether you trained, and notes. Every change saves on its own, and only the field you changed.
export default function Checkin() {
  const t = useTheme();
  const { profileQ } = useDayContext();
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
        <AppText color="danger">Could not load your profile: {profileQ.error.message}</AppText>
        <Button title="Try again" onPress={() => profileQ.refetch()} />
      </Screen>
    );
  }
  return <CheckinContent />;
}

function CheckinContent() {
  const t = useTheme();
  const router = useRouter();
  const { areas } = useScreenAccess();
  const disabledMetrics = useDisabledMetrics(); // what this member's coach has switched off (0121)
  const { profile, profileQ, todayIso, programWeek } = useDayContext();

  const currentWeek = weekStartOf(todayIso);
  const [pickedWeek, setPickedWeek] = useState<string | null>(null);
  const weekStart = pickedWeek ?? currentWeek;
  const offset = weekOffset(currentWeek, weekStart);
  const dates = datesOfWeek(weekStart);
  const [pickedDay, setPickedDay] = useState<string | null>(null);
  const focused = pickedDay && dates.includes(pickedDay) ? pickedDay : dates.includes(todayIso) ? todayIso : dates[0];
  // Members can change the last 14 days and open the last 30; older days are the coach's to change (D20, web dayPatch).
  const editable = canEditDay(focused, todayIso);

  const weekQ = useWeekLogs(weekStart);
  const attendedQ = useAttendedSessions(weekStart);
  const female = normalizeGender(profile?.gender) === 'Female';
  const periodQ = usePeriodStarts(female);
  const save = useSaveDay();

  const logs = weekQ.data ?? [];
  const row = logs.find((l) => l.log_date === focused) ?? blankDailyLog('', focused);
  const mode = profile?.nutrition_tracking_mode ?? 'full_tracking';
  const isPhoto = mode === 'photo_diary';
  const attendedToday = (attendedQ.data ?? []).find((a) => a.date === focused) ?? null;
  const gymOn = row.gym_session || attendedToday != null;

  const weekTarget = useMemo(() => {
    const engine = toMemberEngineProfile(profile, false); // none while the plan waits for the coach (M8, D6)
    return engine ? weeklyTarget(engine, programWeek) : null;
  }, [profile, programWeek]);
  const dayTarget = dayTargetFor(weekTarget, row.day_type);
  const calories = dayCaloriesOf(row); // includes Quick Adds with no macros (R11)
  const periodDates = [...(periodQ.data ?? []), ...logs.filter((l) => l.period_started).map((l) => l.log_date)];
  const cycleDay = female ? cycleDayFor(periodDates, focused) : null;
  // Food planned for tomorrow is not eaten yet, so it is left out of the averages until it is today.
  const avgs = weekAverages(dates.map((d) => (d > todayIso ? blankDailyLog('', d) : logs.find((l) => l.log_date === d) ?? blankDailyLog('', d))));

  const [problem, setProblem] = useState<string | null>(null);

  function commit(patch: DayPatch) {
    if (!editable) return setProblem(LOCKED_DAY_MESSAGE);
    const bad = validateDayPatch(patch);
    setProblem(bad);
    if (bad) return;
    save.mutate({ date: focused, patch });
  }
  // The typed boxes (bodyweight, notes) save themselves (see AutoSaveInput); these turn the text into the saved value.
  function saveBodyweight(text: string) {
    const clean = text.trim().replace(',', '.');
    const next = clean === '' ? null : Number(clean);
    if (next !== null && !Number.isFinite(next)) return setProblem('Bodyweight should be a number.');
    if (next !== row.bodyweight) commit({ bodyweight: next });
  }
  function saveNotes(text: string) {
    const next = text.trim() === '' ? null : text;
    if (next !== row.notes) commit({ notes: next });
  }

  const [refreshing, setRefreshing] = useState(false);
  async function refresh() {
    setRefreshing(true);
    await Promise.all([weekQ.refetch(), attendedQ.refetch(), profileQ.refetch()]);
    setRefreshing(false);
  }

  const weekTitle = offset === 0 ? 'This week' : offset === -1 ? 'Last week' : `Week of ${dayMonth(weekStart)}`;
  const focusedDate = new Date(focused + 'T00:00:00Z');
  const sectionLabel = { fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8 } as const;

  return (
    <ScrollScreen refreshing={refreshing} onRefresh={refresh}>
      <CheckinTabs current="checkin" />
      <WeekHeader
        title={weekTitle}
        range={`${dayMonth(dates[0])} to ${dayMonth(dates[6])}`}
        canGoBack={canBrowseWeek(shiftWeek(weekStart, -1), todayIso)}
        canGoForward={offset < 0}
        onBack={() => setPickedWeek(shiftWeek(weekStart, -1))}
        onForward={() => setPickedWeek(shiftWeek(weekStart, 1))}
      />

      <Card style={{ flexDirection: 'row', gap: spacing.md }}>
        {isPhoto ? (
          <>
            {isMetricOn(disabledMetrics, 'steps') ? <AvgCard value={fmt(avgs.steps)} label="avg steps" /> : null}
            <AvgCard value={fmt(avgs.bodyweight, 1)} unit={avgs.bodyweight != null ? 'kg' : undefined} label="avg bodyweight" />
          </>
        ) : (
          <>
            <AvgCard value={fmt(avgs.calories)} label="avg kcal" />
            <AvgCard value={fmt(avgs.protein)} unit={avgs.protein != null ? 'g' : undefined} label="avg protein" />
            {isMetricOn(disabledMetrics, 'steps') ? <AvgCard value={fmt(avgs.steps)} label="avg steps" /> : null}
          </>
        )}
      </Card>
      {!isPhoto ? (
        <AppText variant="small" color="muted" style={{ marginTop: -spacing.sm }}>
          {avgs.foodDays} day{avgs.foodDays === 1 ? '' : 's'} of food logged this week · avg carbs {fmt(avgs.carbs)}{avgs.carbs != null ? 'g' : ''} · avg fat {fmt(avgs.fat)}{avgs.fat != null ? 'g' : ''} · avg bodyweight {fmt(avgs.bodyweight, 1)}{avgs.bodyweight != null ? 'kg' : ''}
        </AppText>
      ) : null}

      <DayStrip dates={dates} focused={focused} logs={logs} onSelect={setPickedDay} />

      {weekQ.isPending ? <ActivityIndicator color={t.accent} /> : null}
      {weekQ.isError ? <AppText color="danger">Could not load this week: {weekQ.error.message}</AppText> : null}

      <View style={{ gap: spacing.md }}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
          <AppText variant="heading">{focusedDate.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'UTC' })}</AppText>
          <AppText variant="small" color="muted">
            {!isPhoto && calories > 0 ? `${Math.round(calories)} kcal` : ''}
            {cycleDay ? ` · cycle day ${cycleDay}` : ''}
          </AppText>
        </View>
        {!isPhoto && calories > 0 && calories < CALORIE_FLOOR && focused < todayIso ? (
          <AppText variant="small" color="warning" style={{ marginTop: -spacing.sm }}>Below {CALORIE_FLOOR} kcal — worth a coach review.</AppText>
        ) : null}
        {!isPhoto && dayTarget ? (
          <AppText variant="small" color="muted" style={{ marginTop: -spacing.sm }}>
            {Math.round(calories)} / {Math.round(dayTarget.calories)} kcal · {Math.round(row.protein ?? 0)} / {Math.round(dayTarget.protein)}g protein
          </AppText>
        ) : null}

        {!editable ? <AppText variant="small" color="warning" style={{ fontWeight: '600' }}>{LOCKED_DAY_MESSAGE}</AppText> : null}
        <View pointerEvents={editable ? 'auto' : 'none'} style={{ gap: spacing.md, opacity: editable ? 1 : 0.55 }}>
        {(['sleep', 'steps', 'water'] as const).filter((m) => isMetricOn(disabledMetrics, m)).map((metric) => (
          <TrackerCard key={`${focused}-${metric}`} metric={metric} value={row[metric]} onCommit={(v) => commit({ [metric]: v } as DayPatch)} />
        ))}
        </View>

        {isPhoto ? (
          <View style={{ backgroundColor: t.cardMuted, borderRadius: 14, padding: 12, gap: 4 }}>
            <AppText variant="small" color="muted" style={sectionLabel}>Food · photo diary</AppText>
            <AppText variant="small" color="muted">Your coach looks through your meal photos.</AppText>
            <Pressable onPress={() => router.navigate('/food')} accessibilityRole="button"><AppText variant="small" color="accent" style={{ fontWeight: '700' }}>Open photo diary →</AppText></Pressable>
          </View>
        ) : (
          <View style={{ backgroundColor: t.cardMuted, borderRadius: 14, padding: 12, gap: 8 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <AppText variant="small" color="muted" style={sectionLabel}>Food · {mode === 'manual_import' ? 'your totals' : 'from your diary'}</AppText>
              {areas.food ? (
                <Pressable onPress={() => router.navigate('/food')} accessibilityRole="button"><AppText variant="small" color="accent" style={{ fontWeight: '700' }}>Open food diary →</AppText></Pressable>
              ) : null}
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              {([['kcal', calories > 0 ? Math.round(calories) : row.protein != null || row.carbs != null || row.fat != null ? 0 : null], ['Protein', row.protein], ['Carbs', row.carbs], ['Fat', row.fat], ...(mode === 'manual_import' ? [] : [['Fibre', row.fibre]])] as [string, number | null][]).map(([label, value]) => (
                <View key={label} style={{ alignItems: 'center', flex: 1 }}>
                  <AppText style={{ fontWeight: '900', fontSize: 16 }}>
                    {value == null ? '—' : Math.round(value)}
                    {value != null && label !== 'kcal' ? <AppText color="muted" style={{ fontSize: 11, fontWeight: '700' }}>g</AppText> : null}
                  </AppText>
                  <AppText color="muted" style={{ fontSize: 11, textTransform: 'uppercase' }}>{label}</AppText>
                </View>
              ))}
            </View>
            {mode !== 'manual_import' ? <AppText color="muted" style={{ fontSize: 11 }}>Fibre counts the foods that have a fibre figure.</AppText> : null}
          </View>
        )}

        <View pointerEvents={editable ? 'auto' : 'none'} style={{ gap: spacing.md, opacity: editable ? 1 : 0.55 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, backgroundColor: t.card, borderWidth: 1, borderColor: t.border, borderRadius: 999, paddingHorizontal: 22, height: 64 }}>
          <AppText style={{ fontWeight: '800' }}>Bodyweight</AppText>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
            <AutoSaveInput
              key={`bw-${focused}`}
              accessibilityLabel="Bodyweight in kilograms"
              placeholder="—"
              placeholderTextColor={t.muted}
              keyboardType="decimal-pad"
              display={row.bodyweight != null ? String(row.bodyweight) : ''}
              editText={row.bodyweight != null ? String(row.bodyweight) : ''}
              onSave={saveBodyweight}
              maxLength={6}
              selectTextOnFocus
              style={{ minWidth: 80, textAlign: 'right', color: t.foreground, fontSize: 28, fontWeight: '900', padding: 0 }}
            />
            <AppText color="muted" style={{ fontWeight: '700' }}>kg</AppText>
          </View>
        </View>

        {SCALE_FIELDS.some(({ key }) => isMetricOn(disabledMetrics, key)) ? (
        <View style={{ gap: 10 }}>
          <AppText variant="small" color="muted" style={sectionLabel}>How are you feeling? <AppText variant="small" color="muted" style={{ textTransform: 'none', letterSpacing: 0, fontWeight: '500' }}>1 = low, 5 = high</AppText></AppText>
          {SCALE_FIELDS.filter(({ key }) => isMetricOn(disabledMetrics, key)).map(({ key, label }) => (
            <MoodDots key={`${focused}-${key}`} label={label} value={row[key]} onChange={(n) => commit({ [key]: n } as DayPatch)} />
          ))}
        </View>
        ) : null}

        <Pressable
          onPress={() => commit({ gym_session: !row.gym_session })}
          disabled={attendedToday != null}
          accessibilityRole="button"
          accessibilityState={{ selected: gymOn, disabled: attendedToday != null }}
          aria-pressed={gymOn}
          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, borderRadius: 999, paddingHorizontal: 22, height: 64, backgroundColor: gymOn ? t.accent : t.card, borderWidth: gymOn ? 0 : 1, borderColor: t.border }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flexShrink: 1 }}>
            <Icon name="dumbbell" size={24} color={gymOn ? t.accentForeground : t.foreground} />
            <View style={{ flexShrink: 1 }}>
              <AppText style={{ fontWeight: '800', color: gymOn ? t.accentForeground : t.foreground }}>Gym session</AppText>
              <AppText variant="small" style={{ color: gymOn ? t.accentForeground : t.muted, opacity: gymOn ? 0.85 : 1 }}>
                {attendedToday != null ? `From your booking · ${attendedToday.label}` : gymOn ? 'Logged for today' : 'Tap if you trained'}
              </AppText>
            </View>
          </View>
          {gymOn ? <Icon name="check" size={24} color={t.accentForeground} strokeWidth={3} /> : null}
        </Pressable>

        {female ? (
          <Pressable onPress={() => commit({ period_started: !row.period_started })} accessibilityRole="checkbox" accessibilityState={{ checked: row.period_started }} aria-checked={row.period_started} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={{ width: 24, height: 24, borderRadius: 7, borderWidth: 2, borderColor: row.period_started ? t.accent : t.border, backgroundColor: row.period_started ? t.accent : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
              {row.period_started ? <Icon name="check" size={16} color={t.accentForeground} strokeWidth={3} /> : null}
            </View>
            <AppText>Period started</AppText>
          </Pressable>
        ) : null}

        <View style={{ gap: 6 }}>
          <AppText variant="small" color="muted" style={sectionLabel}>Notes</AppText>
          <AutoSaveInput
            key={`notes-${focused}`}
            accessibilityLabel="Notes for this day"
            multiline
            display={row.notes ?? ''}
            editText={row.notes ?? ''}
            onSave={saveNotes}
            delay={1200}
            maxLength={LOG_LIMITS.notesMax}
            placeholder="Anything worth remembering about today"
            placeholderTextColor={t.muted}
            style={{ backgroundColor: t.card, color: t.foreground, borderWidth: 1, borderColor: t.border, borderRadius: 12, paddingHorizontal: spacing.md, paddingVertical: 12, minHeight: 84, textAlignVertical: 'top', fontSize: 16 }}
          />
        </View>

        </View>

        {problem ? <AppText color="danger">{problem}</AppText> : null}
        <AppText variant="small" color="muted">{save.isPending ? 'Saving…' : save.isSuccess ? 'Saved ✓' : 'Changes save as you make them.'}</AppText>
      </View>
    </ScrollScreen>
  );
}
