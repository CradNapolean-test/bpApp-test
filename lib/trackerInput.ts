// What the Sleep, Steps and Water cards on the check-in do with the member's input (R12).
//
// Before: the slider saved on ANY key-up or pointer-up, even with no change. Pressing Tab to move focus onto the Sleep slider fired a
// key-up on it and wrote sleep = 0 (the screen still said "Not logged", but coach screens counted 0 as a real value). And a blank
// number box was ignored, so a logged value could be changed but never taken back.

// Whether the end of a slider interaction should be saved. `prev` is what was stored when the interaction started (null = not logged),
// `next` the value at the end, `touched` whether the slider actually changed during it (Tab, or a tap that did not move it, does not).
export function shouldCommit(prev: number | null, next: number | null, touched: boolean): boolean {
  if (!touched) return false;
  return next !== prev;
}

export type TypedInput = { action: 'ignore' } | { action: 'clear' } | { action: 'set'; value: number };

// Reads what was typed in the number box when it loses focus.
//  - blank means "clear this value" (saved as null), unless nothing was logged anyway;
//  - text that is not a number, or is negative, is ignored (the box goes back to what it was);
//  - the figure is read in the chosen unit, kept inside the limit, and rounded the way the slider rounds (whole steps, 2 decimals);
//  - the same figure as before is not a change.
export function interpretTyped(
  text: string,
  options: { current: number | null; max: number; whole: boolean; millilitres?: boolean }
): TypedInput {
  const cleaned = text.replace(/,/g, '').trim();
  if (cleaned === '') return options.current == null ? { action: 'ignore' } : { action: 'clear' };
  const typed = Number(cleaned);
  if (!Number.isFinite(typed) || typed < 0) return { action: 'ignore' };
  let value = options.millilitres ? typed / 1000 : typed;
  value = Math.max(0, Math.min(options.max, value));
  value = options.whole ? Math.round(value) : +value.toFixed(2);
  return value === options.current ? { action: 'ignore' } : { action: 'set', value };
}
