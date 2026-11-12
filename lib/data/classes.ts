'use server';

import { raise } from './errors';
import { fail, ok, type ActionResult } from './result';
import { resolveScopingGymId } from './coach';
import { checkActiveGym } from './gymGuard';
import { getClientGymId } from './memberships';
import { after } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { affectedMembers, type AffectedBooking } from '@/lib/classCancelPush';
import { notifyClassCancelled } from '@/lib/classCancelNotify';
import { notifyWaitlistPromotion, waitlistBeforeCancel } from '@/lib/waitlistPromotionNotify';
import { countSessionBookings } from '@/lib/classSessionCounts';
import { nowLocalMs } from '@/lib/utils/cancelDeadline';
import { addDays, DEFAULT_TIMEZONE, nextDateForWeekday, toIsoDate } from '@/lib/utils/dates';
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
  // Who is waiting is read before the cancel; whoever the database moves in gets a push after the response (BK9, migration 0158).
  const waiting = await waitlistBeforeCancel(bookingId);
  const { error } = await supabase.rpc('cancel_booking', { p_booking_id: bookingId });
  if (error) return fail(error, 'Could not cancel that booking');
  if (waiting) after(() => notifyWaitlistPromotion(waiting));
  return ok();
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

// A walk-in short of credits, in one step at the door (D18, BK14): adds the credits they are short (grant_credits: the bonus bucket, a
// reason naming the session) and then books them in (book_class_for_client). The database lets only the member's own coach do either, so
// the walk-in list only holds the coach's own members. If the booking then fails (the last place went, say), the credits stay on the
// member's ledger and the message says so, so the coach can try again or take them off.
export async function grantCreditsAndBook(
  classId: string,
  clientId: string,
  bookingDate: string,
  credits: number,
  sessionLabel: string
): Promise<ActionResult> {
  const granted = await grantCredits(clientId, credits, `Added at the door: ${sessionLabel}`.slice(0, 200));
  if (!granted.ok) return granted;
  const booked = await bookClassForClient(classId, clientId, bookingDate);
  if (booked.ok) return booked;
  return { ok: false, error: `${credits} credit${credits === 1 ? ' was' : 's were'} added, but the booking didn't go through: ${booked.error}` };
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
  // The timezone (same migration) says when a session has started, for "to mark".
  const { data: gym } = await supabase.from('gyms').select('blackout_start, blackout_end, timezone').eq('id', gymId).maybeSingle();
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
        ...(includeCancelled ? { coachNote: c.coach_note ?? null } : {}),
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
        ...(includeCancelled ? { coachNote: c.coach_note ?? null } : {}),
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
    .select('class_id, booking_date, status, attended, no_show')
    .in('class_id', classIds)
    .in('booking_date', dates)
    .in('status', ['booked', 'waitlist']);
  if (bookingsError) raise(bookingsError);

  // Booked places, the waitlist, and booked places the coach hasn't marked attended or no-show yet once the session has started (at the
  // gym's clock), which is what Sessions and the dashboard nudge about. A member reads only their own rows, so for them the waitlist count
  // is their own; only the coach's screens show it.
  const startTimeOf = new Map((classes ?? []).map((c) => [c.id as string, (c.start_time as string | null) ?? null]));
  const counts = countSessionBookings(bookings ?? [], startTimeOf, nowLocalMs(gym?.timezone || DEFAULT_TIMEZONE));
  const countMap = counts.booked;
  const unmarkedMap = counts.unmarked;

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
      waitlistCount: counts.waiting.get(`${o.classId}|${o.date}`) ?? 0,
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
  // Who is affected is read BEFORE the cancel: afterwards their bookings say 'cancelled' and look like any earlier cancellation. The
  // database writes the in-app notice and the refunds; the push below is the part that reaches a member who is not looking at the app.
  const [{ data: affected }, { data: session }] = await Promise.all([
    supabase.from('bookings').select('client_id, status').eq('class_id', classId).eq('booking_date', date).in('status', ['booked', 'waitlist']),
    supabase.from('classes').select('name, start_time').eq('id', classId).maybeSingle(),
  ]);
  const { data, error } = await supabase.rpc('cancel_class_occurrence', {
    p_class_id: classId,
    p_date: date,
    ...(note ? { p_reason: note } : {}),
  });
  if (error) return fail(error, 'Could not cancel that occurrence');
  if (session && (affected ?? []).length > 0) {
    // After the response, so a slow push service cannot slow the coach down (R41).
    after(() =>
      notifyClassCancelled({
        members: affectedMembers((affected ?? []) as AffectedBooking[]),
        className: session.name as string,
        date,
        startTime: (session.start_time as string | null) ?? null,
        reason: note,
      })
    );
  }
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
  const waiting = await waitlistBeforeCancel(bookingId); // as in cancelBooking (BK9)
  const { error } = await supabase.rpc('coach_cancel_booking', { p_booking_id: bookingId, p_refund: refund });
  if (error) return fail(error, 'Could not remove them from the session');
  if (waiting) after(() => notifyWaitlistPromotion(waiting));
  return ok();
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

  const clientIds = [...new Set(bookings.map((b) => b.client_id))];
  // The name, plus what the coach should know on the day (CS4): health notes, injury notes, credits, a hold, how new they are. Only the
  // name is required; the rest show when the coach is allowed to read them.
  const [profilesRes, joinedRes, injuriesRes, balancesRes, holdsRes] = await Promise.all([
    supabase.from('client_profiles').select('client_id, name, health_notes').in('client_id', clientIds),
    supabase.from('profiles').select('id, created_at').in('id', clientIds),
    supabase
      .from('client_journal_entries')
      .select('client_id, body')
      .eq('kind', 'injury')
      .in('client_id', clientIds)
      .order('created_at', { ascending: false })
      .limit(200),
    supabase.from('credits_balance').select('client_id, balance').in('client_id', clientIds),
    supabase.from('membership_holds').select('client_id, started_on, ended_on').in('client_id', clientIds).lte('started_on', date),
  ]);
  if (profilesRes.error) raise(profilesRes.error);

  const profileOf = new Map((profilesRes.data ?? []).map((p) => [p.client_id as string, p as { name: string | null; health_notes: string | null }]));
  const injuriesOf = new Map<string, string[]>();
  for (const j of (injuriesRes.data ?? []) as { client_id: string; body: string }[]) {
    const list = injuriesOf.get(j.client_id) ?? [];
    if (list.length < 2 && j.body?.trim()) list.push(j.body.trim());
    injuriesOf.set(j.client_id, list);
  }
  const balanceOf = new Map(((balancesRes.data ?? []) as { client_id: string; balance: number }[]).map((r) => [r.client_id, r.balance]));
  const onHold = new Set(
    ((holdsRes.data ?? []) as { client_id: string; started_on: string; ended_on: string | null }[])
      .filter((h) => h.started_on <= date && (h.ended_on == null || h.ended_on >= date))
      .map((h) => h.client_id)
  );
  const joinedOn = new Map(((joinedRes.data ?? []) as { id: string; created_at: string }[]).map((p) => [p.id, p.created_at.slice(0, 10)]));
  const daysBefore = (n: number) => toIsoDate(addDays(new Date(`${date}T00:00:00Z`), -n));
  // First class: only members who joined in the last 90 days are checked, so a long-standing member's history isn't read.
  const recent = clientIds.filter((id) => (joinedOn.get(id) ?? '') >= daysBefore(90));
  const { data: earlier } = recent.length
    ? await supabase.from('bookings').select('client_id').in('client_id', recent).eq('status', 'booked').eq('attended', true).lt('booking_date', date).limit(2000)
    : { data: [] as { client_id: string }[] };
  const cameBefore = new Set((earlier ?? []).map((r) => r.client_id as string));

  return bookings.map((b) => {
    const profile = profileOf.get(b.client_id);
    const joined = joinedOn.get(b.client_id);
    return {
      bookingId: b.id,
      clientId: b.client_id,
      clientName: profile?.name ?? 'Unknown',
      status: b.status,
      attended: b.attended,
      noShow: b.no_show,
      lateCancel: b.status === 'cancelled' && !refundedIds.has(b.id),
      firstClass: recent.includes(b.client_id) && !cameBefore.has(b.client_id),
      newMember: !!joined && joined >= daysBefore(14),
      healthNotes: profile?.health_notes?.trim() || null,
      injuryNotes: injuriesOf.get(b.client_id) ?? [],
      credits: balanceOf.has(b.client_id) ? balanceOf.get(b.client_id)! : null,
      onHold: onHold.has(b.client_id),
    };
  });
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
