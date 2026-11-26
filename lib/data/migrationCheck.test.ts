import { describe, expect, it } from 'vitest';
import { isMissingFunction, needsMigrationMessage, rpcFailure } from './migrationCheck';

describe('migrationCheck (the app deployed before migration 0175)', () => {
  it('knows a missing database function', () => {
    expect(isMissingFunction({ code: 'PGRST202' })).toBe(true);
    expect(isMissingFunction({ code: '42883' })).toBe(true);
    expect(isMissingFunction({ code: 'P0001' })).toBe(false);
    expect(isMissingFunction(null)).toBe(false);
  });

  it('says plainly that the update is missing, and passes other refusals through', () => {
    expect(rpcFailure({ code: 'PGRST202', message: 'Could not find the function' }, '0175', 'Could not send')).toEqual({
      ok: false,
      error: needsMigrationMessage('0175'),
    });
    expect(needsMigrationMessage('0175')).toContain('migration 0175');
    const other = rpcFailure({ code: 'P0001', message: 'That group isn’t at the gym you’re working in.' }, '0175', 'Could not send');
    expect(other.ok).toBe(false);
    expect((other as { error: string }).error).toContain('group');
    expect(rpcFailure({ code: 'P0001', message: '' }, '0175', 'Could not send')).toEqual({ ok: false, error: 'Could not send' });
  });
});
