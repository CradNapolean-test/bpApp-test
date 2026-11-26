// Book on a laptop (BK26): the member's booking window in pages of seven days from today, so a whole week shows at a glance instead of
// one day at a time. The phone keeps its day strip.

export function weekPages(days: string[], size = 7): string[][] {
  const pages: string[][] = [];
  for (let i = 0; i < days.length; i += size) pages.push(days.slice(i, i + size));
  return pages;
}

// The page that holds a day (the day picked on the strip, say), or the first page.
export function pageOf(pages: string[][], iso: string | null | undefined): number {
  const i = iso ? pages.findIndex((p) => p.includes(iso)) : -1;
  return i < 0 ? 0 : i;
}

const short = (iso: string, month: boolean) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', ...(month ? { month: 'short' } : {}), timeZone: 'UTC' });

// "Thu 26 – Wed 2 Dec" ("Thu 26 Nov – Wed 2 Dec" across a month end), or one day's label for a page of one.
export function weekRangeLabel(page: string[]): string {
  if (page.length === 0) return '';
  const first = page[0];
  const last = page[page.length - 1];
  if (first === last) return short(first, true);
  return `${short(first, first.slice(0, 7) !== last.slice(0, 7))} – ${short(last, true)}`;
}
