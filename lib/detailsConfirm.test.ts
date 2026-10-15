import { describe, expect, it } from 'vitest';
import { DETAILS_SNOOZE_MS, detailsSnoozeKey, snoozedRecently } from './detailsConfirm';

describe('snoozedRecently', () => {
  const now = Date.UTC(2026, 9, 15, 12, 0, 0);

  it('is false when nothing was stored', () => {
    expect(snoozedRecently(null, now)).toBe(false);
    expect(snoozedRecently('', now)).toBe(false);
  });

  it('is true for a "Later" pressed less than a day ago', () => {
    expect(snoozedRecently(String(now - 60_000), now)).toBe(true);
    expect(snoozedRecently(String(now - DETAILS_SNOOZE_MS + 1), now)).toBe(true);
  });

  it('is false once a day has passed', () => {
    expect(snoozedRecently(String(now - DETAILS_SNOOZE_MS), now)).toBe(false);
    expect(snoozedRecently(String(now - 3 * DETAILS_SNOOZE_MS), now)).toBe(false);
  });

  it('ignores a stored value that is not a timestamp', () => {
    expect(snoozedRecently('yes', now)).toBe(false);
    expect(snoozedRecently('0', now)).toBe(false);
  });

  it('keys the snooze per member so a shared phone does not hide it for the next person', () => {
    expect(detailsSnoozeKey('a')).not.toBe(detailsSnoozeKey('b'));
  });
});
