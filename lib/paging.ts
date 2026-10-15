// Two kinds of paging for the coach screens (CP1/SP1, CM6).

// ---- Reading every row of a big query ----
// The database hands back at most 1,000 rows per request and says nothing when it stops there, so a gym with more members than that
// silently lost the rest from every list. This reads page after page until a short page comes back.
export const DB_PAGE_SIZE = 1000;

export interface PageResult<T> {
  data: T[] | null;
  error: { message?: string } | null;
}

export async function fetchAllPages<T>(
  fetchPage: (from: number, to: number) => PromiseLike<PageResult<T>>,
  options: { pageSize?: number; maxRows?: number } = {}
): Promise<{ rows: T[]; error: { message?: string } | null; truncated: boolean }> {
  const pageSize = options.pageSize ?? DB_PAGE_SIZE;
  const maxRows = options.maxRows ?? 50_000;
  const rows: T[] = [];
  for (let from = 0; from < maxRows; from += pageSize) {
    const { data, error } = await fetchPage(from, from + pageSize - 1);
    if (error) return { rows, error, truncated: false };
    const page = data ?? [];
    rows.push(...page);
    if (page.length < pageSize) return { rows, error: null, truncated: false };
  }
  // A full page every time up to the cap: there may be more, and the caller can say so rather than pretend this is everyone.
  return { rows, error: null, truncated: true };
}

// ---- Showing a long list a bit at a time ----
// A list of 90 members drew about 2,900 elements and 345 KB of HTML. The screen shows the first few and a "Show more" button.
export const LIST_STEP = 50;

export function visibleCount(total: number, requested: number, step: number = LIST_STEP): number {
  const asked = Math.max(requested, step);
  return Math.min(total, asked);
}

export function showMore(current: number, total: number, step: number = LIST_STEP): number {
  return visibleCount(total, current + step, step);
}

export function remainingAfter(total: number, shown: number): number {
  return Math.max(0, total - shown);
}
