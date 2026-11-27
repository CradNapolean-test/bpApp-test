import { beforeEach, describe, expect, it, vi } from 'vitest';

const createClient = vi.fn();
vi.mock('@/lib/supabase/server', () => ({ createClient: () => createClient() }));

import { canAddLibraryExercises, createLibraryExerciseByName, getExerciseUsage } from './exerciseLibrary';
import { LIBRARY_ADD_REFUSED } from '@/lib/libraryCreate';

// A database client that knows who is signed in, their profile, and the library rows a name search finds; it records what is inserted.
function fakeClient(opts: { user?: { id: string } | null; profile?: { role: string; gym_id: string | null } | null; candidates?: { id: string; name: string; is_active?: boolean }[] }) {
  const inserts: Record<string, unknown>[] = [];
  const patterns: string[] = [];
  const from = (table: string) => {
    const q = {
      select: () => q,
      eq: () => q,
      ilike: (_col: string, pattern: string) => {
        patterns.push(pattern);
        return q;
      },
      limit: async () => ({ data: opts.candidates ?? [], error: null }),
      maybeSingle: async () => ({ data: table === 'profiles' ? (opts.profile ?? null) : null, error: null }),
      insert: (row: Record<string, unknown>) => {
        inserts.push(row);
        return q;
      },
      single: async () => ({ data: { id: 'new-row', created_at: 'now', is_active: true, ...inserts[inserts.length - 1] }, error: null }),
    };
    return q;
  };
  createClient.mockResolvedValue({ auth: { getUser: async () => ({ data: { user: opts.user ?? null } }) }, from });
  return { inserts, patterns };
}

const coach = { user: { id: 'coach-1' }, profile: { role: 'coach', gym_id: 'gym-1' } };

beforeEach(() => createClient.mockReset());

describe('createLibraryExerciseByName', () => {
  it('adds the name to the library as the coach, recording what the name suggests, and hands the row back', async () => {
    const { inserts, patterns } = fakeClient(coach);
    const result = await createLibraryExerciseByName('  Sled   drag ');
    expect(patterns).toEqual(['Sled%drag']);
    expect(inserts).toHaveLength(1);
    expect(inserts[0]).toMatchObject({ name: 'Sled drag', tracking_type: 'weight_distance', created_by: 'coach-1' });
    expect(result).toMatchObject({ ok: true, entry: { id: 'new-row', name: 'Sled drag' } });
  });

  it('hands back the library row when the name is already there, instead of adding it twice', async () => {
    const { inserts } = fakeClient({ ...coach, candidates: [{ id: 'old', name: 'SLED DRAG' }, { id: 'other', name: 'Sled drag relay' }] });
    const result = await createLibraryExerciseByName('Sled drag');
    expect(inserts).toHaveLength(0);
    expect(result).toEqual({ ok: true, entry: { id: 'old', name: 'SLED DRAG' } });
  });

  it('sends the coach to the list when the name is there more than once', async () => {
    const { inserts } = fakeClient({ ...coach, candidates: [{ id: 'a', name: 'Deadlift' }, { id: 'b', name: 'DEADLIFT' }] });
    const result = await createLibraryExerciseByName('deadlift');
    expect(inserts).toHaveLength(0);
    expect(result.ok).toBe(false);
  });

  it('refuses a member and a coach with no gym before the database would', async () => {
    for (const profile of [{ role: 'client', gym_id: 'gym-1' }, { role: 'coach', gym_id: null }]) {
      const { inserts } = fakeClient({ user: { id: 'u' }, profile });
      expect(await createLibraryExerciseByName('Sled drag')).toEqual({ ok: false, error: LIBRARY_ADD_REFUSED });
      expect(inserts).toHaveLength(0);
    }
  });

  it('refuses a blank name without asking the database', async () => {
    const result = await createLibraryExerciseByName('   ');
    expect(result.ok).toBe(false);
    expect(createClient).not.toHaveBeenCalled();
  });
});

describe('canAddLibraryExercises', () => {
  it('is true only for a coach at a gym', async () => {
    fakeClient(coach);
    expect(await canAddLibraryExercises()).toBe(true);
    fakeClient({ user: { id: 'm' }, profile: { role: 'client', gym_id: 'gym-1' } });
    expect(await canAddLibraryExercises()).toBe(false);
    fakeClient({ user: null });
    expect(await canAddLibraryExercises()).toBe(false);
  });
});

describe('getExerciseUsage (LB11)', () => {
  // A client whose database either has exercise_library_usage (0179) or not; it records every call.
  function usageClient(opts: { rpc: { data: unknown; error: { code: string } | null }; templateRows?: unknown[] }) {
    const calls: string[] = [];
    const query = {
      select: () => query,
      not: () => query,
      range: async () => {
        calls.push('page');
        return { data: opts.templateRows ?? [], error: null };
      },
    };
    createClient.mockResolvedValue({
      rpc: async (name: string) => {
        calls.push(`rpc:${name}`);
        return opts.rpc;
      },
      from: (table: string) => {
        calls.push(`from:${table}`);
        return query;
      },
    });
    return calls;
  }

  it("asks the database once for both counts, over what the coach can read, and never once per exercise", async () => {
    const calls = usageClient({
      rpc: { data: [{ exercise_library_id: 'ex-1', templates: 2, member_programmes: 5 }], error: null },
    });
    expect(await getExerciseUsage()).toEqual({ 'ex-1': { templates: 2, programmes: 5 } });
    expect(calls).toEqual(['rpc:exercise_library_usage']);
  });

  it("counts templates as before when 0179 isn't applied, with the members' figure unknown", async () => {
    const calls = usageClient({
      rpc: { data: null, error: { code: 'PGRST202' } },
      templateRows: [
        { exercise_library_id: 'ex-1', program_template_days: { template_id: 't1' } },
        { exercise_library_id: 'ex-1', program_template_days: { template_id: 't1' } },
        { exercise_library_id: 'ex-1', program_template_days: [{ template_id: 't2' }] },
      ],
    });
    expect(await getExerciseUsage()).toEqual({ 'ex-1': { templates: 2, programmes: null } });
    expect(calls).toEqual(['rpc:exercise_library_usage', 'from:program_template_exercises', 'page']);
  });
});
