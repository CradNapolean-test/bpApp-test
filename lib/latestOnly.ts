// "Only the latest request wins" for screens where a click starts a fetch and a second click can start another before the first
// comes back. Server actions run one at a time, so the FIRST response always arrives after the second click: without a guard the
// screen headed with the second person shows the first person's data (the coach inbox showed one member's reply in another
// member's conversation).
//
//   const guard = createLatestOnly();
//   const ticket = guard.next();            // at the start of every request
//   const result = await load(id);
//   if (!guard.isCurrent(ticket)) return;   // a newer request has started: drop this answer
//   apply(result);
//
// Calling next() without making a request also cancels whatever is in flight (for example when the selection is cleared).
export interface LatestOnly {
  next(): number;
  isCurrent(ticket: number): boolean;
}

export function createLatestOnly(): LatestOnly {
  let current = 0;
  return {
    next: () => {
      current += 1;
      return current;
    },
    isCurrent: (ticket) => ticket === current,
  };
}
