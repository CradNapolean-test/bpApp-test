import { describe, expect, it } from 'vitest';

import { MEMBER_PROFILE_COLUMNS, MEMBER_PROFILE_SELECT } from './clientProfileColumns';

describe('member profile columns', () => {
  it("never asks for the coach's private notes", () => {
    expect(MEMBER_PROFILE_COLUMNS).not.toContain('admin_notes');
    expect(MEMBER_PROFILE_SELECT.split(',').map((c) => c.trim())).not.toContain('admin_notes');
    expect(MEMBER_PROFILE_SELECT).not.toContain('*');
  });

  it('lists each column once', () => {
    expect(new Set(MEMBER_PROFILE_COLUMNS).size).toBe(MEMBER_PROFILE_COLUMNS.length);
  });

  it('keeps the columns the screens depend on', () => {
    for (const c of ['client_id', 'timezone', 'nutrition_tracking_mode', 'start_weight', 'goal_weight', 'tier', 'diet_approach', 'onboarding_completed_at', 'minutes_per_1000_steps']) {
      expect(MEMBER_PROFILE_COLUMNS).toContain(c);
    }
  });

  it('is a plain comma-separated list for the select call', () => {
    expect(MEMBER_PROFILE_SELECT.split(', ')).toEqual([...MEMBER_PROFILE_COLUMNS]);
  });
});
