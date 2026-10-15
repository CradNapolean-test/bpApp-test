import { describe, expect, it } from 'vitest';
import { gymMismatch, mismatchMessage, type GymClientCount } from './gymMismatch';

const worsley: GymClientCount = { gymId: 'w', gymName: 'Acme Fitness - Worsley', count: 0 };
const salford: GymClientCount = { gymId: 's', gymName: 'Acme Fitness - Salford Quays', count: 90 };
const short = (n: string) => n.replace(/^Acme Fitness - /, '');

describe('gymMismatch', () => {
  it('flags a coach looking at one gym while all their members are in another', () => {
    const m = gymMismatch([worsley, salford], 'w');
    expect(m).not.toBeNull();
    expect(m?.target.gymId).toBe('s');
    expect(m?.here).toBe(0);
    expect(m?.elsewhere).toBe(90);
  });

  it('says nothing when the coach is looking at the gym their members are in', () => {
    expect(gymMismatch([worsley, salford], 's')).toBeNull();
  });

  it('says nothing when most members are here, even if a few are elsewhere', () => {
    expect(gymMismatch([{ ...worsley, count: 40 }, { ...salford, count: 5 }], 'w')).toBeNull();
  });

  it('flags a coach whose members are mostly elsewhere, and points to the gym with the most', () => {
    const other: GymClientCount = { gymId: 'n', gymName: 'Acme Fitness - North', count: 30 };
    const m = gymMismatch([{ ...worsley, count: 5 }, { ...salford, count: 20 }, other], 'w');
    expect(m?.target.gymId).toBe('n');
    expect(m?.others.map((o) => o.gymId)).toEqual(['n', 's']);
  });

  it('says nothing for a coach with no members, or with no active gym', () => {
    expect(gymMismatch([{ ...worsley, count: 0 }, { ...salford, count: 0 }], 'w')).toBeNull();
    expect(gymMismatch([worsley, salford], null)).toBeNull();
    expect(gymMismatch([], 'w')).toBeNull();
  });
});

describe('mismatchMessage', () => {
  it('names both gyms', () => {
    const m = gymMismatch([worsley, salford], 'w')!;
    expect(mismatchMessage(m, short)).toBe('Your members are at Salford Quays but you are viewing Worsley.');
  });

  it('gives the split when some members are here', () => {
    const m = gymMismatch([{ ...worsley, count: 10 }, salford], 'w')!;
    expect(mismatchMessage(m, short)).toBe('Most of your members (90 of 100) are at Salford Quays, but you are viewing Worsley.');
  });
});
