import { useState } from 'react';
import { View } from 'react-native';

import type { WorkoutProgramDayRow, WorkoutProgramRow } from '@ballistic/shared/data/types';
import { resolveActiveProgram } from '@ballistic/shared/utils/checkin';
import { isoDateInTz } from '@ballistic/shared/utils/dates';
import { daysForWeek, summariseDays, weekNumbers } from '@ballistic/shared/utils/programOverview';
import { chosenBlockKeys } from '@ballistic/shared/workoutSections';

import { DayCard, RecordMaxSheet, WeekPills } from '@/components/workouts';
import { TrainingTabs } from '@/components/pagetabs';
import { CardsSkeleton } from '@/components/skeleton';
import { AppText, Button, Card, Screen, ScrollScreen } from '@/components/ui';
import { timezoneOf, useClientProfile, useNow } from '@/lib/today';
import { useExerciseLibrary, useProgramOverview, useRecordMax } from '@/lib/workouts';
import { spacing, useTheme } from '@/theme';

const prettyDate = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });

export default function Workouts() {
  const t = useTheme();
  const now = useNow(60_000);
  const profileQ = useClientProfile();
  const profile = profileQ.data ?? null;
  const todayIso = isoDateInTz(now, timezoneOf(profile));
  const todayDow = new Date(`${todayIso}T00:00:00Z`).getUTCDay();

  const overviewQ = useProgramOverview(todayIso, !!profile);
  const [pickedWeek, setPickedWeek] = useState<number | null>(null);
  const [maxOpen, setMaxOpen] = useState(false);
  const [maxNote, setMaxNote] = useState<string | null>(null);
  const libraryQ = useExerciseLibrary(maxOpen);
  const recordMax = useRecordMax();

  if (profileQ.isPending || overviewQ.isPending) return <CardsSkeleton rows={4} height={96} />;
  if (profileQ.isError || overviewQ.isError) {
    return (
      <Screen style={{ justifyContent: 'center', gap: spacing.md }}>
        <AppText color="danger">Could not load your workouts.</AppText>
        <Button title="Try again" onPress={() => { profileQ.refetch(); overviewQ.refetch(); }} />
      </Screen>
    );
  }

  const o = overviewQ.data;
  const current = o.current;
  if (!current) {
    return (
      <ScrollScreen>
        <TrainingTabs current="workouts" />
        <AppText variant="heading">{o.upcoming.length ? 'Your next programme is on its way' : 'No workout programme yet'}</AppText>
        <AppText color="muted">
          {o.upcoming.length ? `${o.upcoming[0].name} starts ${prettyDate(o.upcoming[0].start_date ?? todayIso)}.` : "Your coach hasn't built your programme yet. It will show up here once they do."}
        </AppText>
      </ScrollScreen>
    );
  }

  // Which programme week is current (null once the block has finished).
  const active = resolveActiveProgram(
    [{ id: current.id, start_date: current.start_date, workout_program_days: o.days } as unknown as WorkoutProgramRow],
    todayIso,
  );
  const currentWeek = active?.weekNum ?? null;

  const choiceByDay = new Map<string, { slot1: string | null; slot2: string | null }>();
  for (const c of o.choices) {
    const cur = choiceByDay.get(c.program_day_id) ?? { slot1: null, slot2: null };
    if (c.slot === 1) cur.slot1 = c.block_key; else cur.slot2 = c.block_key;
    choiceByDay.set(c.program_day_id, cur);
  }
  const summaries = summariseDays(
    o.days as WorkoutProgramDayRow[],
    new Map(Object.entries(o.exercisesByDay)),
    new Set(o.loggedExerciseIds),
    (dayId) => { const c = choiceByDay.get(dayId); return chosenBlockKeys(c?.slot1 ?? null, c?.slot2 ?? null); },
    todayDow,
    currentWeek ?? -1,
  );
  const weeks = weekNumbers(summaries);
  const wanted = pickedWeek ?? currentWeek ?? weeks[0] ?? 1;
  const shownWeek = weeks.includes(wanted) ? wanted : weeks[0] ?? 1;
  const shownDays = daysForWeek(summaries, shownWeek);

  return (
    <>
      <ScrollScreen refreshing={overviewQ.isRefetching} onRefresh={() => overviewQ.refetch()}>
        <TrainingTabs current="workouts" />
        <View style={{ gap: 2 }}>
          <AppText variant="title">{current.name}</AppText>
          <AppText color="muted">
            {currentWeek ? `Week ${currentWeek} of ${current.totalWeeks}` : current.totalWeeks > 0 ? 'This block has finished.' : 'No workouts in this programme yet.'}
          </AppText>
        </View>

        {o.upcoming.length ? (
          <View style={{ backgroundColor: t.accentSoft, borderRadius: 16, padding: spacing.md }}>
            {o.upcoming.map((u) => <AppText key={u.id} color="accent" style={{ fontWeight: '600' }}>Next: {u.name} starts {prettyDate(u.start_date ?? todayIso)}</AppText>)}
          </View>
        ) : null}

        {weeks.length ? (
          <>
            <WeekPills weeks={weeks} active={shownWeek} current={currentWeek} onChange={setPickedWeek} />
            <View style={{ gap: spacing.sm }}>
              {shownDays.map((d) => <DayCard key={d.id} day={d} />)}
              {shownDays.length === 0 ? <AppText color="muted">No workouts in this week.</AppText> : null}
            </View>
          </>
        ) : null}

        {maxNote ? <AppText color="success" style={{ fontWeight: '600' }}>{maxNote}</AppText> : null}
        <Card style={{ gap: spacing.sm }}>
          <AppText variant="heading">Tested maxes</AppText>
          <AppText variant="small" color="muted">Record a max so your percentage-based exercises show a target weight.</AppText>
          <Button title="Record a tested max" variant="secondary" onPress={() => { setMaxNote(null); recordMax.reset(); setMaxOpen(true); }} />
        </Card>
      </ScrollScreen>

      {maxOpen ? (
        <RecordMaxSheet
          library={libraryQ.data ?? []}
          saving={recordMax.isPending}
          error={recordMax.error?.message ?? null}
          onClose={() => setMaxOpen(false)}
          onSave={(v) => recordMax.mutate(v, { onSuccess: () => { setMaxOpen(false); setMaxNote('Tested max recorded.'); } })}
        />
      ) : null}
    </>
  );
}
