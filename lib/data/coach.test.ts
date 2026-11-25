import { describe, expect, it } from 'vitest';
import { PLAN_NAME_UNREADABLE, getMemberListActivity, planEndsOnOf, planNameOf } from './coach';
import { LOGGED_DATA_FILTER } from '@/lib/utils/dailyLog';

// The shape the embedded select `client_memberships!client_id(ended_at, membership_packages(name))` comes back in.
const open = (pkg: unknown) => [{ ended_at: null, membership_packages: pkg }];

describe('planNameOf', () => {
  it('names the plan on the open membership', () => {
    expect(planNameOf(open({ name: 'Unlimited' }))).toBe('Unlimited');
    expect(planNameOf(open([{ name: 'Unlimited' }]))).toBe('Unlimited');
  });

  it('skips plans that have ended', () => {
    const rows = [
      { ended_at: '2026-01-05T00:00:00Z', membership_packages: { name: 'Old plan' } },
      { ended_at: null, membership_packages: { name: 'Current plan' } },
    ];
    expect(planNameOf(rows)).toBe('Current plan');
  });

  it('is null only for a member with no open plan', () => {
    expect(planNameOf([])).toBeNull();
    expect(planNameOf(null)).toBeNull();
    expect(planNameOf([{ ended_at: '2026-01-05T00:00:00Z', membership_packages: { name: 'Old plan' } }])).toBeNull();
  });

  it('still counts a member as being on a plan when the plan itself belongs to the other gym and cannot be read', () => {
    // The plan row is hidden (null), but the membership is open: this member is NOT "No plan".
    expect(planNameOf(open(null))).toBe(PLAN_NAME_UNREADABLE);
    expect(planNameOf(open([]))).toBe(PLAN_NAME_UNREADABLE);
  });
});

describe('planEndsOnOf (CL6)', () => {
  it("gives the open plan's planned last day, not an ended plan's", () => {
    const rows = [
      { ended_at: '2026-01-05', scheduled_end: '2026-01-04', membership_packages: { name: 'Old plan' } },
      { ended_at: null, scheduled_end: '2026-12-06', membership_packages: { name: 'Challenge' } },
    ];
    expect(planEndsOnOf(rows)).toBe('2026-12-06');
  });

  it('is null for a plan with no last day, and with no plan', () => {
    expect(planEndsOnOf([{ ended_at: null, scheduled_end: null, membership_packages: { name: 'Unlimited' } }])).toBeNull();
    expect(planEndsOnOf(open({ name: 'Unlimited' }))).toBeNull();
    expect(planEndsOnOf([])).toBeNull();
    expect(planEndsOnOf(null)).toBeNull();
  });
});

// getMemberListActivity: one query for the whole list, page by page, never one per member (CL6).
describe('getMemberListActivity', () => {
  const COACH = '11111111-1111-4111-8111-111111111111';
  const GYM = '22222222-2222-4222-8222-222222222222';
  type Call = [string, ...unknown[]];

  function fakeProfiles(pages: unknown[][]) {
    const queries: Call[][] = [];
    const from = (table: string) => {
      const calls: Call[] = [['from', table]];
      queries.push(calls);
      const api: Record<string, unknown> = {};
      for (const m of ['select', 'eq', 'or', 'gte', 'lt', 'lte', 'in', 'order', 'limit']) {
        api[m] = (...args: unknown[]) => (calls.push([m, ...args]), api);
      }
      api.range = (fromRow: number) => {
        calls.push(['range', fromRow]);
        return Promise.resolve({ data: pages[queries.length - 1] ?? [], error: null });
      };
      return api;
    };
    return { supabase: { from } as never, queries };
  }

  it('reads logged days in the two completed weeks, their week marks and the latest attended class, in one query', async () => {
    const { supabase, queries } = fakeProfiles([
      [
        {
          id: 'm1',
          daily_logs: [{ log_date: '2026-11-18' }],
          coach_reviews: [],
          bookings: [{ booking_date: '2026-11-24', class: { name: 'HIIT' } }],
        },
        { id: 'm2', daily_logs: [{ log_date: '2026-11-18' }], coach_reviews: [{ ref: '2026-11-16' }], bookings: [] },
        { id: 'm3', daily_logs: null, coach_reviews: null, bookings: null },
      ],
    ]);
    const out = await getMemberListActivity(supabase, { coachId: COACH, gymId: GYM }, '2026-11-25');
    expect(out).toEqual({
      m1: { checkIn: { kind: 'waiting', weeks: ['2026-11-16'] }, lastClass: { date: '2026-11-24', className: 'HIIT' } },
      m2: { checkIn: { kind: 'reviewed', week: '2026-11-16' }, lastClass: null },
      m3: { checkIn: { kind: 'none' }, lastClass: null },
    });
    expect(queries).toHaveLength(1);
    const calls = queries[0];
    const has = (...c: unknown[]) => expect(calls).toContainEqual(c);
    has('from', 'profiles');
    has('eq', 'role', 'client');
    // Both of the list's scopes at once: the coach's own members and everyone at the gym.
    has('or', `coach_id.eq.${COACH},gym_id.eq.${GYM}`);
    has('gte', 'daily_logs.log_date', '2026-11-09');
    has('lt', 'daily_logs.log_date', '2026-11-23');
    has('or', LOGGED_DATA_FILTER, { referencedTable: 'daily_logs' });
    has('eq', 'coach_reviews.kind', 'week');
    has('in', 'coach_reviews.ref', ['2026-11-09', '2026-11-16']);
    has('eq', 'bookings.status', 'booked');
    has('eq', 'bookings.attended', true);
    has('lte', 'bookings.booking_date', '2026-11-25');
    has('order', 'booking_date', { referencedTable: 'bookings', ascending: false });
    has('limit', 1, { referencedTable: 'bookings' });
    const select = calls.find((c) => c[0] === 'select')?.[1] as string;
    expect(select).toContain('coach_reviews!client_id(ref)');
    expect(select).toContain('bookings!client_id(booking_date, class:classes(name))');
  });

  it('reads page after page past the 1,000-row cap', async () => {
    const page = (n: number, start: number) => Array.from({ length: n }, (_, i) => ({ id: `m${start + i}`, daily_logs: [], coach_reviews: [], bookings: [] }));
    const { supabase, queries } = fakeProfiles([page(1000, 0), page(5, 1000)]);
    const out = await getMemberListActivity(supabase, { coachId: COACH, gymId: GYM }, '2026-11-25');
    expect(Object.keys(out)).toHaveLength(1005);
    expect(queries).toHaveLength(2);
  });

  it('asks nothing without a usable coach or gym id', async () => {
    const { supabase, queries } = fakeProfiles([]);
    expect(await getMemberListActivity(supabase, { coachId: 'nope', gymId: null }, '2026-11-25')).toEqual({});
    expect(queries).toHaveLength(0);
  });
});
