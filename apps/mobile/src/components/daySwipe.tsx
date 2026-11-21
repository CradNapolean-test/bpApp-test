import { createContext, useContext, useRef, useState, type PropsWithChildren } from 'react';
import { View, useWindowDimensions, type GestureResponderEvent } from 'react-native';

import { neighbourDays, startsAtEdge, swipeStep } from '@ballistic/shared/utils/daySwipe';

// Swiping sideways on a screen that picks a day changes the day (21 Nov 2026): Book, the food diary (full, typed totals and the photo
// diary) and the daily check-in. The rule is @ballistic/shared/utils/daySwipe, the web's too (app/_components/useDaySwipe.ts): the
// finger moving left brings the next day, right the day before, and a swipe does what tapping that day (or the arrow) does.
//
// ScrollScreen wraps its scrolling content in a DaySwipeArea when given `swipe`. Up-and-down still scrolls; the sliders on the check-in
// keep their drag (they never let the touch go); and a row that scrolls sideways itself (the day strip, the page's tabs) calls the
// guard from useDaySwipeGuard as a touch starts on it, so that touch is never a day swipe. A screen reader's swipes are its own.

export interface DaySwipe {
  previous?: (() => void) | null;
  next?: (() => void) | null;
}

// The days either side of the one picked on a strip, each as a tap on it would pick it.
export function stripSwipe(days: readonly string[], selected: string, pick: (iso: string) => void): DaySwipe {
  const { previous, next } = neighbourDays(days, selected);
  return { previous: previous ? () => pick(previous) : null, next: next ? () => pick(next) : null };
}

const GuardContext = createContext<(() => void) | undefined>(undefined);

// For a row that scrolls sideways: pass it as the row's onTouchStart. Outside a swipe area it is undefined, and nothing changes.
export function useDaySwipeGuard(): (() => void) | undefined {
  return useContext(GuardContext);
}

// How far sideways (points) a drag goes before the screen takes it from a button under the finger; the swipe itself still needs
// SWIPE_DISTANCE when the finger lifts.
const CLAIM = 12;

export function DaySwipeArea({ swipe, children }: PropsWithChildren<{ swipe: DaySwipe }>) {
  const { width } = useWindowDimensions();
  // Where this touch went down, or null when it can't be a swipe: it began at the side of the screen (the phone's back gesture) or
  // on a row that scrolls sideways (the guard), or a second finger came down.
  const start = useRef<{ x: number; y: number } | null>(null);
  const [guard] = useState(() => () => {
    start.current = null;
  });
  const moved = (e: GestureResponderEvent) => {
    const from = start.current;
    return from ? { dx: e.nativeEvent.pageX - from.x, dy: e.nativeEvent.pageY - from.y } : null;
  };

  // Drawn with the responder system (as the check-in's slider is): a child that holds on to its touch (the slider) keeps it, and a
  // button under the finger lets the screen have it once the drag is clearly sideways.
  return (
    <GuardContext.Provider value={guard}>
      <View
        style={{ flex: 1 }}
        // Runs before anything inside sees the touch, so the guard (a row's own onTouchStart) comes after it.
        onTouchStartCapture={(e) => {
          const { touches, pageX, pageY } = e.nativeEvent;
          start.current = touches.length <= 1 && !startsAtEdge(pageX, width) ? { x: pageX, y: pageY } : null;
        }}
        onMoveShouldSetResponder={(e) => {
          const move = moved(e);
          if (!move || e.nativeEvent.touches.length > 1 || (!swipe.previous && !swipe.next)) return false;
          return Math.abs(move.dx) > CLAIM && Math.abs(move.dx) > 2 * Math.abs(move.dy);
        }}
        // A scroll that starts after all (or anything else that asks) takes the touch, and then it is not a swipe.
        onResponderTerminationRequest={() => true}
        onResponderRelease={(e) => {
          const move = moved(e);
          start.current = null;
          const step = move ? swipeStep(move.dx, move.dy) : 0;
          (step === 1 ? swipe.next : step === -1 ? swipe.previous : null)?.();
        }}
        onResponderTerminate={() => {
          start.current = null;
        }}>
        {children}
      </View>
    </GuardContext.Provider>
  );
}
