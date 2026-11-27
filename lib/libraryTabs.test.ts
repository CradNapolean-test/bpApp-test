import { describe, expect, it } from 'vitest';
import { DEFAULT_LIBRARY_TAB, LIBRARY_TAB_SLUGS, isLibraryTab, parseLibraryTab, tabSource } from './libraryTabs';

describe('parseLibraryTab (the address picks the tab that opens, LB25)', () => {
  it('opens the tab the address names, including the /coach/forms and /coach/education redirects', () => {
    for (const slug of LIBRARY_TAB_SLUGS) expect(parseLibraryTab(slug)).toBe(slug);
    expect(parseLibraryTab('forms')).toBe('forms');
    expect(parseLibraryTab('education')).toBe('education');
  });

  it('opens Exercises when the address names no tab or one that does not exist', () => {
    expect(DEFAULT_LIBRARY_TAB).toBe('exercises');
    for (const bad of [undefined, null, '', 'Forms', 'templates ', '__proto__', 'constructor']) expect(parseLibraryTab(bad)).toBe('exercises');
  });

  it('takes the first of a repeated ?tab=', () => {
    expect(parseLibraryTab(['forms', 'foods'])).toBe('forms');
  });

  it('isLibraryTab accepts only the five tab names', () => {
    expect(isLibraryTab('templates')).toBe(true);
    expect(isLibraryTab('toString')).toBe(false);
    expect(isLibraryTab(3)).toBe(false);
  });
});

describe('tabSource (each tab loads when it is opened)', () => {
  const server = { tab: 'exercises' as const, data: 'exercise data' };

  it('shows the tab the page loaded without fetching it', () => {
    expect(tabSource('exercises', server, {}, 0)).toEqual({ data: 'exercise data', fetch: false });
    // After a save the page's own tab comes back with the refresh, so it is never fetched as well.
    expect(tabSource('exercises', server, {}, 5)).toEqual({ data: 'exercise data', fetch: false });
  });

  it("fetches any other tab the first time it is opened, and never shows another tab's data in its place", () => {
    expect(tabSource('forms', server, {}, 0)).toEqual({ data: null, fetch: true });
    expect(tabSource('templates', server, { forms: { data: 'form data', version: 0 } }, 0)).toEqual({ data: null, fetch: true });
  });

  it('keeps a fetched tab while the coach moves between tabs', () => {
    expect(tabSource('forms', server, { forms: { data: 'form data', version: 2 } }, 2)).toEqual({ data: 'form data', fetch: false });
  });

  it('reads a fetched tab again after a save, showing what it had meanwhile', () => {
    expect(tabSource('forms', server, { forms: { data: 'form data', version: 2 } }, 3)).toEqual({ data: 'form data', fetch: true });
  });

  it("uses the page's data once a refresh has redrawn the page for that tab", () => {
    const redrawn = { tab: 'forms' as const, data: 'fresh form data' };
    expect(tabSource('forms', redrawn, { forms: { data: 'old form data', version: 1 } }, 4)).toEqual({ data: 'fresh form data', fetch: false });
    // The tab the page first loaded is fetched like any other when the page now holds a different one.
    expect(tabSource('exercises', redrawn, {}, 4)).toEqual({ data: null, fetch: true });
  });
});
