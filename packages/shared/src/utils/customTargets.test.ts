import { describe, expect, it } from 'vitest';

import { parseCustomTargets } from './customTargets';

describe('parseCustomTargets', () => {
  it('works out calories from the macros when left empty, and keeps typed calories', () => {
    expect(parseCustomTargets({ calories: '', protein: '150', carbs: '200', fat: '60' })).toEqual({
      ok: true,
      value: { custom_calories: 1940, custom_protein: 150, custom_carbs: 200, custom_fat: 60 },
    });
    expect(parseCustomTargets({ calories: '2100', protein: '150', carbs: '200', fat: '60' })).toMatchObject({ ok: true, value: { custom_calories: 2100 } });
  });
  it('needs all three macros and refuses junk, negatives and huge numbers', () => {
    expect(parseCustomTargets({ calories: '', protein: '150', carbs: '', fat: '60' }).ok).toBe(false);
    expect(parseCustomTargets({ calories: '', protein: 'abc', carbs: '1', fat: '1' }).ok).toBe(false);
    expect(parseCustomTargets({ calories: '', protein: '-5', carbs: '1', fat: '1' }).ok).toBe(false);
    expect(parseCustomTargets({ calories: '99999', protein: '1', carbs: '1', fat: '1' }).ok).toBe(false);
  });
});
