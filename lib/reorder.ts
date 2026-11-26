// Moving one item of an ordered list (a course module's lessons, LB18): by dragging it to another place, or one step with a button or the
// keyboard. Returns a new array; an index outside the list, or a move to where it already is, returns the list unchanged (same order).

export function moveTo<T>(items: readonly T[], from: number, to: number): T[] {
  if (from < 0 || from >= items.length || to < 0 || to >= items.length || from === to) return [...items];
  const next = [...items];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

export function moveBy<T>(items: readonly T[], index: number, step: number): T[] {
  return moveTo(items, index, Math.min(items.length - 1, Math.max(0, index + step)));
}

// Whether two orders are the same (a drop where it was picked up saves nothing).
export function sameOrder<T>(a: readonly T[], b: readonly T[]): boolean {
  return a.length === b.length && a.every((x, i) => x === b[i]);
}
