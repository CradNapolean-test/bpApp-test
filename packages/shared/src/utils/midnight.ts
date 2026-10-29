// Milliseconds from `now` until the next midnight in a timezone, for screens that must move on to the new day by themselves (FT2). A phone
// left open overnight kept logging food on "yesterday" because the date was worked out once, when the screen opened.
//
// Worked out from the wall clock at that timezone, so it follows the gym or member's own calendar, not the browser's. A day that is 23 or
// 25 hours long (clocks changing) makes this a little early or late; the caller asks again when the timer fires, so it corrects itself.
export function msUntilNextMidnight(timezone: string, now: Date = new Date()): number {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: timezone, hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(now);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const secondsIntoDay = get('hour') * 3600 + get('minute') * 60 + get('second');
  return (86_400 - secondsIntoDay) * 1000 - now.getMilliseconds();
}
