import { describe, expect, it } from 'vitest';

import { weeklyTarget } from '../calculations';
import { toEngineProfile, toMemberEngineProfile } from './clientProfile';
import { parseCustomTargets } from './customTargets';
import type { ClientProfileRow } from '../data/types';

describe('parseCustomTargets', () => {
  it('works out calories from the macros when they are left empty', () => {
    expect(parseCustomTargets({ calories: '', protein: '150', carbs: '200', fat: '60' })).toEqual({
      ok: true,
      value: { custom_calories: 1940, custom_protein: 150, custom_carbs: 200, custom_fat: 60 },
    });
  });
  it('keeps typed calories and reads a comma decimal', () => {
    const r = parseCustomTargets({ calories: '2100', protein: '150,5', carbs: '200', fat: '60' });
    expect(r).toMatchObject({ ok: true, value: { custom_calories: 2100, custom_protein: 150.5 } });
  });
  it('asks for all three macros and refuses junk, negatives and huge numbers', () => {
    expect(parseCustomTargets({ calories: '', protein: '150', carbs: '', fat: '60' }).ok).toBe(false);
    expect(parseCustomTargets({ calories: '', protein: 'abc', carbs: '1', fat: '1' }).ok).toBe(false);
    expect(parseCustomTargets({ calories: '', protein: '-5', carbs: '1', fat: '1' }).ok).toBe(false);
    expect(parseCustomTargets({ calories: '99999', protein: '1', carbs: '1', fat: '1' }).ok).toBe(false);
  });
});

const bare = { client_id: 'c', needs_coach_review: false } as unknown as ClientProfileRow;
const withTarget = { ...bare, custom_calories: 2000, custom_protein: 150, custom_carbs: 200, custom_fat: 60 } as ClientProfileRow;

describe('a typed-in daily target', () => {
  it('gives a member with no body details a target, which they had none of before', () => {
    expect(toEngineProfile(bare)).toBeNull();
    const target = weeklyTarget(toEngineProfile(withTarget)!, 1);
    expect(target?.dailyFlat).toEqual({ calories: 2000, protein: 150, carbs: 200, fat: 60, floorApplied: false });
    expect(target?.calories).toBe(14000);
  });
  it('shows even while the plan waits for the coach, since nobody calculated it', () => {
    const held = { ...bare, needs_coach_review: true } as ClientProfileRow;
    expect(toMemberEngineProfile(held, false)).toBeNull();
    expect(toMemberEngineProfile({ ...withTarget, needs_coach_review: true } as ClientProfileRow, false)).not.toBeNull();
  });
  it('needs all four numbers', () => {
    expect(toEngineProfile({ ...withTarget, custom_fat: null } as ClientProfileRow)).toBeNull();
  });
});
