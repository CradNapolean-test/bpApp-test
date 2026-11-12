import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

import type {
  BookingRow,
  ClientMembershipRow,
  ClientProfileRow,
  DailyLogRow,
  WorkoutExerciseRow,
  WorkoutProgramDayRow,
  WorkoutProgramRow,
} from '@ballistic/shared/data/types';
import { MEMBER_PROFILE_SELECT } from '@ballistic/shared/data/clientProfileColumns';
import { resolveActiveProgram, resolveProgramDayByPosition } from '@ballistic/shared/utils/checkin';
import { pickCurrentProgram } from '@ballistic/shared/utils/currentProgram';
import { memberProgrammeNotice, programmeEnd, type ProgrammeNotice } from '@ballistic/shared/utils/programEnding';
import { addDays, DEFAULT_TIMEZONE, isoDateInTz, toIsoDate } from '@ballistic/shared/utils/dates';

import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';

// Same window the web dashboard uses for streaks and the programme-week calculation.
export const HISTORY_DAYS = 84;

function useUserId() {
  const { session } = useSession();
  const id = session?.user.id;
  if (!id) throw new Error('Signed-in screens need a session');
  return id;
}

// Re-render on an interval so "today" and the check-in window stay right without leaving the screen. It also moves on the moment the app
// comes back to the foreground: a phone's timers pause while it sleeps, so a member opening the app the next morning saw yesterday as
// "Today" (with yesterday's food) until the next tick, and anything added in that gap went on yesterday.
export function useNow(everyMs = 15_000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), everyMs);
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') setNow(new Date());
    });
    return () => {
      clearInterval(id);
      sub.remove();
    };
  }, [everyMs]);
  return now;
}

export function timezoneOf(profile: ClientProfileRow | null | undefined) {
  return profile?.timezone ?? DEFAULT_TIMEZONE;
}

// 1. The member's profile row: targets, timezone, nutrition mode. Loaded first because "today" depends on its timezone.
export function useClientProfile() {
  const userId = useUserId();
  return useQuery({
    queryKey: ['client-profile', userId],
    staleTime: 10 * 60_000,
    queryFn: async (): Promise<ClientProfileRow | null> => {
      const { data, error } = await supabase.from('client_profiles').select(MEMBER_PROFILE_SELECT).eq('client_id', userId).maybeSingle();
      if (error) throw error;
      // The coach's private notes are not on this row (they moved to client_coach_notes in migration 0124).
      return (data as unknown as ClientProfileRow | null) ?? null;
    },
  });
}

// 2. Recent daily logs (oldest first): today's numbers, the streak and the programme week.
export function useRecentLogs(todayIso: string, enabled: boolean) {
  const userId = useUserId();
  return useQuery({
    queryKey: ['daily-logs', userId, 'recent', todayIso],
    enabled,
    queryFn: async (): Promise<DailyLogRow[]> => {
      const from = toIsoDate(addDays(new Date(todayIso + 'T00:00:00Z'), -HISTORY_DAYS));
      const { data, error } = await supabase
        .from('daily_logs')
        .select('*')
        .eq('client_id', userId)
        .gte('log_date', from)
        .lte('log_date', todayIso)
        .order('log_date', { ascending: true });
      if (error) throw error;
      return (data ?? []) as DailyLogRow[];
    },
  });
}

// 3. The next few booked sessions.
export function useUpcomingBookings(todayIso: string, enabled: boolean) {
  const userId = useUserId();
  return useQuery({
    queryKey: ['bookings', userId, 'upcoming', todayIso],
    enabled,
    queryFn: async (): Promise<BookingRow[]> => {
      const { data, error } = await supabase
        .from('bookings')
        .select('*, class:classes(*)')
        .eq('client_id', userId)
        .eq('status', 'booked')
        .gte('booking_date', todayIso)
        .order('booking_date', { ascending: true })
        .limit(10);
      if (error) throw error;
      return (data ?? []) as unknown as BookingRow[];
    },
  });
}

// 4. Credits balance + current membership plan, in parallel.
export function useCredits() {
  const userId = useUserId();
  return useQuery({
    queryKey: ['credits', userId],
    queryFn: async () => {
      const [balance, membership] = await Promise.all([
        supabase.from('credits_balance').select('balance').eq('client_id', userId).maybeSingle(),
        supabase.from('client_memberships').select('*, package:membership_packages(*)').eq('client_id', userId).is('ended_at', null).maybeSingle(),
      ]);
      if (balance.error) throw balance.error;
      if (membership.error) throw membership.error;
      return {
        balance: (balance.data?.balance as number | undefined) ?? 0,
        membership: membership.data as unknown as ClientMembershipRow | null,
      };
    },
  });
}

// 5. How many forms the coach has assigned that are not finished.
export function usePendingForms() {
  const userId = useUserId();
  return useQuery({
    queryKey: ['pending-forms', userId],
    queryFn: async (): Promise<number> => {
      const { count, error } = await supabase
        .from('form_assignments')
        .select('id', { count: 'exact', head: true })
        .eq('client_id', userId)
        .is('completed_at', null);
      if (error) throw error;
      return count ?? 0;
    },
  });
}

// `notice` is the programme's last week, or its end, in the web's words (D2): "Last week of this programme: your coach is
// setting up the next one", "Your programme has finished. Your coach is setting up the next one."
export type TodayWorkout =
  | { status: 'no_program' }
  | { status: 'no_start_date'; programName: string }
  | { status: 'ended'; programName: string; notice: ProgrammeNotice | null }
  | { status: 'rest_day'; programName: string; weekNum: number; totalWeeks: number; notice: ProgrammeNotice | null }
  | { status: 'workout'; programName: string; weekNum: number; totalWeeks: number; day: WorkoutProgramDayRow; exercises: WorkoutExerciseRow[]; loggedToday: boolean; notice: ProgrammeNotice | null };

const shortDay = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });

// 6. Today's workout. Programme and day lists are tiny (no exercises), so only the one day's exercises are fetched.
export function useTodayWorkout(todayIso: string, tz: string, enabled: boolean) {
  const userId = useUserId();
  return useQuery({
    queryKey: ['today-workout', userId, todayIso],
    enabled,
    queryFn: async (): Promise<TodayWorkout> => {
      const programsRes = await supabase.from('workout_programs').select('id, client_id, name, created_at, start_date, week_one').eq('client_id', userId);
      if (programsRes.error) throw programsRes.error;
      const programs = (programsRes.data ?? []).map((p) => ({ ...(p as Omit<WorkoutProgramRow, 'workout_program_days'>), workout_program_days: [] as WorkoutProgramDayRow[] }));
      const { current, upcoming } = pickCurrentProgram(programs, todayIso);
      if (!current) return { status: 'no_program' };
      // A programme with no start date can't be placed in a week: it isn't over, the coach hasn't dated it yet.
      if (!current.start_date) return { status: 'no_start_date', programName: current.name };

      const daysRes = await supabase
        .from('workout_program_days')
        .select('id, program_id, week_num, day_label, sort_order, phase_label, notes, day_position')
        .eq('program_id', current.id);
      if (daysRes.error) throw daysRes.error;
      const days = (daysRes.data ?? []).map((d) => ({ ...(d as Omit<WorkoutProgramDayRow, 'workout_exercises'>), workout_exercises: [] as WorkoutExerciseRow[] }));
      const program: WorkoutProgramRow = { ...current, workout_program_days: days };

      const notice = memberProgrammeNotice(programmeEnd([program, ...upcoming], todayIso), shortDay);
      const active = resolveActiveProgram([program], todayIso);
      if (!active) return { status: 'ended', programName: program.name, notice };
      const totalWeeks = Math.max(0, ...days.map((d) => d.week_num));
      const weekday = new Date(todayIso + 'T00:00:00Z').getUTCDay();
      const day = resolveProgramDayByPosition(active.program, active.weekNum, weekday);
      if (!day) return { status: 'rest_day', programName: program.name, weekNum: active.weekNum, totalWeeks, notice };

      const exRes = await supabase.from('workout_exercises').select('*').eq('program_day_id', day.id).order('sort_order', { ascending: true });
      if (exRes.error) throw exRes.error;
      const exercises = (exRes.data ?? []) as WorkoutExerciseRow[];

      // Logged today if any set exists for this day's exercises with a timestamp falling on today in the member's timezone.
      let loggedToday = false;
      if (exercises.length) {
        const since = new Date(Date.now() - 36 * 3600_000).toISOString();
        const logsRes = await supabase.from('workout_logs').select('logged_at').in('exercise_id', exercises.map((e) => e.id)).gte('logged_at', since);
        if (logsRes.error) throw logsRes.error;
        loggedToday = (logsRes.data ?? []).some((l) => isoDateInTz(new Date(l.logged_at as string), tz) === todayIso);
      }
      return { status: 'workout', programName: program.name, weekNum: active.weekNum, totalWeeks, day, exercises, loggedToday, notice };
    },
  });
}

// Check in to today's booked session (marks it attended).
export function useCheckIn() {
  const userId = useUserId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ classId, date }: { classId: string; date: string }) => {
      const { error } = await supabase.rpc('check_in_booking', { p_class_id: classId, p_booking_date: date });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bookings', userId] });
      qc.invalidateQueries({ queryKey: ['today-workout', userId] });
      qc.invalidateQueries({ queryKey: ['sessions-done', userId] });
    },
  });
}
