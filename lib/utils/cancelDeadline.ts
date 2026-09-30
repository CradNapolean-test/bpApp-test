// Client-side mirror of the SQL function class_cancel_deadline (migration 0064): a session can
// be cancelled for a refund until (start - cutoff hours); if that moment falls inside the
// blackout window (default 23:00-05:00) the deadline moves back to the window's start, so an
// early-morning session must be cancelled the evening before. Used only to *show* the rule and
// warn before a late cancel -- the database is what actually decides refunds.
//
// Everything here is wall-clock time at the gym (no timezone maths), which is what class start
// times are stored as.

const MIN = 60_000;

function parseTime(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return (h * 60 + (m || 0)) * MIN;
}

function inBlackout(todMs: number, start: number, end: number): boolean {
  return start > end ? todMs >= start || todMs < end : todMs >= start && todMs < end;
}

export interface CancelDeadline {
  // Wall-clock deadline, encoded as UTC ms of the local date/time (compare with nowLocalMs).
  deadlineMs: number;
  // 'HH:MM' of the deadline and whether it falls on the evening before the session's date.
  time: string;
  dayBefore: boolean;
}

export function cancelDeadline(
  dateIso: string,
  startTime: string | null,
  cutoffHours: number,
  blackoutStart: string | null,
  blackoutEnd: string | null
): CancelDeadline {
  const sessionMs = Date.parse(`${dateIso}T00:00:00Z`) + parseTime(startTime ?? '00:00');
  let deadlineMs = sessionMs - cutoffHours * 60 * MIN;

  if (blackoutStart && blackoutEnd) {
    const bs = parseTime(blackoutStart);
    const be = parseTime(blackoutEnd);
    const dayStart = Math.floor(deadlineMs / (24 * 60 * MIN)) * 24 * 60 * MIN;
    const tod = deadlineMs - dayStart;
    if (inBlackout(tod, bs, be)) {
      deadlineMs = tod >= bs || bs <= be ? dayStart + bs : dayStart - 24 * 60 * MIN + bs;
    }
  }

  const d = new Date(deadlineMs);
  const time = `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
  const deadlineDay = Math.floor(deadlineMs / (24 * 60 * MIN));
  const sessionDay = Math.floor(sessionMs / (24 * 60 * MIN));
  return { deadlineMs, time, dayBefore: deadlineDay < sessionDay };
}

export function formatClock(time24: string): string {
  const [h, m] = time24.split(':').map(Number);
  const suffix = h >= 12 ? 'pm' : 'am';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${h12}${suffix}` : `${h12}:${String(m).padStart(2, '0')}${suffix}`;
}

export function cancelNote(deadline: CancelDeadline): string {
  return deadline.dayBefore
    ? `Cancel by ${formatClock(deadline.time)} the night before to keep your credit`
    : `Cancel by ${formatClock(deadline.time)} to keep your credit`;
}

// "Now" as wall-clock ms in the given IANA timezone, for comparing against deadlineMs.
export function nowLocalMs(timeZone: string, now: Date = new Date()): number {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(now);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  return Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'));
}
