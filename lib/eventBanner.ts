import type { EventWithSignup } from '@/lib/data/types';

export const EVENT_BANNER_DAYS = 14;

// The one event worth a banner on Home: the soonest that has not started yet and is within the window.
export function bannerEvent(events: EventWithSignup[], now: Date, withinDays = EVENT_BANNER_DAYS): EventWithSignup | null {
  const from = now.getTime();
  const to = from + withinDays * 86_400_000;
  return (
    events
      .filter((e) => {
        const t = new Date(e.starts_at).getTime();
        return t >= from && t <= to;
      })
      .sort((a, b) => a.starts_at.localeCompare(b.starts_at))[0] ?? null
  );
}
