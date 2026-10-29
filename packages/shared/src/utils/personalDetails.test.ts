import { describe, expect, it } from 'vitest';

import { normalizeGender, toDetailsPatch, validatePersonalDetails, type PersonalDetailsInput } from './personalDetails';

describe('normalizeGender', () => {
  it('reads the usual spellings', () => {
    expect(normalizeGender('Female')).toBe('Female');
    expect(normalizeGender('female')).toBe('Female');
    expect(normalizeGender(' F ')).toBe('Female');
    expect(normalizeGender('Male')).toBe('Male');
    expect(normalizeGender('male')).toBe('Male');
    expect(normalizeGender('M')).toBe('Male');
  });
  it('leaves anything else as not chosen', () => {
    expect(normalizeGender(null)).toBeNull();
    expect(normalizeGender(undefined)).toBeNull();
    expect(normalizeGender('')).toBeNull();
    expect(normalizeGender('Other')).toBeNull();
  });
});

const base: PersonalDetailsInput = {
  name: 'Jordan Seed',
  gender: 'Female',
  phone: '07700 900123',
  dateOfBirth: '1990-05-01',
  address: '1 High Street',
  emergencyContactName: 'Sam',
  emergencyContactPhone: '07700 900456',
  goalDescription: 'Lose fat, get stronger',
  experience: 'New to lifting',
  startWeight: '82.5',
  goalWeight: '70',
};
const today = new Date('2026-10-12T09:00:00Z');

describe('validatePersonalDetails', () => {
  it('accepts a complete form', () => {
    expect(validatePersonalDetails(base, today)).toBeNull();
  });
  it('accepts the optional fields blank', () => {
    expect(validatePersonalDetails({ ...base, phone: '', dateOfBirth: '', address: '', emergencyContactName: '', emergencyContactPhone: '', goalDescription: '', experience: '' }, today)).toBeNull();
  });
  it('needs a name and a gender', () => {
    expect(validatePersonalDetails({ ...base, name: '  ' }, today)).toMatch(/name/);
    expect(validatePersonalDetails({ ...base, gender: null }, today)).toMatch(/gender/);
    expect(validatePersonalDetails({ ...base, gender: 'Other' }, today)).toMatch(/gender/);
  });
  it('checks the date of birth when given', () => {
    expect(validatePersonalDetails({ ...base, dateOfBirth: '2025-01-01' }, today)).toMatch(/date of birth/);
    expect(validatePersonalDetails({ ...base, dateOfBirth: '1900-01-01' }, today)).toMatch(/date of birth/);
    expect(validatePersonalDetails({ ...base, dateOfBirth: 'nope' }, today)).toMatch(/date of birth/);
  });
  it('needs weights in range', () => {
    expect(validatePersonalDetails({ ...base, startWeight: '' }, today)).toMatch(/start weight/);
    expect(validatePersonalDetails({ ...base, startWeight: '0' }, today)).toMatch(/start weight/);
    expect(validatePersonalDetails({ ...base, goalWeight: '500' }, today)).toMatch(/goal weight/);
    expect(validatePersonalDetails({ ...base, goalWeight: 'abc' }, today)).toMatch(/goal weight/);
  });
  it('refuses text over the limits', () => {
    expect(validatePersonalDetails({ ...base, name: 'x'.repeat(101) }, today)).toMatch(/name/);
    expect(validatePersonalDetails({ ...base, goalDescription: 'x'.repeat(5001) }, today)).toMatch(/goal/);
    expect(validatePersonalDetails({ ...base, address: 'x'.repeat(301) }, today)).toMatch(/address/);
  });
});

describe('toDetailsPatch', () => {
  it('trims, turns blanks into null and numbers into numbers', () => {
    const p = toDetailsPatch({ ...base, name: ' Jordan ', phone: ' ', address: '', startWeight: '82.5' });
    expect(p.name).toBe('Jordan');
    expect(p.phone).toBeNull();
    expect(p.address).toBeNull();
    expect(p.start_weight).toBe(82.5);
    expect(p.goal_weight).toBe(70);
  });
  it('never includes a column the coach or the calorie engine owns', () => {
    const keys = Object.keys(toDetailsPatch(base));
    for (const k of ['age', 'body_fat_pct', 'activity_level', 'diet_approach', 'tier', 'cycling', 'nutrition_tracking_mode', 'checkin_reminder_days', 'join_date', 'referral_source', 'admin_notes', 'onboarding_completed_at', 'needs_coach_review', 'timezone']) {
      expect(keys).not.toContain(k);
    }
  });
});
