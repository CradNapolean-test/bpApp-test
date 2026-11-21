// Swiping sideways on a screen that picks a day changes the day (21 Nov 2026), on the web and the phone alike: the finger moving to
// the left brings the next day, to the right the day before, as turning a page. A swipe does exactly what tapping that day on the
// screen's strip (or its arrow) does, so it never reaches a day the screen would not let the member tap. Only numbers here.
// The web has this file as lib/utils/daySwipe.ts and the phone as packages/shared/src/utils/daySwipe.ts: keep the two identical.

// How far the finger must travel sideways (CSS pixels on the web, points on the phone) before a swipe counts.
export const SWIPE_DISTANCE = 60;
// A swipe that starts this close to either side of the screen is left to the phone itself (Android's back gesture, Safari's swipe
// back), so going back never also changes the day.
export const SWIPE_EDGE = 24;

// 1 for the next day (finger moved left), -1 for the day before (finger moved right), 0 when it was not a sideways swipe: shorter
// than SWIPE_DISTANCE, or more than half as far up or down as sideways (a scroll that drifted).
export function swipeStep(dx: number, dy: number): -1 | 0 | 1 {
  if (!(Math.abs(dx) >= SWIPE_DISTANCE) || Math.abs(dy) * 2 > Math.abs(dx)) return 0;
  return dx < 0 ? 1 : -1;
}

// Whether a touch at `x` across a screen `width` wide began in the strip at either side that belongs to the phone.
export function startsAtEdge(x: number, width: number): boolean {
  return x < SWIPE_EDGE || x > width - SWIPE_EDGE;
}

// The days either side of the one picked on a strip's days (oldest first): null past either end, or for both when the day picked is
// not on the strip.
export function neighbourDays(days: readonly string[], selected: string): { previous: string | null; next: string | null } {
  const i = days.indexOf(selected);
  if (i < 0) return { previous: null, next: null };
  return { previous: i > 0 ? days[i - 1] : null, next: i < days.length - 1 ? days[i + 1] : null };
}
