import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactElement } from 'react';

// The page starts the dashboard's reads before its "is this a coach?" check (item 9). These check the order cannot leak: anyone who is
// not a coach is still sent away, with nothing rendered, even when their dashboard read fails; a coach gets the page with the data.
// No database: who is signed in, their role and every read are stand-ins.

// Like Next's redirect(), this throws, so nothing after it runs.
const redirect = vi.fn((url: string) => {
  throw new Error(`NEXT_REDIRECT ${url}`);
});
vi.mock('next/navigation', () => ({ redirect: (url: string) => redirect(url) }));

const getCurrentUser = vi.fn();
const getMyCoachProfile = vi.fn();
const getCoachDashboard = vi.fn();
const getCoachUnreadTotal = vi.fn();
// The reads' promises come from plain functions, not the vi.fn()s: a vi.fn() handles a promise it returns (to record how it settled),
// which would hide a failed read the page leaves unhandled.
let dashboardRead: () => Promise<unknown>;
let unreadRead: () => Promise<number>;
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({}) }));
vi.mock('@/lib/supabase/currentUser', () => ({ getCurrentUser: () => getCurrentUser(), getMyCoachProfile: () => getMyCoachProfile() }));
vi.mock('@/lib/data/coachDashboard', () => ({
  getCoachDashboard: (...a: unknown[]) => {
    getCoachDashboard(...a);
    return dashboardRead();
  },
}));
vi.mock('@/lib/data/coach', () => ({
  getCoachUnreadTotal: (...a: unknown[]) => {
    getCoachUnreadTotal(...a);
    return unreadRead();
  },
}));

// The page's components are not rendered here, only looked for in what the page returns.
vi.mock('@/app/_components/AppShell', () => ({ AppShell: () => null }));
vi.mock('@/app/_components/ClientOnly', () => ({ ClientOnly: () => null }));
vi.mock('@/app/_components/PageSkeleton', () => ({ PageSkeleton: () => null }));
vi.mock('./_components/CoachNav', () => ({ CoachNav: () => null }));
vi.mock('./_components/CoachSidebar', () => ({ CoachSidebar: () => null }));
vi.mock('./_components/CoachBottomTabBar', () => ({ CoachBottomTabBar: () => null }));
vi.mock('./_components/CoachBrand', () => ({ CoachBrand: () => null }));
vi.mock('./_components/CoachHeaderExtras', () => ({ CoachHeaderExtras: () => null }));
vi.mock('./_components/ActivityFeed', () => ({ ActivityFeed: () => null }));
vi.mock('./_components/CoachDashboard', () => ({ CoachDashboard: () => null }));
vi.mock('./_components/CoachMobileBrand', () => ({ CoachMobileBrand: () => null }));

import CoachPage from './page';
import { CoachDashboard } from './_components/CoachDashboard';

const DATA = { activity: [], nameById: {}, activityNames: {} };
const open = (params: { scope?: string; coach?: string } = {}) => CoachPage({ searchParams: Promise.resolve(params) });

// The element of `type` somewhere in what the page returned.
function find(node: unknown, type: unknown): ReactElement<Record<string, unknown>> | null {
  if (!node || typeof node !== 'object') return null;
  if (Array.isArray(node)) {
    for (const child of node) {
      const hit = find(child, type);
      if (hit) return hit;
    }
    return null;
  }
  const el = node as ReactElement<Record<string, unknown>>;
  if (el.type === type) return el;
  return find(el.props?.children, type);
}

beforeEach(() => {
  redirect.mockClear();
  getCurrentUser.mockReset().mockResolvedValue({ id: 'u1', email: 'coach@example.com' });
  getMyCoachProfile.mockReset().mockResolvedValue({ role: 'coach' });
  getCoachDashboard.mockReset();
  getCoachUnreadTotal.mockReset();
  dashboardRead = async () => DATA;
  unreadRead = async () => 2;
});

describe('/coach', () => {
  it('sends a member to / and renders nothing', async () => {
    getMyCoachProfile.mockResolvedValue({ role: 'client' });
    await expect(open()).rejects.toThrow('NEXT_REDIRECT /');
    expect(redirect).toHaveBeenCalledWith('/');
    expect(redirect).toHaveBeenCalledTimes(1);
  });

  it('sends a member to / even when their dashboard read fails', async () => {
    getMyCoachProfile.mockResolvedValue({ role: 'client' });
    dashboardRead = () => Promise.reject(new Error('permission denied'));
    unreadRead = () => Promise.reject(new Error('permission denied'));
    await expect(open()).rejects.toThrow('NEXT_REDIRECT /');
    // A failed read the page left unhandled would be reported once the queue drains, failing the run.
    await new Promise((r) => setTimeout(r, 0));
  });

  it('sends someone with no profile yet to /, not round to /dashboard', async () => {
    getMyCoachProfile.mockResolvedValue(null);
    await expect(open()).rejects.toThrow('NEXT_REDIRECT /');
  });

  it('sends someone signed out to /login before reading anything', async () => {
    getCurrentUser.mockResolvedValue(null);
    await expect(open()).rejects.toThrow('NEXT_REDIRECT /login');
    expect(getCoachDashboard).not.toHaveBeenCalled();
  });

  it('shows a coach their dashboard', async () => {
    const page = await open({ scope: 'gym' });
    expect(redirect).not.toHaveBeenCalled();
    expect(getCoachDashboard).toHaveBeenCalledWith('gym', null);
    expect(find(page, CoachDashboard)?.props.data).toBe(DATA);
  });
});
