import { describe, expect, it } from 'vitest';
import { ERROR_TOAST_MS, SUCCESS_TOAST_MS, toastDuration, toastRole } from './toastTiming';

describe('toast timing', () => {
  it('keeps an error on screen much longer than a confirmation', () => {
    expect(toastDuration('success')).toBe(SUCCESS_TOAST_MS);
    expect(toastDuration('error')).toBe(ERROR_TOAST_MS);
    expect(ERROR_TOAST_MS).toBeGreaterThanOrEqual(2 * SUCCESS_TOAST_MS);
    expect(ERROR_TOAST_MS).toBeGreaterThanOrEqual(10000);
  });

  it('announces an error as an alert and a confirmation as a status', () => {
    expect(toastRole('error')).toBe('alert');
    expect(toastRole('success')).toBe('status');
  });
});
