import type { PushPayload } from './push';

// The push a member gets when a coach cancels a session (from CM3). It is the most time-critical message a gym sends, and until now it
// reached members only inside the app. Pure, so the wording is tested.

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// '18:00:00' -> '6 pm', '07:30' -> '7:30 am', '12:00' -> '12 pm', '00:15' -> '12:15 am'.
export function clockLabel(time: string): string {
  const match = /^(\d{1,2}):(\d{2})/.exec(time);
  if (!match) return time;
  const hour = Number(match[1]);
  const minutes = match[2];
  const suffix = hour >= 12 ? 'pm' : 'am';
  const twelve = hour % 12 === 0 ? 12 : hour % 12;
  return minutes === '00' ? `${twelve} ${suffix}` : `${twelve}:${minutes} ${suffix}`;
}

// "Strength & Conditioning on Friday 6 pm"
export function sessionLabel(className: string, dateIso: string, startTime: string | null): string {
  const day = WEEKDAYS[new Date(`${dateIso}T00:00:00Z`).getUTCDay()] ?? dateIso;
  return `${className} on ${day}${startTime ? ` ${clockLabel(startTime)}` : ''}`;
}

export function classCancelPayload(input: {
  className: string;
  date: string;
  startTime: string | null;
  // A booked member had a credit taken and gets it back; someone on the waiting list never paid.
  refunded: boolean;
  reason?: string | null;
}): PushPayload {
  const reason = input.reason?.trim();
  const tail = `${input.refunded ? '; your credit was refunded' : ''}.${reason ? ` ${reason.length > 80 ? `${reason.slice(0, 77)}...` : reason}` : ''}`;
  return {
    title: 'Class cancelled',
    body: `${sessionLabel(input.className, input.date, input.startTime)} is cancelled${tail}`,
    url: '/dashboard?open=book',
    // A second cancellation of the same session (say, with a reason added) replaces the first on the phone.
    tag: `class-cancelled-${input.date}-${input.className}`.slice(0, 80),
  };
}

export interface AffectedBooking {
  client_id: string;
  status: 'booked' | 'waitlist' | string;
}

// One entry per person: someone with both a booked and a waitlist row (not normally possible) counts as booked.
export function affectedMembers(rows: AffectedBooking[]): { clientId: string; refunded: boolean }[] {
  const byClient = new Map<string, boolean>();
  for (const r of rows) {
    if (r.status !== 'booked' && r.status !== 'waitlist') continue;
    byClient.set(r.client_id, (byClient.get(r.client_id) ?? false) || r.status === 'booked');
  }
  return [...byClient].map(([clientId, refunded]) => ({ clientId, refunded }));
}
