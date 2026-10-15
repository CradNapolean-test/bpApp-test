import { describe, expect, it } from 'vitest';
import { createLatestOnly } from './latestOnly';

// A request whose answer we control: resolve() answers it whenever the test says so.
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

// The shape of useCoachMessages.selectClient: pick a member, load their messages, show them only if still selected.
function makeInbox() {
  const guard = createLatestOnly();
  const state = { selected: null as string | null, messages: [] as string[], loading: false };
  const requests: Record<string, ReturnType<typeof deferred<string[]>>> = {};

  async function select(clientId: string) {
    const ticket = guard.next();
    state.selected = clientId;
    state.messages = [];
    state.loading = true;
    requests[clientId] = deferred<string[]>();
    const messages = await requests[clientId].promise;
    if (!guard.isCurrent(ticket)) return;
    state.messages = messages;
    state.loading = false;
  }
  return { guard, state, requests, select };
}

describe('createLatestOnly', () => {
  it('the answer to the second click wins even when the first answer arrives last', async () => {
    const inbox = makeInbox();
    const first = inbox.select('barbara');
    const second = inbox.select('john');

    inbox.requests.john.resolve(["John's own message"]);
    await second;
    expect(inbox.state).toEqual({ selected: 'john', messages: ["John's own message"], loading: false });

    inbox.requests.barbara.resolve(["Barbara's reply"]);
    await first;
    // Barbara's late answer is dropped: the window headed "John" still shows John's messages.
    expect(inbox.state).toEqual({ selected: 'john', messages: ["John's own message"], loading: false });
  });

  it('the first answer arriving before the second is also dropped', async () => {
    const inbox = makeInbox();
    const first = inbox.select('barbara');
    const second = inbox.select('john');

    inbox.requests.barbara.resolve(["Barbara's reply"]);
    await first;
    expect(inbox.state.messages).toEqual([]);
    expect(inbox.state.loading).toBe(true); // still waiting for John

    inbox.requests.john.resolve(["John's own message"]);
    await second;
    expect(inbox.state.messages).toEqual(["John's own message"]);
    expect(inbox.state.loading).toBe(false);
  });

  it('a single request is applied', async () => {
    const inbox = makeInbox();
    const only = inbox.select('barbara');
    inbox.requests.barbara.resolve(['hello']);
    await only;
    expect(inbox.state).toEqual({ selected: 'barbara', messages: ['hello'], loading: false });
  });

  it('clearing the selection cancels what is still in flight', async () => {
    const inbox = makeInbox();
    const pending = inbox.select('barbara');
    inbox.guard.next(); // the conversation was closed
    inbox.state.selected = null;
    inbox.state.messages = [];
    inbox.requests.barbara.resolve(["Barbara's reply"]);
    await pending;
    expect(inbox.state.messages).toEqual([]);
  });

  it('tickets are only current until the next one is taken', () => {
    const guard = createLatestOnly();
    const a = guard.next();
    expect(guard.isCurrent(a)).toBe(true);
    const b = guard.next();
    expect(guard.isCurrent(a)).toBe(false);
    expect(guard.isCurrent(b)).toBe(true);
  });
});
