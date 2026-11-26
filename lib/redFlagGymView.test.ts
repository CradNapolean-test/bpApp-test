import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { redFlagLoadKey, redFlagWeekShown, shownIfCurrent } from './redFlagGymView';

const A = 'gym-a';
const B = 'gym-b';

describe('redFlagWeekShown (CV14)', () => {
  it('is the gym’s newest finished week until the coach moves', () => {
    expect(redFlagWeekShown(null, A, '2026-11-16')).toBe('2026-11-16');
  });

  it('keeps the week the coach moved to at that gym', () => {
    expect(redFlagWeekShown({ gymId: A, week: '2026-11-02' }, A, '2026-11-16')).toBe('2026-11-02');
  });

  it('goes back to the new gym’s newest week after a switch in the header', () => {
    expect(redFlagWeekShown({ gymId: A, week: '2026-11-02' }, B, '2026-11-23')).toBe('2026-11-23');
  });
});

describe('shownIfCurrent: a switch never shows another gym’s red flags', () => {
  const forA = { key: redFlagLoadKey(A, '2026-11-16', 0), report: 'A’s list' };

  it('shows the list loaded for the gym and week on screen', () => {
    expect(shownIfCurrent(forA, redFlagLoadKey(A, '2026-11-16', 0))).toBe(forA);
  });

  it('hides the old gym’s list once the header has switched gym, even for the same week', () => {
    expect(shownIfCurrent(forA, redFlagLoadKey(B, '2026-11-16', 0))).toBeNull();
  });

  it('hides it for another week, and while a reload is on its way', () => {
    expect(shownIfCurrent(forA, redFlagLoadKey(A, '2026-11-09', 0))).toBeNull();
    expect(shownIfCurrent(forA, redFlagLoadKey(A, '2026-11-16', 1))).toBeNull();
  });

  it('keys an unknown gym apart from a real one', () => {
    expect(redFlagLoadKey(null, '2026-11-16', 0)).not.toBe(redFlagLoadKey(A, '2026-11-16', 0));
  });
});

describe('RedFlagsView has no gym picker of its own (CV14)', () => {
  const view = readFileSync(join(__dirname, '..', 'app/coach/classes/_components/RedFlagsView.tsx'), 'utf8');

  it('reads the gym from the header’s choice only', () => {
    expect(view).not.toMatch(/<select[^>]*red-flag-gym|pickGym|pickedGymId/);
    expect(view).toMatch(/gyms\.find\(\(g\) => g\.isActive\)/);
  });
});
