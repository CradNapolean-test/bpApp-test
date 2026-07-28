'use server';

import { createClient } from '@/lib/supabase/server';
import { addDays, nextDateForWeekday, toIsoDate } from '@/lib/utils/dates';
import type { BookingRow, ClassRow, CreditsLedgerRow, RosterEntry, ScheduleOccurrence } from './types';

export async function getClasses(): Promise<ClassRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('classes')
    .select('*')
    .order('day_of_week')
    .order('start_time');
  if (error) throw error;
  return data ?? [];
}

export async function createClass(fields: Omit<ClassRow, 'id' | 'coach_id'>): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { error } = await supabase.from('classes').insert({ ...fields, coach_id: user.id });
  if (error) throw error;
}

export async function deleteClass(classId: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from('classes').delete().eq('id', classId);
  if (error) throw error;
}

export async function getUpcomingBookings(clientId: string): Promise<BookingRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('bookings')
    .select('*, class:classes(*)')
    .eq('client_id', clientId)
    .neq('status', 'cancelled')
    .order('booking_date');
  if (error) throw error;
  return (data ?? []) as unknown as BookingRow[];
}

export async function bookClass(classId: string, bookingDate: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.rpc('book_class', {
    p_class_id: classId,
    p_booking_date: bookingDate,
  });
  if (error) throw error;
}

export async function cancelBooking(bookingId: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.rpc('cancel_booking', { p_booking_id: bookingId });
  if (error) throw error;
}

export async function getCreditsBalance(clientId: string): Promise<number> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('credits_balance')
    .select('balance')
    .eq('client_id', clientId)
    .maybeSingle();
  if (error) throw error;
  return data?.balance ?? 0;
}

export async function getCreditsLedger(clientId: string): Promise<CreditsLedgerRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('credits_ledger')
    .select('*')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false });
  if (error) throw error;
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
  if (error) throw error;
}

// Upcoming occurrences of the calling coach's own recurring classes (day_of_week-based,
// not stored as individual rows), merged with how many are already booked. Filters to
// the caller's own classes via coach_id — matches the authorization the mark_attendance
// RPC itself enforces, rather than relying on that as the only guard.
export async function getScheduleOccurrences(weeksAhead = 3): Promise<ScheduleOccurrence[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data: classes, error: classesError } = await supabase
    .from('classes')
    .select('*')
    .eq('coach_id', user.id);
  if (classesError) throw classesError;

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
  if (bookingsError) throw bookingsError;

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
    .select('id, client_id, status, attended')
    .eq('class_id', classId)
    .eq('booking_date', date)
    .neq('status', 'cancelled')
    .order('created_at');
  if (error) throw error;
  if (!bookings || bookings.length === 0) return [];

  const clientIds = bookings.map((b) => b.client_id);
  const { data: profiles, error: profilesError } = await supabase
    .from('client_profiles')
    .select('client_id, name')
    .in('client_id', clientIds);
  if (profilesError) throw profilesError;

  const nameMap = new Map((profiles ?? []).map((p) => [p.client_id, p.name]));

  return bookings.map((b) => ({
    bookingId: b.id,
    clientId: b.client_id,
    clientName: nameMap.get(b.client_id) ?? 'Unknown',
    status: b.status,
    attended: b.attended,
  }));
}

export async function markAttendance(bookingId: string, attended: boolean): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.rpc('mark_attendance', {
    p_booking_id: bookingId,
    p_attended: attended,
  });
  if (error) throw error;
}
