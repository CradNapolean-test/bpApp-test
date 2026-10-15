// When scheduled and repeating broadcasts actually go out (CM1, DECISION D11). The daily job runs at 05:00 UTC; on Vercel's Hobby plan it can
// start any time in the hour after that. Default (D11): keep one daily run, and tell the coach plainly instead of letting them think a
// message set for 9 am goes at 9 am. If the plan is upgraded and the schedule in vercel.json changes, change the constant too.

export const COMMUNICATIONS_RUN_HOUR_UTC = 5;

// The next time the daily job is due after `now`.
export function nextRunAt(now: Date = new Date()): Date {
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), COMMUNICATIONS_RUN_HOUR_UTC, 0, 0);
  return new Date(today > now.getTime() ? today : today + 24 * 60 * 60 * 1000);
}

// "goes out at the next daily run (about 6 am UK time, tomorrow)". `after` is the time the message is set for (the run picks up anything whose
// time has passed); it defaults to now, for a message sent straight away that still waits for a run.
export function nextRunLabel(now: Date = new Date(), after: Date = now): string {
  const run = nextRunAt(after);
  const hour = Number(new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hour12: false, timeZone: 'Europe/London' }).format(run)) % 24;
  const clock = hour === 0 ? '12 am' : hour < 12 ? `${hour} am` : hour === 12 ? '12 pm' : `${hour - 12} pm`;
  const dayDiff = Math.round(
    (Date.UTC(run.getUTCFullYear(), run.getUTCMonth(), run.getUTCDate()) - Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())) / 86_400_000
  );
  const day =
    dayDiff <= 0
      ? 'today'
      : dayDiff === 1
        ? 'tomorrow'
        : `on ${run.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Europe/London' })}`;
  return `goes out at the next daily run (about ${clock} UK time, ${day})`;
}
