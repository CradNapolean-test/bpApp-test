import { beforeEach, describe, expect, it, vi } from 'vitest';

// Which reads each tab makes: a tab must read its own data and nothing of the other tabs (LB25).
const calls = vi.hoisted(() => [] as string[]);
const track = vi.hoisted(
  () =>
    <T,>(name: string, value: T) =>
    async () => {
      calls.push(name);
      return value;
    }
);
vi.mock('./exerciseLibrary', () => ({ getExerciseLibrary: track('exercises', []), getExerciseUsage: track('usage', {}) }));
vi.mock('./programTemplates', () => ({ getProgramTemplatesWithDays: track('templates', []), getPendingRollouts: track('rollouts', []) }));
vi.mock('./forms', () => ({
  getFormTemplates: track('formTemplates', []),
  getFormRollup: track('formRollup', [{ client_id: 'other-1' }, { client_id: 'mine-1' }]),
}));
vi.mock('./education', () => ({ getCourses: track('courses', []), getCourseRollup: track('courseRollup', [{ client_id: 'other-2' }]) }));
vi.mock('./clientGroups', () => ({ getGroups: track('groups', []) }));
vi.mock('./gym', () => ({
  getMyGyms: track('gyms', [
    { gymId: 'g2', gymName: 'Other', isActive: false },
    { gymId: 'g1', gymName: 'Here', isActive: true },
  ]),
}));
const readMemberNames = vi.hoisted(() => vi.fn(async (_s: unknown, ids: string[]) => Object.fromEntries(ids.map((id) => [id, `Name ${id}`]))));
vi.mock('./memberNames', () => ({ readMemberNames }));
vi.mock('./coach', () => ({
  getMyClients: track('members', [{ id: 'mine-1', name: null, email: 'm@example.com' }]),
  resolveScopingGymId: async () => 'g1',
}));

import { readLibraryTab } from './libraryTabs';

beforeEach(() => {
  calls.length = 0;
  readMemberNames.mockClear();
});

describe('readLibraryTab', () => {
  it('Exercises reads the library and its usage only', async () => {
    const data = await readLibraryTab({} as never, 'coach-1', 'exercises');
    expect(data.tab).toBe('exercises');
    expect(calls.sort()).toEqual(['exercises', 'usage']);
    expect(Object.keys(data).sort()).toEqual(['exercises', 'tab', 'usage']);
  });

  it('Program templates reads templates, the library for its pickers, groups, members and rollouts', async () => {
    const data = await readLibraryTab({} as never, 'coach-1', 'templates');
    expect(calls.sort()).toEqual(['exercises', 'groups', 'members', 'rollouts', 'templates']);
    expect(data).toMatchObject({ tab: 'templates', members: [{ id: 'mine-1', name: 'm@example.com' }] });
  });

  it("Forms reads forms and who has them, and names only the other coaches' members among them", async () => {
    const data = await readLibraryTab({} as never, 'coach-1', 'forms');
    expect(calls.sort()).toEqual(['formRollup', 'formTemplates', 'groups', 'members']);
    expect(readMemberNames).toHaveBeenCalledWith(expect.anything(), ['other-1']);
    expect(data).toMatchObject({ tab: 'forms', memberNames: { 'other-1': 'Name other-1' } });
  });

  it('Education reads courses, who has them and the other gyms, and none of the forms', async () => {
    const data = await readLibraryTab({} as never, 'coach-1', 'education');
    expect(calls.sort()).toEqual(['courseRollup', 'courses', 'groups', 'gyms', 'members']);
    expect(data).toMatchObject({ tab: 'education', otherGyms: [{ id: 'g2', name: 'Other' }], memberNames: { 'other-2': 'Name other-2' } });
  });

  it('Foods reads nothing (its pane searches as the coach types)', async () => {
    expect(await readLibraryTab({} as never, 'coach-1', 'foods')).toEqual({ tab: 'foods' });
    expect(calls).toEqual([]);
  });
});
