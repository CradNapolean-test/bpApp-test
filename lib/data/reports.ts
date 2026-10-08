'use server';

import { raise } from './errors';
import { resolveScopingGymId } from './coach';
import { createClient } from '@/lib/supabase/server';
import { formatClassTime, WEEKDAY_SHORT } from '@/lib/utils/dates';
import type { CoachReport } from './types';

const DEFAULT_WINDOW_DAYS = 30;

// Gym-wide, not just this coach's own classes -- the timetable is a single shared schedule
// across every coach at the gym now, so a report scoped to "classes I personally created"
// would silently exclude classes a colleague set up. A "just me" filter can be added later if
// wanted; this matches what ClassManager/AttendanceScheduler already show.
// `windowDays` is how far back to look; `offsetDays` slides the whole window back (to get the period before, for
// comparing). Defaults give the last 30 days.
export async function getCoachReport(windowDays = DEFAULT_WINDOW_DAYS, offsetDays = 0): Promise<CoachReport> {
  const supabase = await createClient();
  const gymId = await resolveScopingGymId(supabase);

  const { data: classes, error: classesError } = await supabase
    .from('classes')
    .select('id, name, day_of_week, start_time, specific_date')
    .eq('gym_id', gymId);
  if (classesError) raise(classesError);
  if (!classes || classes.length === 0) {
    return {
      attendanceRate: null,
      totalBooked: 0,
      totalAttended: 0,
      unmarked: 0,
      noShowRate: null,
      avgClassesPerClient: null,
      activeBookings: 0,
      noShows: [],
      classPopularity: [],
    };
  }
  const classMap = new Map(classes.map((c) => [c.id, c.name]));
  // Each class row is one weekly slot (a day and a time), so several rows share a name. Popularity
  // is counted per slot and must be labelled with the day and time, or every row just repeats the
  // class name.
  const slotLabel = new Map(
    classes.map((c) => [
      c.id,
      c.day_of_week != null && c.start_time
        ? `${c.specific_date ? `${WEEKDAY_SHORT[c.day_of_week]} ${c.specific_date.slice(8)}/${c.specific_date.slice(5, 7)}` : WEEKDAY_SHORT[c.day_of_week]} ${formatClassTime(c.start_time)} · ${c.name}`
        : c.name,
    ])
  );

  const since = new Date();
  since.setUTCDate(since.getUTCDate() - offsetDays - windowDays);
  const sinceIso = since.toISOString().slice(0, 10);
  const until = new Date();
  until.setUTCDate(until.getUTCDate() - offsetDays);
  const untilIso = until.toISOString().slice(0, 10);
  const todayIso = new Date().toISOString().slice(0, 10);

  const { data: bookings, error: bookingsError } = await supabase
    .from('bookings')
    .select('id, class_id, client_id, booking_date, status, attended, no_show')
    .in(
      'class_id',
      classes.map((c) => c.id)
    )
    .gte('booking_date', sinceIso)
    .lte('booking_date', offsetDays > 0 ? untilIso : '9999-12-31')
    .neq('status', 'cancelled');
  if (bookingsError) raise(bookingsError);

  const rows = bookings ?? [];
  // Sessions before today, plus today's once they've been marked -- a session later today hasn't
  // happened yet, so it isn't "not marked", it's just not over. Matches the Attendance tab's
  // "needs marking" list (which only counts days before today).
  const pastBooked = rows.filter(
    (b) => b.status === 'booked' && (b.booking_date < todayIso || (b.booking_date === todayIso && (b.attended || b.no_show)))
  );
  const totalBooked = pastBooked.length;
  const totalAttended = pastBooked.filter((b) => b.attended).length;
  // Only sessions the coach has actually marked count towards the rates. Counting unmarked ones as
  // absences made the attendance rate read 0% for a coach who simply hadn't got round to marking.
  const marked = pastBooked.filter((b) => b.attended || b.no_show);
  const unmarked = totalBooked - marked.length;
  const attendanceRate = marked.length > 0 ? Math.round((totalAttended / marked.length) * 100) : null;
  const noShowRate = marked.length > 0 ? Math.round((pastBooked.filter((b) => b.no_show).length / marked.length) * 100) : null;
  const uniqueClientCount = new Set(pastBooked.map((b) => b.client_id)).size;
  const avgClassesPerClient = uniqueClientCount > 0 ? Math.round((totalBooked / uniqueClientCount) * 10) / 10 : null;

  const { count: activeBookings, error: activeError } = await supabase
    .from('bookings')
    .select('id', { count: 'exact', head: true })
    .in(
      'class_id',
      classes.map((c) => c.id)
    )
    .eq('status', 'booked')
    .gte('booking_date', todayIso);
  if (activeError) raise(activeError);

  // Genuinely marked no-show, not just "not yet marked" -- a past booking the coach hasn't
  // gotten to yet used to count as a no-show here (`!b.attended` is true for both), inflating
  // the count for any class the coach was simply behind on marking.
  const noShowRows = pastBooked.filter((b) => b.no_show);
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
    clientId: b.client_id,
    clientName: nameMap.get(b.client_id) ?? 'Unknown',
    className: classMap.get(b.class_id) ?? 'Unknown class',
    date: b.booking_date,
  }));

  const popularityMap = new Map<string, { count: number; attended: number }>();
  for (const b of rows) {
    const cur = popularityMap.get(b.class_id) ?? { count: 0, attended: 0 };
    cur.count += 1;
    if (b.attended) cur.attended += 1;
    popularityMap.set(b.class_id, cur);
  }
  const classPopularity = [...popularityMap.entries()]
    .map(([classId, v]) => ({ className: slotLabel.get(classId) ?? 'Unknown class', bookingCount: v.count, attended: v.attended }))
    .sort((a, b) => b.bookingCount - a.bookingCount);

  return {
    attendanceRate,
    totalBooked,
    totalAttended,
    unmarked,
    noShowRate,
    avgClassesPerClient,
    activeBookings: activeBookings ?? 0,
    noShows,
    classPopularity,
  };
}

// The chosen period and the same-length period before it, so the screen can say "up 4 points on last time".
export async function getCoachReports(windowDays: number): Promise<{ current: CoachReport; previous: CoachReport }> {
  const [current, previous] = await Promise.all([getCoachReport(windowDays, 0), getCoachReport(windowDays, windowDays)]);
  return { current, previous };
}
