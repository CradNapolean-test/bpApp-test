import { describe, expect, it } from 'vitest';
import { computeHealth, lastActiveLabel } from './healthStatus';

const today = '2026-10-15';

describe('computeHealth', () => {
  it('is green within the reminder days of the last log', () => {
    expect(computeHealth({ reminderDays: 3, lastActive: '2026-10-13', createdAt: '2026-01-01T00:00:00Z', todayIso: today })).toEqual({ daysSinceActive: 2, status: 'green', neverLogged: false });
    expect(computeHealth({ reminderDays: 3, lastActive: '2026-10-12', createdAt: '2026-01-01T00:00:00Z', todayIso: today }).status).toBe('green');
  });

  it('turns amber up to double the reminder days, then red', () => {
    expect(computeHealth({ reminderDays: 3, lastActive: '2026-10-11', createdAt: '2026-01-01T00:00:00Z', todayIso: today }).status).toBe('amber');
    expect(computeHealth({ reminderDays: 3, lastActive: '2026-10-09', createdAt: '2026-01-01T00:00:00Z', todayIso: today }).status).toBe('amber');
    expect(computeHealth({ reminderDays: 3, lastActive: '2026-10-08', createdAt: '2026-01-01T00:00:00Z', todayIso: today }).status).toBe('red');
  });

  it('with no logs at all, counts from sign-up and says so', () => {
    const fresh = computeHealth({ reminderDays: 3, lastActive: null, createdAt: '2026-10-14T09:00:00Z', todayIso: today });
    expect(fresh).toEqual({ daysSinceActive: 1, status: 'green', neverLogged: true });
    const old = computeHealth({ reminderDays: 3, lastActive: null, createdAt: '2026-08-01T09:00:00Z', todayIso: today });
    expect(old.status).toBe('red');
    expect(old.neverLogged).toBe(true);
  });

  it('is unmonitored when reminders are off, logs or not', () => {
    expect(computeHealth({ reminderDays: 0, lastActive: '2026-10-15', createdAt: '2026-01-01T00:00:00Z', todayIso: today }).status).toBe('unmonitored');
    expect(computeHealth({ reminderDays: 0, lastActive: null, createdAt: '2026-01-01T00:00:00Z', todayIso: today }).status).toBe('unmonitored');
  });

  it('uses 3 days when no reminder setting is stored', () => {
    expect(computeHealth({ reminderDays: null, lastActive: '2026-10-12', createdAt: '2026-01-01T00:00:00Z', todayIso: today }).status).toBe('green');
    expect(computeHealth({ reminderDays: undefined, lastActive: '2026-10-11', createdAt: '2026-01-01T00:00:00Z', todayIso: today }).status).toBe('amber');
  });

  it('never goes negative when the log is dated after their local today', () => {
    expect(computeHealth({ reminderDays: 3, lastActive: '2026-10-16', createdAt: '2026-01-01T00:00:00Z', todayIso: today }).daysSinceActive).toBe(0);
  });
});

describe('lastActiveLabel', () => {
  it('says Never logged, not a count of days, when there is no log', () => {
    expect(lastActiveLabel({ status: 'red', daysSinceActive: 70, lastActiveDate: null })).toBe('Never logged');
  });
  it('counts days when there is a last log', () => {
    expect(lastActiveLabel({ status: 'green', daysSinceActive: 0, lastActiveDate: '2026-10-15' })).toBe('Active today');
    expect(lastActiveLabel({ status: 'green', daysSinceActive: 1, lastActiveDate: '2026-10-14' })).toBe('Last active 1 day ago');
    expect(lastActiveLabel({ status: 'amber', daysSinceActive: 5, lastActiveDate: '2026-10-10' })).toBe('Last active 5 days ago');
  });
  it('says Not monitored when there is no status or reminders are off', () => {
    expect(lastActiveLabel(null)).toBe('Not monitored');
    expect(lastActiveLabel({ status: 'unmonitored', daysSinceActive: 2, lastActiveDate: '2026-10-13' })).toBe('Not monitored');
  });
});
