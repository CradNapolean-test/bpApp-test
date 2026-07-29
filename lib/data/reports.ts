'use server';

import { createClient } from '@/lib/supabase/server';
import type { CoachReport } from './types';

const WINDOW_DAYS = 30;

export async function getCoachReport(): Promise<CoachReport> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data: classes, error: classesError } = await supabase
    .from('classes')
    .select('id, name')
    .eq('coach_id', user.id);
  if (classesError) throw classesError;
  if (!classes || classes.length === 0) {
    return { attendanceRate: null, totalBooked: 0, totalAttended: 0, noShows: [], classPopularity: [] };
  }
  const classMap = new Map(classes.map((c) => [c.id, c.name]));

  const since = new Date();
  since.setUTCDate(since.getUTCDate() - WINDOW_DAYS);
  const sinceIso = since.toISOString().slice(0, 10);
  const todayIso = new Date().toISOString().slice(0, 10);

  const { data: bookings, error: bookingsError } = await supabase
    .from('bookings')
    .select('id, class_id, client_id, booking_date, status, attended')
    .in(
      'class_id',
      classes.map((c) => c.id)
    )
    .gte('booking_date', sinceIso)
    .neq('status', 'cancelled');
  if (bookingsError) throw bookingsError;

  const rows = bookings ?? [];
  const pastBooked = rows.filter((b) => b.status === 'booked' && b.booking_date <= todayIso);
  const totalBooked = pastBooked.length;
  const totalAttended = pastBooked.filter((b) => b.attended).length;
  const attendanceRate = totalBooked > 0 ? Math.round((totalAttended / totalBooked) * 100) : null;

  const noShowRows = pastBooked.filter((b) => !b.attended);
  const clientIds = [...new Set(noShowRows.map((b) => b.client_id))];
  let nameMap = new Map<string, string>();
  if (clientIds.length > 0) {
    const { data: profiles } = await supabase
      .from('client_profiles')
      .select('client_id, name')
      .in('client_id', clientIds);
    nameMap = new Map((profiles ?? []).map((p) => [p.client_id, p.name]));
  }
  const noShows = noShowRows.map((b) => ({
    clientName: nameMap.get(b.client_id) ?? 'Unknown',
    className: classMap.get(b.class_id) ?? 'Unknown class',
    date: b.booking_date,
  }));

  const popularityMap = new Map<string, number>();
  for (const b of rows) {
    popularityMap.set(b.class_id, (popularityMap.get(b.class_id) ?? 0) + 1);
  }
  const classPopularity = [...popularityMap.entries()]
    .map(([classId, count]) => ({ className: classMap.get(classId) ?? 'Unknown class', bookingCount: count }))
    .sort((a, b) => b.bookingCount - a.bookingCount);

  return { attendanceRate, totalBooked, totalAttended, noShows, classPopularity };
}
