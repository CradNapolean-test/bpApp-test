'use server';

import { raise } from './errors';
import { fail, ok, type ActionResult } from './result';
import { resolveScopingGymId } from './coach';
import { createClient } from '@/lib/supabase/server';
import { addDays, nextDateForWeekday, toIsoDate } from '@/lib/utils/dates';
import type {
  AttendanceStatus,
  BookingRow,
  ClassRow,
  CreditBucketBalances,
  CreditsLedgerRow,
  RosterEntry,
  ScheduleOccurrence,
} from './types';

export async function getClasses(): Promise<ClassRow[]> {
  const supabase = await createClient();
  const gymId = await resolveScopingGymId(supabase);
  const { data, error } = await supabase
    .from('classes')
    .select('*')
    .eq('gym_id', gymId)
    .order('day_of_week')
    .order('start_time');
  if (error) raise(error);
  return data ?? [];
}

export async function createClass(
  fields: Omit<ClassRow, 'id' | 'coach_id' | 'gym_id' | 'specific_date'> & { specific_date?: string | null }
): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');
  const gymId = await resolveScopingGymId(supabase);

  const { error } = await supabase.from('classes').insert({ ...fields, coach_id: user.id, gym_id: gymId });
  if (error) raise(error);
}

// Creates one class row per {day_of_week, start_time} occurrence, sharing every other
// field -- lets a coach set up "Yoga, Mon/Wed/Fri 6am" in one submit instead of three.
export async function createClasses(
  shared: Omit<ClassRow, 'id' | 'coach_id' | 'gym_id' | 'day_of_week' | 'start_time' | 'specific_date'>,
  occurrences: { day_of_week: number; start_time: string }[]
): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');
  const gymId = await resolveScopingGymId(supabase);

  const rows = occurrences.map((occ) => ({ ...shared, ...occ, coach_id: user.id, gym_id: gymId }));
  const { error } = await supabase.from('classes').insert(rows);
  if (error) raise(error);
}

export async function deleteClass(classId: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from('classes').delete().eq('id', classId);
  if (error) raise(error);
}

export async function updateClass(
  classId: string,
  fields: Partial<Pick<ClassRow, 'name' | 'day_of_week' | 'specific_date' | 'start_time' | 'capacity' | 'credit_cost' | 'cutoff_hours' | 'coach_note'>>
): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from('classes').update(fields).eq('id', classId);
  if (error) raise(error);
}

export async function getUpcomingBookings(clientId: string): Promise<BookingRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('bookings')
    .select('*, class:classes(*)')
    .eq('client_id', clientId)
    .neq('status', 'cancelled')
    .order('booking_date');
  if (error) raise(error);
  return (data ?? []) as unknown as BookingRow[];
}

// Returns rather than throws -- book_class raises user-facing domain errors ("Not enough
// credits") that Next.js would redact out of a thrown error in production. See result.ts.
export async function bookClass(classId: string, bookingDate: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc('book_class', {
    p_class_id: classId,
    p_booking_date: bookingDate,
  });
  return error ? fail(error, 'Could not book that class') : ok();
}

export async function cancelBooking(bookingId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc('cancel_booking', { p_booking_id: bookingId });
  return error ? fail(error, 'Could not cancel that booking') : ok();
}

// A member checking in to their own booking on the day: marks it attended (migration 0071).
export async function checkInToSession(classId: string, bookingDate: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc('check_in_booking', { p_class_id: classId, p_booking_date: bookingDate });
  return error ? fail(error, 'Could not check you in') : ok();
}

// Coach-initiated counterpart to bookClass -- book_class_for_client (0062) checks
// is_coach_of(p_client_id) server-side rather than trusting auth.uid(), for a coach booking a
// client into a class on their behalf (e.g. over the phone, or filling a spot in person).
export async function bookClassForClient(classId: string, clientId: string, bookingDate: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc('book_class_for_client', {
    p_class_id: classId,
    p_client_id: clientId,
    p_booking_date: bookingDate,
  });
  return error ? fail(error, 'Could not book that class') : ok();
}

export async function getCreditsBalance(clientId: string): Promise<number> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('credits_balance')
    .select('balance')
    .eq('client_id', clientId)
    .maybeSingle();
  if (error) raise(error);
  return data?.balance ?? 0;
}

// Per-bucket split of the same total credits_balance sums -- 'membership' resets to the
// package amount weekly and is spent first; 'bonus' (manual grants + credit packs) carries
// over and can expire. Two small queries rather than one grouped one: credits_ledger rows
// aren't worth fetching in full just to sum client-side, and this stays a straight mirror of
// getCreditsBalance's own shape.
export async function getCreditsBucketBalances(clientId: string): Promise<CreditBucketBalances> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('credits_balance_by_bucket')
    .select('bucket, balance')
    .eq('client_id', clientId);
  if (error) raise(error);
  const balances: CreditBucketBalances = { membership: 0, bonus: 0 };
  for (const row of data ?? []) {
    balances[row.bucket as 'membership' | 'bonus'] = row.balance;
  }
  return balances;
}

export async function getCreditsLedger(clientId: string): Promise<CreditsLedgerRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('credits_ledger')
    .select('*')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false });
  if (error) raise(error);
  return data ?? [];
}

// Always writes to the 'bonus' bucket (the column default) -- manual grants are never the
// reset-managed 'membership' bucket, which only replenish_due_memberships writes to.
export async function grantCredits(
  clientId: string,
  delta: number,
  reason: string,
  expiresAt?: string | null
): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { error } = await supabase
    .from('credits_ledger')
    .insert({ client_id: clientId, delta, reason, granted_by: user.id, expires_at: expiresAt ?? null });
  if (error) raise(error);
}

// Upcoming occurrences of every recurring class (day_of_week-based, not stored as
// individual rows), merged with how many are already booked. Called by both the coach
// (Take Attendance) and clients (booking calendar) -- resolveScopingGymId figures out
// which gym's classes apply either way.
// `weeksBack` also generates recent past occurrences (the Attendance tab needs them, to mark
// sessions that have already happened); members only ever see upcoming ones.
export async function getScheduleOccurrences(weeksAhead = 3, weeksBack = 0): Promise<ScheduleOccurrence[]> {
  const supabase = await createClient();
  const gymId = await resolveScopingGymId(supabase);

  const { data: classes, error: classesError } = await supabase
    .from('classes')
    .select('*')
    .eq('gym_id', gymId);
  if (classesError) raise(classesError);

  // Gym blackout window (0064). If the migration hasn't been applied yet the columns don't
  // exist -- fall back to no blackout rather than failing the whole dashboard load.
  const { data: gym } = await supabase.from('gyms').select('blackout_start, blackout_end').eq('id', gymId).maybeSingle();
  const blackoutStart: string | null = gym?.blackout_start ?? null;
  const blackoutEnd: string | null = gym?.blackout_end ?? null;

  const occurrences: Omit<ScheduleOccurrence, 'bookedCount' | 'unmarkedCount'>[] = [];
  for (const c of classes ?? []) {
    if (c.specific_date) {
      // One-off: a single occurrence, kept only if it falls inside the requested window.
      const today = toIsoDate(new Date());
      if (c.specific_date < toIsoDate(addDays(new Date(today + 'T00:00:00Z'), -weeksBack * 7))) continue;
      if (c.specific_date >= toIsoDate(addDays(new Date(today + 'T00:00:00Z'), weeksAhead * 7))) continue;
      occurrences.push({
        classId: c.id,
        className: c.name,
        date: c.specific_date,
        startTime: c.start_time,
        capacity: c.capacity,
        creditCost: c.credit_cost,
        cutoffHours: c.cutoff_hours,
        blackoutStart,
        blackoutEnd,
      });
      continue;
    }
    if (c.day_of_week == null) continue;
    const firstDate = new Date(nextDateForWeekday(c.day_of_week) + 'T00:00:00Z');
    for (let w = -weeksBack; w < weeksAhead; w++) {
      occurrences.push({
        classId: c.id,
        className: c.name,
        date: toIsoDate(addDays(firstDate, w * 7)),
        startTime: c.start_time,
        capacity: c.capacity,
        creditCost: c.credit_cost,
        cutoffHours: c.cutoff_hours,
        blackoutStart,
        blackoutEnd,
      });
    }
  }
  if (occurrences.length === 0) return [];

  const dates = [...new Set(occurrences.map((o) => o.date))];
  const classIds = [...new Set(occurrences.map((o) => o.classId))];

  // Skip generating any occurrence a coach has cancelled (0051) -- filtered out entirely
  // rather than flagged, matching the virtual-generation model: a cancelled date simply isn't
  // a bookable/attendable occurrence anymore.
  const { data: exceptions, error: exceptionsError } = await supabase
    .from('class_exceptions')
    .select('class_id, occurrence_date')
    .in('class_id', classIds)
    .in('occurrence_date', dates);
  if (exceptionsError) raise(exceptionsError);
  const cancelledKeys = new Set((exceptions ?? []).map((e) => `${e.class_id}|${e.occurrence_date}`));
  const activeOccurrences = occurrences.filter((o) => !cancelledKeys.has(`${o.classId}|${o.date}`));
  if (activeOccurrences.length === 0) return [];

  const { data: bookings, error: bookingsError } = await supabase
    .from('bookings')
    .select('class_id, booking_date, attended, no_show')
    .in('class_id', classIds)
    .in('booking_date', dates)
    .eq('status', 'booked');
  if (bookingsError) raise(bookingsError);

  const todayIso = toIsoDate(new Date());
  const countMap = new Map<string, number>();
  // Past bookings the coach hasn't marked attended or no-show yet -- what Attendance nudges about.
  const unmarkedMap = new Map<string, number>();
  for (const b of bookings ?? []) {
    const key = `${b.class_id}|${b.booking_date}`;
    countMap.set(key, (countMap.get(key) ?? 0) + 1);
    if (b.booking_date < todayIso && !b.attended && !b.no_show) unmarkedMap.set(key, (unmarkedMap.get(key) ?? 0) + 1);
  }

  // A member can only read their own bookings, so the count above is only theirs. Ask for the real
  // per-session totals (counts only, never who) so "spots left" is right for everyone. Falls back to
  // the count above if migration 0094 has not been applied yet.
  const { data: totals, error: totalsError } = await supabase.rpc('class_booking_counts', {
    p_class_ids: classIds,
    p_dates: dates,
  });
  if (totalsError) console.warn('class_booking_counts failed, using own-bookings count:', totalsError.message);
  if (!totalsError && totals) {
    countMap.clear();
    for (const t of totals as { class_id: string; booking_date: string; booked_count: number }[]) {
      countMap.set(`${t.class_id}|${t.booking_date}`, t.booked_count);
    }
  }

  return activeOccurrences
    .map((o) => ({
      ...o,
      bookedCount: countMap.get(`${o.classId}|${o.date}`) ?? 0,
      unmarkedCount: unmarkedMap.get(`${o.classId}|${o.date}`) ?? 0,
    }))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

// Bulk cancel: refunds every booked spot, cancels every booked/waitlist row, notifies every
// affected client -- see migration 0051's cancel_class_occurrence for the exact refund/notify
// logic (mirrors cancel_booking's reason format, skips waitlist-promotion since the whole
// occurrence is gone). Returns how many bookings were affected, for the UI's confirmation toast.
export async function cancelClassOccurrence(classId: string, date: string): Promise<ActionResult & { count?: number }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('cancel_class_occurrence', { p_class_id: classId, p_date: date });
  if (error) return fail(error, 'Could not cancel that occurrence');
  return { ...ok(), count: data as number };
}

// A coach takes one member off a session; `refund` says whether their credit goes back.
export async function removeFromSession(bookingId: string, refund: boolean): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc('coach_cancel_booking', { p_booking_id: bookingId, p_refund: refund });
  return error ? fail(error, 'Could not remove them from the session') : ok();
}

// Roster for one specific occurrence (class + date), with each booked client's name and
// current attendance state.
export async function getRoster(classId: string, date: string): Promise<RosterEntry[]> {
  const supabase = await createClient();
  const { data: bookings, error } = await supabase
    .from('bookings')
    .select('id, client_id, status, attended, no_show')
    .eq('class_id', classId)
    .eq('booking_date', date)
    .neq('status', 'cancelled')
    .order('created_at');
  if (error) raise(error);
  if (!bookings || bookings.length === 0) return [];

  const clientIds = bookings.map((b) => b.client_id);
  const { data: profiles, error: profilesError } = await supabase
    .from('client_profiles')
    .select('client_id, name')
    .in('client_id', clientIds);
  if (profilesError) raise(profilesError);

  const nameMap = new Map((profiles ?? []).map((p) => [p.client_id, p.name]));

  return bookings.map((b) => ({
    bookingId: b.id,
    clientId: b.client_id,
    clientName: nameMap.get(b.client_id) ?? 'Unknown',
    status: b.status,
    attended: b.attended,
    noShow: b.no_show,
  }));
}

// Supersedes markAttendance's 2-state (attended/not) write -- the redesign's Take Attendance
// screen cycles Unmarked -> Attended -> No-show, and collapsing "unmarked" into "no-show" was
// also a real reporting bug (see migration 0041).
export async function markAttendanceStatus(bookingId: string, status: AttendanceStatus): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc('mark_attendance_status', {
    p_booking_id: bookingId,
    p_status: status,
  });
  return error ? fail(error, 'Could not update attendance') : ok();
}
