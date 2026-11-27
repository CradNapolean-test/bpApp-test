// The Library's five tabs and what is loaded for them (LB25). Every visit used to load all five tabs' data (542 KB of HTML on dev); now
// the page loads the tab that opens, and each other tab's data is fetched the first time it is opened (and again after a save).
// Shared by the server page, the server action and the browser, so it holds no data access.

export const LIBRARY_TAB_SLUGS = ['exercises', 'templates', 'education', 'forms', 'foods'] as const;
export type LibraryTabSlug = (typeof LIBRARY_TAB_SLUGS)[number];

// The tab the Library opens on when the address names none (or names one that doesn't exist).
export const DEFAULT_LIBRARY_TAB: LibraryTabSlug = 'exercises';

// ?tab=... from the address (a reload, a shared link, /coach/forms and /coach/education redirect here) -> the tab to open.
export function parseLibraryTab(param: string | string[] | null | undefined): LibraryTabSlug {
  const value = Array.isArray(param) ? param[0] : param;
  return isLibraryTab(value) ? value : DEFAULT_LIBRARY_TAB;
}

export function isLibraryTab(value: unknown): value is LibraryTabSlug {
  return typeof value === 'string' && (LIBRARY_TAB_SLUGS as readonly string[]).includes(value);
}

// The figures on the tiles above the tabs: counts only, so every tab's tile is right without loading that tab.
export type LibrarySummary = {
  exercises: number;
  exercisesWithoutVideo: number;
  templates: number;
  rollingOut: number;
  courses: number;
  forms: number;
};

export const EMPTY_LIBRARY_SUMMARY: LibrarySummary = { exercises: 0, exercisesWithoutVideo: 0, templates: 0, rollingOut: 0, courses: 0, forms: 0 };

// A tab's data as one cache entry: where it came from and which "data changed" count (lib/refreshSignal.ts) it was read at.
export type CachedTab<T> = { data: T; version: number };

// What the tab shows and whether it must be (re)fetched. The server's data is for one tab (the one in the address when the page was last
// drawn, which a save's refresh redraws); any other tab comes from the browser's cache, read again when a save has happened since.
export function tabSource<T>(
  tab: LibraryTabSlug,
  server: { tab: LibraryTabSlug; data: T },
  cache: Partial<Record<LibraryTabSlug, CachedTab<T>>>,
  version: number
): { data: T | null; fetch: boolean } {
  if (server.tab === tab) return { data: server.data, fetch: false };
  const cached = cache[tab];
  if (!cached) return { data: null, fetch: true };
  return { data: cached.data, fetch: cached.version !== version };
}
