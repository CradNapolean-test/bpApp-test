'use server';

import { raise } from './errors';
import { fail, ok, type ActionResult } from './result';
import { resolveScopingGymId } from './coach';
import { checkActiveGym } from './gymGuard';
import { getClientGymId } from './memberships';
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
    .is('retired_at', null) // retired sessions keep their history but are not part of the timetable (migration 0132)
    .order('day_of_week')
    .order('start_time');
  if (error) raise(error);
  return data ?? [];
}

// expectedGymId (here and on every write below): the gym the page was drawn for. When the coach's active gym has moved
// on (they switched in another tab) the write is refused with a message instead of landing in the wrong gym (R28).
export async function createClass(
  fields: Omit<ClassRow, 'id' | 'coach_id' | 'gym_id' | 'specific_date'> & { specific_date?: string | null },
  expectedGymId?: string | null
): Promise<void | ActionResult> {
  const supabase = await createClient();
  const stale = await checkActiveGym(supabase, expectedGymId);
  if (stale) return stale;
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
  occurrences: { day_of_week: number; start_time: string }[],
  expectedGymId?: string | null
): Promise<void | ActionResult> {
  const supabase = await createClient();
  const stale = await checkActiveGym(supabase, expectedGymId);
  if (stale) return stale;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');
  const gymId = await resolveScopingGymId(supabase);

  const rows = occurrences.map((occ) => ({ ...shared, ...occ, coach_id: user.id, gym_id: gymId }));
  const { error } = await supabase.from('classes').insert(rows);
  if (error) raise(error);
}

// Really deletes a session. The database refuses when ANY booking exists (migration 0132): use retireClass for a session with history.
// Returns rather than throws so that reason reaches the screen.
export async function deleteClass(classId: string, expectedGymId?: string | null): Promise<ActionResult> {
  const supabase = await createClient();
  const stale = await checkActiveGym(supabase, expectedGymId);
  if (stale) return stale;
  const { error } = await supabase.from('classes').delete().eq('id', classId);
  return error ? fail(error, 'Could not delete that session') : ok();
}

// Retires a session instead of deleting it (D15): members booked on upcoming dates are refunded and told, past bookings and attendance
// stay on file, and the session no longer appears for booking. See retire_class (migration 0132).
export type RetireClassResult = { ok: true; cancelled: number; refundedCredits: number } | { ok: false; error: string };

export async function retireClass(classId: string, expectedGymId?: string | null): Promise<RetireClassResult> {
  const supabase = await createClient();
  const stale = await checkActiveGym(supabase, expectedGymId);
  if (stale) return stale as RetireClassResult;
  const { data, error } = await supabase.rpc('retire_class', { p_class_id: classId });
  if (error) return fail(error, 'Could not retire that session') as RetireClassResult;
  const result = (data ?? {}) as { cancelled?: number; refunded_credits?: number };
  return { ok: true, cancelled: result.cancelled ?? 0, refundedCredits: result.refunded_credits ?? 0 };
}

// What a session has booked, for the words in the "retire" and "edit" confirmations: members on upcoming dates, the most booked on any one
// of them, and every booking ever made (0 means it can simply be deleted).
export interface ClassBookingSummary {
  upcomingMembers: number;
  mostBookedOnOneDate: number;
  totalBookings: number;
}

export async function getClassBookingSummary(classId: string, todayIso: string): Promise<ClassBookingSummary> {
  const supabase = await createClient();
  const { count: total } = await supabase
    .from('bookings')
    .select('id', { count: 'exact', head: true })
    .eq('class_id', classId);
  const { data: upcoming } = await supabase
    .from('bookings')
    .select('client_id, booking_date, status')
    .eq('class_id', classId)
    .in('status', ['booked', 'waitlist'])
    .gte('booking_date', todayIso);
  const members = new Set<string>();
  const bookedByDate = new Map<string, number>();
  for (const row of upcoming ?? []) {
    members.add(row.client_id as string);
    if (row.status === 'booked') bookedByDate.set(row.booking_date as string, (bookedByDate.get(row.booking_date as string) ?? 0) + 1);
  }
  return {
    upcomingMembers: members.size,
    mostBookedOnOneDate: Math.max(0, ...bookedByDate.values()),
    totalBookings: total ?? 0,
  };
}

// Saves changes to a session. Returns rather than throws: the database refuses a capacity below the number booked and a changed day
// while members are booked, and says why (migration 0132).
export async function updateClass(
  classId: string,
  fields: Partial<Pick<ClassRow, 'name' | 'day_of_week' | 'specific_date' | 'start_time' | 'capacity' | 'credit_cost' | 'cutoff_hours' | 'coach_note'>>,
  expectedGymId?: string | null
): Promise<ActionResult> {
  const supabase = await createClient();
  const stale = await checkActiveGym(supabase, expectedGymId);
  if (stale) return stale;
  const { error } = await supabase.from('classes').update(fields).eq('id', classId);
  return error ? fail(error, 'Could not save that session') : ok();
}
// A member's bookings from `sinceDate` onwards: the recent past (the attended sessions shown on the check-in weeks) and everything ahead.
// It was called getUpcomingBookings but returned every non-cancelled booking ever, which reached the database's 1,000-row limit and
// carried years of history the screens never used (H5). The lifetime attended total is the rewards function's, not a count of these rows.
export async function getRecentAndUpcomingBookings(clientId: string, sinceDate: string): Promise<BookingRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('bookings')
    .select('*, class:classes(*)')
    .eq('client_id', clientId)
    .neq('status', 'cancelled')
    .gte('booking_date', sinceDate)
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

// Adds credits to a member through grant_credits (migration 0133), which checks the caller is the member's coach and the limits (1 to 50
// at a time, a reason, a future expiry), takes a lock so a grant never interleaves with a refund, and writes the ledger row. Always the
// 'bonus' bucket: manual grants are never the reset-managed 'membership' bucket. Returns rather than throws so the reason reaches the screen.
export async function grantCredits(
  clientId: string,
  amount: number,
  reason: string,
  expiresAt?: string | null
): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc('grant_credits', {
    p_client: clientId,
    p_amount: amount,
    p_reason: reason,
    p_expires_at: expiresAt ?? null,
  });
  return error ? fail(error, 'Could not add the credits') : ok();
}

// Upcoming occurrences of every recurring class (day_of_week-based, not stored as
// individual rows), merged with how many are already booked. Called by both the coach
// (Take Attendance) and clients (booking calendar) -- resolveScopingGymId figures out
// which gym's classes apply either way.
// `weeksBack` also generates recent past occurrences (the Attendance tab needs them, to mark
// sessions that have already happened); members only ever see upcoming ones.
// `includeCancelled` (coach screens) keeps dates that were cancelled, flagged, instead of dropping them.
// forGymId: a member's page shows the timetable of the MEMBER'S gym; everywhere else it is the gym being worked in (R38).
// The next three weeks of sessions at the member's own gym, read when the Book screen opens (R13/M1: the timetable was 32 KB of every
// dashboard page, for a screen most visits never open).
export async function getMemberTimetable(clientId: string): Promise<ScheduleOccurrence[]> {
  const gymId = await getClientGymId(clientId);
  return getScheduleOccurrences(3, 0, false, gymId);
}

export async function getScheduleOccurrences(weeksAhead = 3, weeksBack = 0, includeCancelled = false, forGymId?: string | null): Promise<ScheduleOccurrence[]> {
  const supabase = await createClient();
  const gymId = forGymId ?? (await resolveScopingGymId(supabase));

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

  let occurrences: Omit<ScheduleOccurrence, 'bookedCount' | 'unmarkedCount'>[] = [];
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
  // A retired session (migration 0132) is never offered for booking; the coach's attendance view (weeksBack > 0) keeps its past dates so
  // sessions that already happened can still be marked.
  const retiredIds = new Set((classes ?? []).filter((c) => c.retired_at).map((c) => c.id as string));
  if (retiredIds.size > 0) {
    const today = toIsoDate(new Date());
    occurrences = occurrences.filter((o) => !retiredIds.has(o.classId) || (weeksBack > 0 && o.date < today));
  }
  if (occurrences.length === 0) return [];

  const dates = [...new Set(occurrences.map((o) => o.date))];
  const classIds = [...new Set(occurrences.map((o) => o.classId))];

  // Skip generating any occurrence a coach has cancelled (0051) -- filtered out entirely
  // rather than flagged, matching the virtual-generation model: a cancelled date simply isn't
  // a bookable/attendable occurrence anymore.
  // The reason column needs migration 0100; without it, fall back to no reasons rather than failing.
  let exceptions: { class_id: string; occurrence_date: string; reason?: string | null }[] | null = null;
  const withReason = await supabase.from('class_exceptions').select('class_id, occurrence_date, reason').in('class_id', classIds).in('occurrence_date', dates);
  if (withReason.error) {
    const plain = await supabase.from('class_exceptions').select('class_id, occurrence_date').in('class_id', classIds).in('occurrence_date', dates);
    if (plain.error) raise(plain.error);
    exceptions = plain.data;
  } else {
    exceptions = withReason.data;
  }
  const cancelledKeys = new Map((exceptions ?? []).map((e) => [`${e.class_id}|${e.occurrence_date}`, e.reason ?? null]));
  const activeOccurrences = includeCancelled ? occurrences : occurrences.filter((o) => !cancelledKeys.has(`${o.classId}|${o.date}`));
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
      ...(includeCancelled && cancelledKeys.has(`${o.classId}|${o.date}`)
        ? { cancelled: true, cancelReason: cancelledKeys.get(`${o.classId}|${o.date}`) ?? null }
        : {}),
    }))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

// Bulk cancel: refunds every booked spot, cancels every booked/waitlist row, notifies every
// affected client -- see migration 0051's cancel_class_occurrence for the exact refund/notify
// logic (mirrors cancel_booking's reason format, skips waitlist-promotion since the whole
// occurrence is gone). Returns how many bookings were affected, for the UI's confirmation toast.
// `reason` goes into the notification each booked member gets (needs migration 0100; only sent when given).
export async function cancelClassOccurrence(classId: string, date: string, reason?: string): Promise<ActionResult & { count?: number }> {
  const supabase = await createClient();
  const note = reason?.trim();
  const { data, error } = await supabase.rpc('cancel_class_occurrence', {
    p_class_id: classId,
    p_date: date,
    ...(note ? { p_reason: note } : {}),
  });
  if (error) return fail(error, 'Could not cancel that occurrence');
  return { ...ok(), count: data as number };
}

// Puts a cancelled date back. Bookings that were cancelled with it stay cancelled -- members book again.
export async function restoreClassOccurrence(classId: string, date: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc('restore_class_occurrence', { p_class_id: classId, p_date: date });
  return error ? fail(error, 'Could not restore that session (has migration 0100 been run?)') : ok();
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
    .order('created_at');
  if (error) raise(error);
  if (!bookings || bookings.length === 0) return [];

  // A cancelled booking is a late cancel when nothing was given back for it.
  const cancelledIds = bookings.filter((b) => b.status === 'cancelled').map((b) => b.id);
  const refundedIds = new Set<string>();
  if (cancelledIds.length > 0) {
    const { data: refunds } = await supabase.from('credits_ledger').select('booking_id').in('booking_id', cancelledIds).gt('delta', 0);
    for (const r of refunds ?? []) if (r.booking_id) refundedIds.add(r.booking_id);
  }

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
    lateCancel: b.status === 'cancelled' && !refundedIds.has(b.id),
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
