import { describe, expect, it } from 'vitest';
import { validatePlan } from './planForm';

describe('validatePlan (PK1, PK2)', () => {
  const ok = { name: 'Full Membership', creditsPerWeek: '4', screensSelected: 5 };

  it('accepts a good plan and trims the name', () => {
    expect(validatePlan({ ...ok, name: '  Full Membership  ' })).toEqual({ ok: true, name: 'Full Membership', creditsPerWeek: 4 });
  });

  it('accepts 0 credits a week (a plan with no classes is allowed) but not a blank box', () => {
    expect(validatePlan({ ...ok, creditsPerWeek: '0' })).toEqual({ ok: true, name: 'Full Membership', creditsPerWeek: 0 });
    expect(validatePlan({ ...ok, creditsPerWeek: '' }).ok).toBe(false);
    expect(validatePlan({ ...ok, creditsPerWeek: '   ' }).ok).toBe(false);
  });

  it.each(['-1', '2.5', 'four', '1e3', '4 credits'])('refuses %j credits', (credits) => {
    expect(validatePlan({ ...ok, creditsPerWeek: credits }).ok).toBe(false);
  });

  it('refuses an absurd number of credits', () => {
    expect(validatePlan({ ...ok, creditsPerWeek: '101' }).ok).toBe(false);
    expect(validatePlan({ ...ok, creditsPerWeek: '100' }).ok).toBe(true);
  });

  it('refuses a plan with every screen unticked', () => {
    const result = validatePlan({ ...ok, screensSelected: 0 });
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toMatch(/at least one screen/);
  });

  it('refuses a blank name', () => {
    expect(validatePlan({ ...ok, name: '   ' }).ok).toBe(false);
  });
});
