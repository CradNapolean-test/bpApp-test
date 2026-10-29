import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { BookingRow, ClassRow, CreditBucketBalances, CreditsLedgerRow, ScheduleOccurrence } from '@ballistic/shared/data/types';
import { applyExceptionsAndCounts, generateOccurrences } from '@ballistic/shared/utils/schedule';

import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';

function useUserId() {
  const { session } = useSession();
  const id = session?.user.id;
  if (!id) throw new Error('Signed-in screens need a session');
  return id;
}

export type Schedule = { occurrences: ScheduleOccurrence[]; blackoutStart: string | null; blackoutEnd: string | null; cutoffHours: number };

// The bookable timetable for the member's gym. Two round trips: (classes + gym rules) then (cancelled dates +
// whole-gym booked counts). A member can only read their own bookings, so "spots left" comes from the
// class_booking_counts RPC (counts only, never who).
export function useSchedule(gymId: string | null, todayIso: string, weeksAhead: number, enabled: boolean) {
  return useQuery({
    queryKey: ['schedule', gymId, todayIso, weeksAhead],
    enabled: enabled && !!gymId,
    queryFn: async (): Promise<Schedule> => {
      const [classesRes, gymRes] = await Promise.all([
        supabase.from('classes').select('*').eq('gym_id', gymId!),
        supabase.from('gyms').select('blackout_start, blackout_end').eq('id', gymId!).maybeSingle(),
      ]);
      if (classesRes.error) throw classesRes.error;
      const classes = (classesRes.data ?? []) as ClassRow[];
      const blackoutStart: string | null = gymRes.data?.blackout_start ?? null;
      const blackoutEnd: string | null = gymRes.data?.blackout_end ?? null;

      const bare = generateOccurrences(classes, { todayIso, weeksAhead, blackoutStart, blackoutEnd });
      if (bare.length === 0) return { occurrences: [], blackoutStart, blackoutEnd, cutoffHours: 3 };
      const classIds = [...new Set(bare.map((o) => o.classId))];
      const dates = [...new Set(bare.map((o) => o.date))];

      const [exceptionsRes, countsRes] = await Promise.all([
        supabase.from('class_exceptions').select('class_id, occurrence_date').in('class_id', classIds).in('occurrence_date', dates),
        supabase.rpc('class_booking_counts', { p_class_ids: classIds, p_dates: dates }),
      ]);
      if (exceptionsRes.error) throw exceptionsRes.error;
      const counts = (countsRes.error ? [] : countsRes.data ?? []) as { class_id: string; booking_date: string; booked_count: number }[];
      const occurrences = applyExceptionsAndCounts(bare, exceptionsRes.data ?? [], counts);
      return { occurrences, blackoutStart, blackoutEnd, cutoffHours: occurrences[0]?.cutoffHours ?? 3 };
    },
  });
}

// The member's own current bookings (booked or on the waitlist) from today on.
export function useMyBookings(todayIso: string, enabled: boolean) {
  const userId = useUserId();
  return useQuery({
    queryKey: ['bookings', userId, 'active', todayIso],
    enabled,
    queryFn: async (): Promise<BookingRow[]> => {
      const { data, error } = await supabase
        .from('bookings')
        .select('*, class:classes(*)')
        .eq('client_id', userId)
        .in('status', ['booked', 'waitlist'])
        .gte('booking_date', todayIso)
        .order('booking_date', { ascending: true })
        .limit(60);
      if (error) throw error;
      return (data ?? []) as unknown as BookingRow[];
    },
  });
}

export function useCreditBuckets() {
  const userId = useUserId();
  return useQuery({
    queryKey: ['credit-buckets', userId],
    queryFn: async (): Promise<CreditBucketBalances> => {
      const { data, error } = await supabase.from('credits_balance_by_bucket').select('bucket, balance').eq('client_id', userId);
      if (error) throw error;
      const out: CreditBucketBalances = { membership: 0, bonus: 0 };
      for (const r of data ?? []) out[r.bucket as 'membership' | 'bonus'] = r.balance as number;
      return out;
    },
  });
}

// The member's credit history, newest first, 20 at a time.
const LEDGER_PAGE = 20;
export function useCreditLedger() {
  const userId = useUserId();
  return useInfiniteQuery({
    queryKey: ['credit-ledger', userId],
    initialPageParam: 0,
    queryFn: async ({ pageParam }): Promise<CreditsLedgerRow[]> => {
      const { data, error } = await supabase
        .from('credits_ledger')
        .select('*')
        .eq('client_id', userId)
        .order('created_at', { ascending: false })
        .range(pageParam, pageParam + LEDGER_PAGE - 1);
      if (error) throw error;
      return (data ?? []) as CreditsLedgerRow[];
    },
    getNextPageParam: (last, all) => (last.length < LEDGER_PAGE ? undefined : all.length * LEDGER_PAGE),
  });
}

// Anything a booking or cancellation touches: spots left, my bookings, balance, history, the Today screen.
function useRefreshAfterBooking() {
  const userId = useUserId();
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ['bookings', userId] });
    qc.invalidateQueries({ queryKey: ['schedule'] });
    qc.invalidateQueries({ queryKey: ['credits', userId] });
    qc.invalidateQueries({ queryKey: ['credit-buckets', userId] });
    qc.invalidateQueries({ queryKey: ['credit-ledger', userId] });
  };
}

// The database decides credits, waitlist and refunds; these only call it and surface its message ("Not enough credits").
export function useBookClass() {
  const refresh = useRefreshAfterBooking();
  return useMutation({
    mutationFn: async ({ classId, date }: { classId: string; date: string }): Promise<{ status: 'booked' | 'waitlist' }> => {
      const { data, error } = await supabase.rpc('book_class', { p_class_id: classId, p_booking_date: date });
      if (error) throw new Error(error.message);
      return { status: (data as { status: 'booked' | 'waitlist' }).status };
    },
    onSettled: refresh,
  });
}

export function useCancelBooking() {
  const refresh = useRefreshAfterBooking();
  return useMutation({
    mutationFn: async ({ bookingId }: { bookingId: string }) => {
      const { error } = await supabase.rpc('cancel_booking', { p_booking_id: bookingId });
      if (error) throw new Error(error.message);
    },
    onSettled: refresh,
  });
}
