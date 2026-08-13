'use server';

import { raise } from './errors';
import { fail, ok, type ActionResult } from './result';
import { resolveScopingCoachId } from './coach';
import { createClient } from '@/lib/supabase/server';
import { addDays, nextDateForWeekday, toIsoDate } from '@/lib/utils/dates';
import type { AttendanceStatus, BookingRow, ClassRow, CreditsLedgerRow, RosterEntry, ScheduleOccurrence } from './types';

export async function getClasses(): Promise<ClassRow[]> {
  const supabase = await createClient();
  const coachId = await resolveScopingCoachId(supabase);
  const { data, error } = await supabase
    .from('classes')
    .select('*')
    .eq('coach_id', coachId)
    .order('day_of_week')
    .order('start_time');
  if (error) raise(error);
  return data ?? [];
}

export async function createClass(
  fields: Omit<ClassRow, 'id' | 'coach_id' | 'linked_day_position'>
): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { error } = await supabase.from('classes').insert({ ...fields, coach_id: user.id });
  if (error) raise(error);
}

// Creates one class row per {day_of_week, start_time} occurrence, sharing every other
// field -- lets a coach set up "Yoga, Mon/Wed/Fri 6am" in one submit instead of three.
// linked_day_position isn't set at creation -- a class starts unlinked and a coach links it
// afterward per-row (see updateClass), since it's usually decided once the workout program
// structure exists, not while first setting up the class schedule.
export async function createClasses(
  shared: Omit<ClassRow, 'id' | 'coach_id' | 'day_of_week' | 'start_time' | 'linked_day_position'>,
  occurrences: { day_of_week: number; start_time: string }[]
): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const rows = occurrences.map((occ) => ({ ...shared, ...occ, coach_id: user.id }));
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
  fields: Partial<
    Pick<ClassRow, 'linked_day_position' | 'name' | 'day_of_week' | 'start_time' | 'capacity' | 'credit_cost' | 'cutoff_hours' | 'coach_note'>
  >
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

export async function grantCredits(clientId: string, delta: number, reason: string): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { error } = await supabase
    .from('credits_ledger')
    .insert({ client_id: clientId, delta, reason, granted_by: user.id });
  if (error) raise(error);
}

// Upcoming occurrences of every recurring class (day_of_week-based, not stored as
// individual rows), merged with how many are already booked. Called by both the coach
// (Take Attendance) and clients (booking calendar) -- resolveScopingCoachId figures out
// which coach's classes apply either way.
export async function getScheduleOccurrences(weeksAhead = 3): Promise<ScheduleOccurrence[]> {
  const supabase = await createClient();
  const coachId = await resolveScopingCoachId(supabase);

  const { data: classes, error: classesError } = await supabase
    .from('classes')
    .select('*')
    .eq('coach_id', coachId);
  if (classesError) raise(classesError);

  const occurrences: Omit<ScheduleOccurrence, 'bookedCount'>[] = [];
  for (const c of classes ?? []) {
    if (c.day_of_week == null) continue;
    const firstDate = new Date(nextDateForWeekday(c.day_of_week) + 'T00:00:00Z');
    for (let w = 0; w < weeksAhead; w++) {
      occurrences.push({
        classId: c.id,
        className: c.name,
        date: toIsoDate(addDays(firstDate, w * 7)),
        startTime: c.start_time,
        capacity: c.capacity,
        creditCost: c.credit_cost,
        linkedDayPosition: c.linked_day_position,
      });
    }
  }
  if (occurrences.length === 0) return [];

  const dates = [...new Set(occurrences.map((o) => o.date))];
  const classIds = [...new Set(occurrences.map((o) => o.classId))];
  const { data: bookings, error: bookingsError } = await supabase
    .from('bookings')
    .select('class_id, booking_date')
    .in('class_id', classIds)
    .in('booking_date', dates)
    .eq('status', 'booked');
  if (bookingsError) raise(bookingsError);

  const countMap = new Map<string, number>();
  for (const b of bookings ?? []) {
    const key = `${b.class_id}|${b.booking_date}`;
    countMap.set(key, (countMap.get(key) ?? 0) + 1);
  }

  return occurrences
    .map((o) => ({ ...o, bookedCount: countMap.get(`${o.classId}|${o.date}`) ?? 0 }))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
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
