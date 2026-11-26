import { describe, expect, it } from 'vitest';
import { toCsv } from './csv';
import {
  attendanceByWeek,
  attendanceCsv,
  classFill,
  classFillCsv,
  mondayOf,
  sessionBookings,
  slotLabel,
  waitlistCsv,
  waitlistDemand,
  type ClassReportRaw,
  type ReportClass,
} from './ownerClassReport';

// Thursday 26 Nov 2026. Monday classes ran on 2, 9, 16 and 23 Nov in the last 28 days (29 Oct to 25 Nov).
const monday: ReportClass = {
  id: 'mon6',
  gymId: 'g1',
  gymName: 'Salford Quays',
  name: 'Strength',
  dayOfWeek: 1,
  startTime: '06:00:00',
  specificDate: null,
  capacity: 10,
  retiredAt: null,
};
const saturday: ReportClass = { ...monday, id: 'sat9', name: 'Open gym', dayOfWeek: 6, startTime: '09:00:00', capacity: 20 };

const raw = (over: Partial<ClassReportRaw> = {}): ClassReportRaw => ({
  today: '2026-11-26',
  from: '2026-09-07',
  weeks: 12,
  classes: [monday, saturday],
  sessions: [],
  cancelled: [],
  weekMembers: [],
  ...over,
});

const session = (classId: string, date: string, booked: number, attended = 0, noShow = 0, waiting = 0, promoted = 0) => ({
  classId,
  date,
  booked,
  attended,
  noShow,
  waiting,
  promoted,
});

describe('slotLabel', () => {
  it('names the weekday, time and class, with the gym when asked', () => {
    expect(slotLabel(monday)).toBe('Mon 6:00am · Strength');
    expect(slotLabel(monday, true)).toBe('Salford Quays · Mon 6:00am · Strength');
    expect(slotLabel({ ...monday, specificDate: '2026-11-14', dayOfWeek: 6 })).toBe('Sat 14/11 6:00am · Strength');
  });
});

describe('sessionBookings', () => {
  it('turns counts into one booking each, attended first, then no-shows, then unmarked', () => {
    const b = sessionBookings([session('mon6', '2026-11-23', 4, 2, 1)]);
    expect(b).toHaveLength(4);
    expect(b.filter((x) => x.attended)).toHaveLength(2);
    expect(b.filter((x) => x.no_show)).toHaveLength(1);
    expect(b.filter((x) => !x.attended && !x.no_show)).toHaveLength(1);
  });
});

describe('classFill', () => {
  it('is places taken out of capacity × sessions that ran, over the last 28 days to yesterday', () => {
    const fill = classFill(
      raw({
        sessions: [
          session('mon6', '2026-11-02', 10, 9, 1),
          session('mon6', '2026-11-09', 8, 8),
          session('mon6', '2026-11-16', 6, 5),
          session('mon6', '2026-11-23', 6, 0),
          // outside the window: before it, and today (not over yet)
          session('mon6', '2026-10-26', 10, 10),
          session('mon6', '2026-11-26', 10),
        ],
      })
    );
    expect(fill.from).toBe('2026-10-29');
    expect(fill.to).toBe('2026-11-25');
    const mon = fill.rows.find((r) => r.slot === 'Mon 6:00am · Strength')!;
    expect(mon).toMatchObject({ sessions: 4, places: 40, taken: 30, fillPct: 75, marked: 23, attended: 22, camePct: 96 });
  });

  it("doesn't count a cancelled date as a session, and sorts the fullest first", () => {
    const fill = classFill(
      raw({
        sessions: [session('sat9', '2026-11-21', 20, 18), session('mon6', '2026-11-23', 2, 2)],
        cancelled: ['mon6|2026-11-02', 'mon6|2026-11-09', 'mon6|2026-11-16'],
      })
    );
    expect(fill.rows[0].slot).toBe('Sat 9:00am · Open gym');
    const mon = fill.rows.find((r) => r.slot.includes('Strength'))!;
    expect(mon.sessions).toBe(1);
    expect(mon.places).toBe(10);
    expect(mon.fillPct).toBe(20);
    // 4 Saturdays (31 Oct to 21 Nov) x 20 + 1 Monday x 10
    expect(fill.totals).toMatchObject({ sessions: 5, places: 90, taken: 22, fillPct: 24 });
  });

  it('says "Came" only when a coach marked something', () => {
    const fill = classFill(raw({ classes: [monday], sessions: [session('mon6', '2026-11-23', 3)] }));
    expect(fill.rows[0].camePct).toBeNull();
  });

  it('puts the gym in front of each class when the report covers more than one gym', () => {
    const other = { ...saturday, id: 'x', gymId: 'g2', gymName: 'Didsbury' };
    const fill = classFill(raw({ classes: [monday, other], sessions: [session('x', '2026-11-21', 1)] }));
    expect(fill.rows.map((r) => r.slot)).toContain('Didsbury · Sat 9:00am · Open gym');
  });

  it('makes a CSV with a row per class', () => {
    const fill = classFill(raw({ classes: [monday], sessions: [session('mon6', '2026-11-23', 5, 4, 1)] }));
    const csv = classFillCsv(fill);
    expect(toCsv(csv.headers, csv.rows).split(/\r?\n/)[0]).toBe('Class,Sessions,Places offered,Places taken,Fill %,Marked,Attended,Came % of marked');
    expect(csv.rows[0]).toEqual(['Mon 6:00am · Strength', 4, 40, 5, 13, 5, 4, 80]);
  });
});

describe('attendanceByWeek', () => {
  it('gives each week from Monday, oldest first, with this week counted to yesterday', () => {
    const weeks = attendanceByWeek(
      raw({
        weeks: 2,
        sessions: [
          session('mon6', '2026-11-16', 8, 6, 1),
          session('sat9', '2026-11-21', 10, 9),
          session('mon6', '2026-11-23', 7, 7),
        ],
        weekMembers: [
          { weekStart: '2026-11-16', members: 12 },
          { weekStart: '2026-11-23', members: 7 },
        ],
      })
    );
    expect(weeks.map((w) => w.weekStart)).toEqual(['2026-11-16', '2026-11-23']);
    expect(weeks[0]).toMatchObject({ current: false, sessions: 2, places: 30, taken: 18, fillPct: 60, attended: 15, noShows: 1, unmarked: 2, attendedPct: 94, members: 12 });
    // Mon 23 to Wed 25: only the Monday class ran so far
    expect(weeks[1]).toMatchObject({ current: true, sessions: 1, places: 10, taken: 7, attended: 7, noShows: 0, unmarked: 0, attendedPct: 100, members: 7 });
  });

  it('shows an empty current week on a Monday', () => {
    const weeks = attendanceByWeek(raw({ today: '2026-11-23', weeks: 1, sessions: [session('mon6', '2026-11-23', 5, 5)] }));
    expect(weeks).toEqual([
      { weekStart: '2026-11-23', current: true, sessions: 0, places: 0, taken: 0, fillPct: null, attended: 0, noShows: 0, unmarked: 0, attendedPct: null, members: 0 },
    ]);
  });

  it('makes a CSV with a row per week', () => {
    const weeks = attendanceByWeek(raw({ weeks: 1, classes: [monday], sessions: [session('mon6', '2026-11-23', 4, 3, 1)], weekMembers: [{ weekStart: '2026-11-23', members: 3 }] }));
    const csv = attendanceCsv(weeks);
    expect(csv.headers).toHaveLength(10);
    expect(csv.rows).toEqual([['2026-11-23', 1, 10, 4, 40, 3, 1, 0, 75, 3]]);
  });

  it('finds the Monday of any date', () => {
    expect(mondayOf('2026-11-26')).toBe('2026-11-23');
    expect(mondayOf('2026-11-23')).toBe('2026-11-23');
    expect(mondayOf('2026-11-29')).toBe('2026-11-23');
  });
});

describe('waitlistDemand', () => {
  it('counts who waited in the last 28 days, who got a place, who did not, and who is waiting now', () => {
    const rows = waitlistDemand(
      raw({
        sessions: [
          session('mon6', '2026-11-16', 10, 10, 0, 2, 1),
          session('mon6', '2026-11-23', 10, 9, 0, 0, 2),
          session('mon6', '2026-11-30', 10, 0, 0, 3, 0),
          session('sat9', '2026-11-21', 12, 12),
          // too long ago
          session('mon6', '2026-10-19', 10, 10, 0, 5, 0),
        ],
      })
    );
    expect(rows).toEqual([{ slot: 'Mon 6:00am · Strength', sessionsWithWaitlist: 2, waited: 5, gotPlace: 3, missedOut: 2, waitingNow: 3 }]);
    const csv = waitlistCsv(rows);
    expect(toCsv(csv.headers, csv.rows).split(/\r?\n/)[1]).toBe('Mon 6:00am · Strength,2,5,3,2,3');
  });

  it('is empty when nobody waited', () => {
    expect(waitlistDemand(raw({ sessions: [session('mon6', '2026-11-23', 10, 10)] }))).toEqual([]);
  });
});
