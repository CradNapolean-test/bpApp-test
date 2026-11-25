import { describe, expect, it } from 'vitest';
import { COACH_DETAILS_FIELDS, NUTRITION_PLAN_FIELDS } from './nutritionPlanFields';
import { COACH_SETUP_FIELDS, MEMBER_SETUP_FIELDS, profilePatch } from './profilePatch';

describe('the coach’s Details and Nutrition plan fields (CL8)', () => {
  it('are, between them, exactly the coach’s old Setup fields, with none in both', () => {
    expect([...COACH_DETAILS_FIELDS, ...NUTRITION_PLAN_FIELDS].sort()).toEqual([...COACH_SETUP_FIELDS].sort());
    expect(COACH_DETAILS_FIELDS.filter((f) => (NUTRITION_PLAN_FIELDS as readonly string[]).includes(f))).toEqual([]);
  });

  it('leave Details with the member’s own fields', () => {
    expect(COACH_DETAILS_FIELDS).toEqual(MEMBER_SETUP_FIELDS);
  });

  it('save only the plan fields that changed from the plan card, never a detail', () => {
    const stored = { name: 'Lucy', age: 40, body_fat_pct: 30, activity_level: 1.5, cycling: false };
    const form = { ...stored, name: 'Changed elsewhere', age: 41 };
    expect(profilePatch(stored, form, NUTRITION_PLAN_FIELDS)).toEqual({ age: 41 });
  });
});
