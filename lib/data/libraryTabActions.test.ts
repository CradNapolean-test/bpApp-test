import { beforeEach, describe, expect, it, vi } from 'vitest';

const createClient = vi.hoisted(() => vi.fn());
vi.mock('@/lib/supabase/server', () => ({ createClient }));
const readLibraryTab = vi.hoisted(() => vi.fn(async (_s: unknown, _id: string, tab: string) => ({ tab })));
vi.mock('./libraryTabs', () => ({
  readLibraryTab,
  readLibrarySummary: async () => ({ exercises: 1, exercisesWithoutVideo: 0, templates: 0, rollingOut: 0, courses: 0, forms: 0 }),
}));
vi.mock('@/lib/data/libraryTabs', () => ({
  readLibraryTab,
  readLibrarySummary: async () => ({ exercises: 1, exercisesWithoutVideo: 0, templates: 0, rollingOut: 0, courses: 0, forms: 0 }),
}));
vi.mock('@/lib/data/coach', () => ({ getCoachUnreadTotal: async () => 0 }));
vi.mock('next/navigation', () => ({
  redirect: (to: string) => {
    throw new Error(`redirect ${to}`);
  },
}));
vi.mock('@/app/coach/library/_components/LibraryHubShell', () => ({ LibraryHubShell: () => null }));

import { loadLibraryTab } from './libraryTabActions';
import CoachLibraryPage from '@/app/coach/library/page';

function signedIn(user: { id: string; email?: string } | null, role?: string) {
  const query = { select: () => query, eq: () => query, single: async () => ({ data: role ? { role } : null }) };
  createClient.mockResolvedValue({ auth: { getUser: async () => ({ data: { user } }) }, from: () => query });
}

beforeEach(() => {
  createClient.mockReset();
  readLibraryTab.mockClear();
});

describe('loadLibraryTab (a tab fetched when it is first opened)', () => {
  it('gives a coach the tab asked for, read with their own session', async () => {
    signedIn({ id: 'coach-1' }, 'coach');
    expect(await loadLibraryTab('forms')).toEqual({ ok: true, data: { tab: 'forms' } });
    expect(readLibraryTab).toHaveBeenCalledWith(expect.anything(), 'coach-1', 'forms');
  });

  it('refuses anyone signed out, and a member, without reading anything', async () => {
    signedIn(null);
    expect(await loadLibraryTab('forms')).toEqual({ ok: false });
    signedIn({ id: 'member-1' }, 'client');
    expect(await loadLibraryTab('forms')).toEqual({ ok: false });
    signedIn({ id: 'nobody' });
    expect(await loadLibraryTab('forms')).toEqual({ ok: false });
    expect(readLibraryTab).not.toHaveBeenCalled();
  });

  it('refuses a name that is not one of the five tabs before asking the database', async () => {
    for (const bad of ['all', '', 'Forms', '__proto__']) expect(await loadLibraryTab(bad)).toEqual({ ok: false });
    expect(createClient).not.toHaveBeenCalled();
  });
});

describe('the Library page', () => {
  const page = (tab?: string) => CoachLibraryPage({ searchParams: Promise.resolve(tab === undefined ? {} : { tab }) });

  it('loads only the tab the address names (deep links such as /coach/forms land on Forms)', async () => {
    signedIn({ id: 'coach-1', email: 'c@example.com' }, 'coach');
    const el = (await page('forms')) as { props: { initialTab: { tab: string } } };
    expect(readLibraryTab).toHaveBeenCalledTimes(1);
    expect(readLibraryTab).toHaveBeenCalledWith(expect.anything(), 'coach-1', 'forms');
    expect(el.props.initialTab).toEqual({ tab: 'forms' });
  });

  it('loads Exercises when the address names no tab or a wrong one', async () => {
    signedIn({ id: 'coach-1' }, 'coach');
    await page();
    await page('nonsense');
    expect(readLibraryTab.mock.calls.map((c) => c[2])).toEqual(['exercises', 'exercises']);
  });

  it('sends a signed-out visitor to sign in and a member to their dashboard, as before', async () => {
    signedIn(null);
    await expect(page('forms')).rejects.toThrow('redirect /login');
    signedIn({ id: 'member-1' }, 'client');
    await expect(page('forms')).rejects.toThrow('redirect /dashboard');
    expect(readLibraryTab).not.toHaveBeenCalled();
  });
});
