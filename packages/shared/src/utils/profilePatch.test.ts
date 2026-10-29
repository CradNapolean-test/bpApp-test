import { describe, expect, it } from 'vitest';
import { COACH_SETUP_FIELDS, MEMBER_SETUP_FIELDS, friendlyProfileError, mergeIncoming, profilePatch } from './profilePatch';

const stored = {
  name: 'Sam Example', gender: 'Female', phone: '07000 000000', date_of_birth: '1990-04-02', address: null,
  emergency_contact_name: null, emergency_contact_phone: null, goal_description: 'Get stronger', experience: '',
  start_weight: 82, goal_weight: 70, age: 34, body_fat_pct: 30, activity_level: 1.5, diet_approach: 'High Carb Low Fat',
  nutrition_goal: 'fat_loss', nutrition_setting: 'steady', cycling: false,
  // Things the form never edits, and a coach could have changed meanwhile:
  needs_coach_review: true, nutrition_tracking_mode: 'full_tracking', checkin_reminder_days: 5,
};

describe('profilePatch (R15)', () => {
  it('sends only the field the member changed', () => {
    expect(profilePatch(stored, { ...stored, phone: '07111 111111' }, MEMBER_SETUP_FIELDS)).toEqual({ phone: '07111 111111' });
  });

  it('sends nothing when nothing changed', () => {
    expect(profilePatch(stored, { ...stored }, MEMBER_SETUP_FIELDS)).toEqual({});
  });

  it('never sends a column outside the allow-list, so a stale copy cannot overwrite what the coach changed', () => {
    const stale = { ...stored, needs_coach_review: false, nutrition_tracking_mode: 'photo_diary', checkin_reminder_days: 1, timezone: 'Europe/London' };
    expect(profilePatch(stored, stale, MEMBER_SETUP_FIELDS)).toEqual({});
    expect(profilePatch(stored, stale, COACH_SETUP_FIELDS)).toEqual({});
  });

  it('does not send the coach\'s calorie settings from a member', () => {
    expect(profilePatch(stored, { ...stored, nutrition_goal: 'muscle_gain', age: 99 }, MEMBER_SETUP_FIELDS)).toEqual({});
    expect(profilePatch(stored, { ...stored, nutrition_goal: 'muscle_gain' }, COACH_SETUP_FIELDS)).toEqual({ nutrition_goal: 'muscle_gain' });
  });

  it('sends the whole allowed set on a first save, because the row has to be created', () => {
    const patch = profilePatch(null, stored, MEMBER_SETUP_FIELDS);
    expect(Object.keys(patch).sort()).toEqual([...MEMBER_SETUP_FIELDS].sort());
  });

  it('lets a coach change the starting weight but not a member once it is saved (SU2)', () => {
    const edited = { ...stored, start_weight: 75, goal_weight: 68 };
    expect(profilePatch(stored, edited, MEMBER_SETUP_FIELDS, { startWeightLocked: true })).toEqual({ goal_weight: 68 });
    expect(profilePatch(stored, edited, COACH_SETUP_FIELDS, { startWeightLocked: false })).toEqual({ start_weight: 75, goal_weight: 68 });
  });

  it('treats an emptied text box as null, and "" and null as the same', () => {
    expect(profilePatch(stored, { ...stored, goal_description: '' }, MEMBER_SETUP_FIELDS)).toEqual({ goal_description: null });
    expect(profilePatch(stored, { ...stored, experience: null }, MEMBER_SETUP_FIELDS)).toEqual({});
  });
});

describe('mergeIncoming', () => {
  it('takes fresh values for fields the member has not touched', () => {
    const incoming = { ...stored, goal_weight: 68 };
    const merged = mergeIncoming(stored, { ...stored }, incoming, MEMBER_SETUP_FIELDS);
    expect(merged.form.goal_weight).toBe(68);
    expect(merged.baseline.goal_weight).toBe(68);
  });

  it('keeps what the member is typing', () => {
    const typing = { ...stored, phone: '07222 222222' };
    const merged = mergeIncoming(stored, typing, { ...stored, goal_weight: 68 }, MEMBER_SETUP_FIELDS);
    expect(merged.form.phone).toBe('07222 222222');
    expect(merged.form.goal_weight).toBe(68);
    // And the next save still sends just the phone number.
    expect(profilePatch(merged.baseline, merged.form, MEMBER_SETUP_FIELDS)).toEqual({ phone: '07222 222222' });
  });

  it('after a save, the stored values are the new baseline, so nothing is sent twice', () => {
    const typing = { ...stored, phone: '07222 222222' };
    const merged = mergeIncoming(stored, typing, typing, MEMBER_SETUP_FIELDS);
    expect(profilePatch(merged.baseline, merged.form, MEMBER_SETUP_FIELDS)).toEqual({});
  });
});

describe('friendlyProfileError', () => {
  it('explains the database refusing a coach-controlled field', () => {
    const friendly = 'Your coach has updated these details. Reload the page to see the latest, then make your change again.';
    expect(friendlyProfileError('Not authorized to change coach-managed profile fields')).toBe(friendly);
    expect(friendlyProfileError('Your coach manages your nutrition plan')).toBe(friendly);
    expect(friendlyProfileError('Only your coach can mark your plan as reviewed')).toBe(friendly);
  });

  it('leaves other errors alone', () => {
    expect(friendlyProfileError('Name can be 100 characters at most.')).toBe('Name can be 100 characters at most.');
  });
});
