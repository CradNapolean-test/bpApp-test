// Words on the member's Book screen that depend on a number: a place on a waitlist (BK5) and the credits a cancel gives back or keeps
// (BK7). Only words here. The phone's Book tab is to use the same words once its redesign is out (copy this file to packages/shared then).

// 1st, 2nd, 3rd, 4th ... 11th, 12th, 13th ... 21st, 22nd, 23rd ... 101st, 111th.
export function ordinal(n: number): string {
  const whole = Math.max(0, Math.trunc(n));
  const lastTwo = whole % 100;
  const last = whole % 10;
  const suffix = lastTwo >= 11 && lastTwo <= 13 ? 'th' : last === 1 ? 'st' : last === 2 ? 'nd' : last === 3 ? 'rd' : 'th';
  return `${whole}${suffix}`;
}

// "2nd in the queue", from my_waitlist_places (migration 0177). Nothing when the place is not known (the function is not there yet, or
// the waitlist place was not read), so the screen shows "On the waitlist" alone as before.
export function waitlistPlaceText(place: number | null | undefined): string | null {
  if (place == null || !Number.isFinite(place) || place < 1) return null;
  return `${ordinal(place)} in the queue`;
}

export interface CancelCreditWords {
  // The cancel sheet's row: "Your credit" / "Your 2 credits"; null for a session that costs nothing.
  rowLabel: string | null;
  refunded: string;
  notRefunded: string;
  // The line under the sheet's rows.
  inTime: string;
  late: string;
  promotedLate: string;
  // The line under a booking in My bookings.
  lateNote: string;
  promotedNote: string;
}

// What the cancel sheet and My bookings say about the credits for one booking, by what the session costs (BK7: it said "Your credit"
// even when a session costs 2).
export function cancelCreditWords(cost: number | null | undefined): CancelCreditWords {
  const n = Math.max(0, Math.round(Number(cost ?? 1)));
  if (n === 0) {
    return {
      rowLabel: null,
      refunded: 'Nothing to refund',
      notRefunded: 'Nothing to refund',
      inTime: 'This session is free, so you can cancel any time before it starts.',
      late: 'This session is free, so you can still cancel.',
      promotedLate: 'This session is free, so you can cancel any time before it starts.',
      lateNote: 'Past the cancel deadline. This session is free, so nothing is lost',
      promotedNote: 'You came off the waitlist after the cancel deadline. This session is free, so nothing is lost',
    };
  }
  const yours = n === 1 ? 'your credit' : `your ${n} credits`;
  const it = n === 1 ? 'it' : 'they';
  return {
    rowLabel: n === 1 ? 'Your credit' : `Your ${n} credits`,
    refunded: 'Refunded',
    notRefunded: 'Not refunded',
    inTime: `You can cancel now and get ${yours} back.`,
    late: `It's too close to the session to get ${yours} back. You can still cancel, but ${it} won't be refunded.`,
    promotedLate: `You came off the waitlist after the cancel deadline, so you get ${yours} back if you cancel any time before it starts.`,
    lateNote: `Past the cancel deadline — cancelling now forfeits ${yours}`,
    promotedNote: `You came off the waitlist after the cancel deadline: cancel any time before it starts to get ${yours} back`,
  };
}
