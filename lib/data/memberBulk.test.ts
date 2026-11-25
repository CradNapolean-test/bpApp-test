import { beforeEach, describe, expect, it, vi } from 'vitest';

// The Members list's bulk actions (CL18) against a pretend database: who counts as the coach's member, what is written, and what comes back
// for the screen to show. Nothing here reaches a real database.
const h = vi.hoisted(() => ({ client: null as unknown }));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(async () => h.client) }));
vi.mock('./chat', () => ({ sendMessage: vi.fn() }));
vi.mock('./clientGroups', () => ({ addClientsToGroup: vi.fn() }));

import { sendMessage } from './chat';
import { addClientsToGroup } from './clientGroups';
import { addMembersToGroup, addMembersToNewGroup, messageEach } from './memberBulk';
import { GYM_CHANGED_MESSAGE } from './gymGuard';

const COACH = '11111111-1111-4111-8111-111111111111';
const GYM = '22222222-2222-4222-8222-222222222222';
const OTHER_GYM = '33333333-3333-4333-8333-333333333333';
const GROUP = '44444444-4444-4444-8444-444444444444';
const NEW_GROUP = '55555555-5555-4555-8555-555555555555';
const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const C = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const STRANGER = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

type Filter = [string, string, unknown];
interface Query {
  table: string;
  op: 'select' | 'insert';
  filters: Filter[];
  payload?: unknown;
}
type Resp = { data: unknown; error: { message: string } | null };

// A database client that answers each table from `answer` and keeps every query it was asked, in order.
function fakeDb(answer: (q: Query) => Resp, opts: { user?: { id: string } | null; activeGym?: string } = {}) {
  const log: Query[] = [];
  const from = (table: string) => {
    const q: Query = { table, op: 'select', filters: [] };
    const api = {
      select: () => api,
      insert: (payload: unknown) => ((q.op = 'insert'), (q.payload = payload), api),
      eq: (c: string, v: unknown) => (q.filters.push(['eq', c, v]), api),
      in: (c: string, v: unknown) => (q.filters.push(['in', c, v]), api),
      single: () => api,
      maybeSingle: () => api,
      then: (res: (r: Resp) => unknown, rej: (e: unknown) => unknown) => {
        log.push(q);
        return Promise.resolve(answer(q)).then(res, rej);
      },
    };
    return api;
  };
  const user = opts.user === undefined ? { id: COACH } : opts.user;
  h.client = {
    auth: { getUser: async () => ({ data: { user } }) },
    from,
    rpc: async (name: string) => (name === 'my_scoping_gym_id' ? { data: opts.activeGym ?? GYM, error: null } : { data: null, error: { message: `no ${name}` } }),
  };
  return log;
}

const filterOf = (q: Query, col: string) => q.filters.find((f) => f[1] === col)?.[2];

// Members A, B and C are the coach's; anyone else is not.
const OWN = [A, B, C];
function ownersAnswer(q: Query): Resp | null {
  if (q.table !== 'profiles') return null;
  const asked = (filterOf(q, 'id') as string[]) ?? [];
  const coach = filterOf(q, 'coach_id');
  return { data: asked.filter((id) => coach === COACH && OWN.includes(id)).map((id) => ({ id })), error: null };
}

beforeEach(() => {
  vi.mocked(sendMessage).mockReset();
  vi.mocked(addClientsToGroup).mockReset();
});

describe('messageEach', () => {
  it("sends the message into each of the coach's own members' chats, through the normal send, and nobody else's", async () => {
    const log = fakeDb((q) => ownersAnswer(q) ?? { data: null, error: { message: 'unexpected' } });
    vi.mocked(sendMessage).mockResolvedValue({} as never);
    const res = await messageEach([A, STRANGER, B], '  See you Saturday!  ');
    expect(res).toEqual({ ok: true, sent: [A, B], failed: [{ clientId: STRANGER, error: 'Not one of your members' }] });
    expect(vi.mocked(sendMessage).mock.calls).toEqual([
      [A, 'See you Saturday!'],
      [B, 'See you Saturday!'],
    ]);
    // Who is the coach's is checked in the database, by coach_id, for members only.
    expect(log).toHaveLength(1);
    expect(filterOf(log[0], 'coach_id')).toBe(COACH);
    expect(filterOf(log[0], 'role')).toBe('client');
  });

  it('keeps going when one member fails, and says why', async () => {
    fakeDb((q) => ownersAnswer(q)!);
    vi.mocked(sendMessage)
      .mockResolvedValueOnce({} as never)
      .mockRejectedValueOnce(new Error('new row for relation "chat_messages" violates check constraint "chat_messages_text_length"'))
      .mockResolvedValueOnce({} as never);
    const res = await messageEach([A, B, C], 'Hi');
    expect(res).toEqual({ ok: true, sent: [A, C], failed: [{ clientId: B, error: 'That message is too long (4,000 characters at most).' }] });
  });

  it('sends to each member once', async () => {
    fakeDb((q) => ownersAnswer(q)!);
    vi.mocked(sendMessage).mockResolvedValue({} as never);
    await messageEach([A, A, A], 'Hi');
    expect(sendMessage).toHaveBeenCalledTimes(1);
  });

  it('sends nothing without a message, with one too long, or for more than a batch', async () => {
    const log = fakeDb((q) => ownersAnswer(q)!);
    expect(await messageEach([A], '   ')).toEqual({ ok: false, error: 'Write a message first.' });
    expect(await messageEach([A], 'x'.repeat(4001))).toEqual({ ok: false, error: 'That message is too long (4,000 characters at most).' });
    const many = Array.from({ length: 21 }, () => A);
    expect(await messageEach(many, 'Hi')).toEqual({ ok: false, error: 'Send to 20 members at a time.' });
    expect(sendMessage).not.toHaveBeenCalled();
    expect(log).toHaveLength(0);
  });

  it('sends nothing when signed out, or when it cannot check who the members are', async () => {
    fakeDb((q) => ownersAnswer(q)!, { user: null });
    expect((await messageEach([A], 'Hi')).ok).toBe(false);
    fakeDb(() => ({ data: null, error: { message: 'boom' } }));
    expect(await messageEach([A], 'Hi')).toEqual({ ok: false, error: 'boom' });
    expect(sendMessage).not.toHaveBeenCalled();
  });
});

describe('addMembersToGroup', () => {
  const groupAnswer = (inGroup: string[]) => (q: Query): Resp => {
    const owners = ownersAnswer(q);
    if (owners) return owners;
    if (q.table === 'client_groups') return { data: filterOf(q, 'id') === GROUP ? { id: GROUP, name: 'Morning crew' } : null, error: null };
    if (q.table === 'client_group_members') return { data: ((filterOf(q, 'client_id') as string[]) ?? []).filter((id) => inGroup.includes(id)).map((client_id) => ({ client_id })), error: null };
    return { data: null, error: { message: 'unexpected' } };
  };

  it('adds the members not in it yet, in one write, and says who was in it already and who is not theirs', async () => {
    fakeDb(groupAnswer([B]));
    const res = await addMembersToGroup(GROUP, [A, B, STRANGER], GYM);
    expect(res).toEqual({
      ok: true,
      groupId: GROUP,
      groupName: 'Morning crew',
      added: [A],
      already: [B],
      failed: [{ clientId: STRANGER, error: 'Not one of your members' }],
    });
    expect(vi.mocked(addClientsToGroup).mock.calls).toEqual([[GROUP, [A]]]);
  });

  it('writes nothing when everyone is in it already', async () => {
    fakeDb(groupAnswer([A, B]));
    const res = await addMembersToGroup(GROUP, [A, B], GYM);
    expect(res).toMatchObject({ ok: true, added: [], already: [A, B], failed: [] });
    expect(addClientsToGroup).not.toHaveBeenCalled();
  });

  it('reports every member it was adding when the write fails', async () => {
    fakeDb(groupAnswer([]));
    vi.mocked(addClientsToGroup).mockRejectedValue(new Error('permission denied for table client_group_members'));
    const res = await addMembersToGroup(GROUP, [A, B], GYM);
    expect(res).toMatchObject({ ok: true, added: [], failed: [{ clientId: A }, { clientId: B }] });
  });

  it('refuses when the coach switched gym in another tab, before reading or writing anything', async () => {
    const log = fakeDb(groupAnswer([]), { activeGym: OTHER_GYM });
    expect(await addMembersToGroup(GROUP, [A], GYM)).toEqual({ ok: false, error: GYM_CHANGED_MESSAGE });
    expect(log).toHaveLength(0);
    expect(addClientsToGroup).not.toHaveBeenCalled();
  });

  it("refuses a group the coach can't see (another gym's, or deleted)", async () => {
    fakeDb(groupAnswer([]));
    const other = '66666666-6666-4666-8666-666666666666';
    expect(await addMembersToGroup(other, [A], GYM)).toEqual({ ok: false, error: 'That group is not there any more. Reload the page.' });
    expect(await addMembersToGroup('not-a-group', [A], GYM)).toEqual({ ok: false, error: 'Choose a group.' });
    expect(addClientsToGroup).not.toHaveBeenCalled();
  });
});

describe('addMembersToNewGroup', () => {
  const newGroupAnswer = (existing: { id: string; name: string }[], insertError = false) => (q: Query): Resp => {
    const owners = ownersAnswer(q);
    if (owners) return owners;
    if (q.table === 'client_groups' && q.op === 'select') return { data: existing, error: null };
    if (q.table === 'client_groups' && q.op === 'insert') return insertError ? { data: null, error: { message: 'insert refused' } } : { data: { id: NEW_GROUP, name: (q.payload as { name: string }).name }, error: null };
    if (q.table === 'client_group_members') return { data: [], error: null };
    return { data: null, error: { message: 'unexpected' } };
  };

  it("makes the group at the coach's active gym, as them, then adds the members", async () => {
    const log = fakeDb(newGroupAnswer([]));
    const res = await addMembersToNewGroup('  Saturday crew ', [A, B], GYM);
    expect(res).toMatchObject({ ok: true, groupId: NEW_GROUP, groupName: 'Saturday crew', added: [A, B] });
    const insert = log.find((q) => q.op === 'insert');
    expect(insert?.payload).toEqual({ coach_id: COACH, gym_id: GYM, name: 'Saturday crew' });
    expect(vi.mocked(addClientsToGroup).mock.calls).toEqual([[NEW_GROUP, [A, B]]]);
  });

  it('uses the group already called that (any case) instead of making a second one', async () => {
    const log = fakeDb(newGroupAnswer([{ id: GROUP, name: 'Morning Crew' }]));
    const res = await addMembersToNewGroup('morning crew', [A], GYM);
    expect(res).toMatchObject({ ok: true, groupId: GROUP, groupName: 'Morning Crew', added: [A] });
    expect(log.some((q) => q.op === 'insert')).toBe(false);
  });

  it('needs a name, of a sensible length', async () => {
    const log = fakeDb(newGroupAnswer([]));
    expect(await addMembersToNewGroup('  ', [A], GYM)).toEqual({ ok: false, error: 'Give the group a name.' });
    expect(await addMembersToNewGroup('x'.repeat(101), [A], GYM)).toEqual({ ok: false, error: 'Group names can be 100 characters at most.' });
    expect(log).toHaveLength(0);
  });

  it('adds nobody when the group cannot be made', async () => {
    fakeDb(newGroupAnswer([], true));
    expect(await addMembersToNewGroup('New', [A], GYM)).toEqual({ ok: false, error: 'insert refused' });
    expect(addClientsToGroup).not.toHaveBeenCalled();
  });
});
