import { describe, expect, it } from 'vitest';
import { clearMemberLocalData } from './localData';

// A tiny stand-in for localStorage.
function fakeStorage(initial: Record<string, string>) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    get length() {
      return data.size;
    },
    key: (i: number) => [...data.keys()][i] ?? null,
    removeItem: (k: string) => void data.delete(k),
  };
}

describe('clearMemberLocalData (FM1)', () => {
  it('also removes a half-finished onboarding, which holds health notes (R22)', () => {
    const storage = fakeStorage({ 'onboarding-draft:user-1': '{}', theme: 'dark' });
    expect(clearMemberLocalData(storage)).toEqual(['onboarding-draft:user-1']);
    expect([...storage.data.keys()]).toEqual(['theme']);
  });

  it('removes the offline plan and every form draft, and nothing else', () => {
    const storage = fakeStorage({
      'bp-offline-snapshot': '{}',
      'form-draft:a1': '{"q1":"private health answer"}',
      'form-draft:b2': '{}',
      theme: 'dark',
      'sb-session': 'x',
    });
    const removed = clearMemberLocalData(storage);
    expect(removed.sort()).toEqual(['bp-offline-snapshot', 'form-draft:a1', 'form-draft:b2']);
    expect([...storage.data.keys()].sort()).toEqual(['sb-session', 'theme']);
  });

  it('copes with nothing to clear and with no storage at all', () => {
    expect(clearMemberLocalData(fakeStorage({}))).toEqual([]);
    expect(clearMemberLocalData(null)).toEqual([]);
  });

  it('never throws when the storage does', () => {
    const broken = {
      length: 1,
      key: () => {
        throw new Error('blocked');
      },
      removeItem: () => {},
    };
    expect(clearMemberLocalData(broken)).toEqual([]);
  });
});
