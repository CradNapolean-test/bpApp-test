import type { EventWithSignup } from '../data/types';

// The one event for the Home tile: the soonest that has not started yet, however far away. Null (tile hidden)
// when nothing is scheduled.
export function bannerEvent(events: EventWithSignup[], now: Date): EventWithSignup | null {
  const from = now.getTime();
  return (
    events
      .filter((e) => {
        const t = new Date(e.starts_at).getTime();
        return t >= from;
      })
      .sort((a, b) => a.starts_at.localeCompare(b.starts_at))[0] ?? null
  );
}
