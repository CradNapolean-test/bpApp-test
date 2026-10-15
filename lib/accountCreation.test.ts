import { describe, expect, it, vi } from 'vitest';
import {
  ACCOUNT_NOT_ADDED,
  IMPORT_BATCH_SIZE,
  createAccountWithRollback,
  extractEmails,
  importResultsCsv,
  isEmailTakenError,
  isValidEmail,
  normaliseEmail,
  passwordSetLink,
  splitIntoBatches,
  type AccountSteps,
} from './accountCreation';

describe('normaliseEmail', () => {
  it('trims and lower-cases', () => {
    expect(normaliseEmail('  Alex.Smith@Example.COM ')).toBe('alex.smith@example.com');
  });

  it('turns anything that is not text into nothing', () => {
    expect(normaliseEmail(undefined)).toBe('');
    expect(normaliseEmail(42)).toBe('');
    expect(normaliseEmail(null)).toBe('');
  });
});

describe('isValidEmail', () => {
  it('accepts ordinary addresses', () => {
    expect(isValidEmail('alex@example.com')).toBe(true);
    expect(isValidEmail('alex.smith+gym@mail.example.co.uk')).toBe(true);
  });

  it('rejects free text that happens to contain an @', () => {
    expect(isValidEmail('call me @ 5pm')).toBe(false);
    expect(isValidEmail('@alex')).toBe(false);
    expect(isValidEmail('alex@')).toBe(false);
    expect(isValidEmail('alex@example')).toBe(false);
    expect(isValidEmail('a@b@c.com')).toBe(false);
    expect(isValidEmail('alex@exa..mple.com')).toBe(false);
    expect(isValidEmail('alex smith@example.com')).toBe(false);
    expect(isValidEmail('alex@example.com, jamie@example.com')).toBe(false);
    expect(isValidEmail('<alex@example.com>')).toBe(false);
  });

  it('rejects an address longer than email allows', () => {
    expect(isValidEmail(`${'a'.repeat(250)}@example.com`)).toBe(false);
  });
});

describe('extractEmails', () => {
  it('reads one address per line and drops repeats', () => {
    const result = extractEmails([['Alex@example.com'], ['jamie@example.com'], ['alex@example.com']]);
    expect(result.valid).toEqual(['alex@example.com', 'jamie@example.com']);
    expect(result.duplicates).toBe(1);
  });

  it('reads only the email column when there is a header, so names cannot be mistaken for addresses', () => {
    const result = extractEmails([
      ['Name', 'Email', 'Notes'],
      ['Alex', 'alex@example.com', 'ring me @ 5'],
      ['Jamie', 'jamie@example.com', ''],
    ]);
    expect(result.valid).toEqual(['alex@example.com', 'jamie@example.com']);
    expect(result.rejected).toEqual([]);
  });

  it('reports a bad cell in the email column instead of sending it', () => {
    const result = extractEmails([['email'], ['alex@example.com'], ['not an address'], ['']]);
    expect(result.valid).toEqual(['alex@example.com']);
    expect(result.rejected).toEqual(['not an address']);
  });

  it('reports a free-text cell with an @, ignores one without', () => {
    const result = extractEmails([['alex@example.com', 'call me @ 5pm', 'Alex']]);
    expect(result.valid).toEqual(['alex@example.com']);
    expect(result.rejected).toEqual(['call me @ 5pm']);
  });

  it('copes with nothing', () => {
    expect(extractEmails([])).toEqual({ valid: [], rejected: [], duplicates: 0 });
  });
});

describe('splitIntoBatches', () => {
  it('cuts a list into batches of the import size', () => {
    const list = Array.from({ length: 45 }, (_, i) => i);
    const batches = splitIntoBatches(list);
    expect(IMPORT_BATCH_SIZE).toBe(20);
    expect(batches.map((b) => b.length)).toEqual([20, 20, 5]);
    expect(batches.flat()).toEqual(list);
  });

  it('handles an empty list, an exact multiple and a silly size', () => {
    expect(splitIntoBatches([])).toEqual([]);
    expect(splitIntoBatches([1, 2, 3, 4], 2)).toEqual([[1, 2], [3, 4]]);
    expect(splitIntoBatches([1, 2, 3], 0)).toEqual([[1], [2], [3]]);
  });
});

describe('isEmailTakenError', () => {
  it('recognises how Supabase says an address is taken', () => {
    expect(isEmailTakenError({ code: 'email_exists' })).toBe(true);
    expect(isEmailTakenError({ message: 'A user with this email address has already been registered' })).toBe(true);
    expect(isEmailTakenError({ message: 'User already registered' })).toBe(true);
  });

  it('does not mistake other failures for it', () => {
    expect(isEmailTakenError({ message: 'Database error creating new user' })).toBe(false);
    expect(isEmailTakenError(null)).toBe(false);
  });
});

function steps(overrides: Partial<AccountSteps> = {}): AccountSteps & { deleted: string[] } {
  const deleted: string[] = [];
  return {
    deleted,
    createLogin: vi.fn(async () => ({ id: 'user-1' })),
    finish: vi.fn(async () => null),
    deleteLogin: vi.fn(async (id: string) => {
      deleted.push(id);
    }),
    ...overrides,
  };
}

describe('createAccountWithRollback', () => {
  it('returns the new login when every step works, and deletes nothing', async () => {
    const s = steps();
    expect(await createAccountWithRollback(s, 'alex@example.com')).toEqual({ ok: true, id: 'user-1' });
    expect(s.deleted).toEqual([]);
  });

  it('deletes the login when the profile cannot be written, so the address is not left half-registered', async () => {
    const s = steps({ finish: vi.fn(async () => ({ error: 'profile insert failed' })) });
    const result = await createAccountWithRollback(s, 'alex@example.com');
    expect(result).toEqual({ ok: false, reason: 'failed', error: 'profile insert failed', rolledBack: true });
    expect(s.deleted).toEqual(['user-1']);
  });

  it('says when the clean-up itself failed, so it can be logged', async () => {
    const s = steps({
      finish: vi.fn(async () => ({ error: 'membership insert failed' })),
      deleteLogin: vi.fn(async () => {
        throw new Error('network');
      }),
    });
    const result = await createAccountWithRollback(s, 'alex@example.com');
    expect(result).toMatchObject({ ok: false, reason: 'failed', rolledBack: false });
  });

  it('gives one neutral message when the address is taken, whoever owns it', async () => {
    const s = steps({ createLogin: vi.fn(async () => ({ error: 'already registered', exists: true })) });
    const result = await createAccountWithRollback(s, 'alex@example.com');
    expect(result).toEqual({ ok: false, reason: 'taken', error: ACCOUNT_NOT_ADDED, rolledBack: false });
    expect(result.ok === false && result.error).not.toMatch(/client|coach|gym|member/i);
    expect(s.finish).not.toHaveBeenCalled();
  });

  it('passes on another failure to make the login, and deletes nothing', async () => {
    const s = steps({ createLogin: vi.fn(async () => ({ error: 'service unavailable' })) });
    expect(await createAccountWithRollback(s, 'alex@example.com')).toMatchObject({ ok: false, reason: 'failed', error: 'service unavailable' });
    expect(s.deleteLogin).not.toHaveBeenCalled();
  });
});

describe('passwordSetLink', () => {
  it('opens the confirm route with the one-time token and lands on the password page', () => {
    const link = passwordSetLink('https://app.example.com/', 'abc123');
    expect(link).toBe('https://app.example.com/auth/confirm?token_hash=abc123&type=recovery&next=%2Freset-password');
  });

  it('escapes a token with odd characters', () => {
    expect(passwordSetLink('https://a.test', 'a b&c')).toContain('token_hash=a%20b%26c');
  });
});

describe('importResultsCsv', () => {
  it('lists each address with its link or the reason it was not added', () => {
    const csv = importResultsCsv([
      { email: 'alex@example.com', link: 'https://app.example.com/auth/confirm?token_hash=x&type=recovery' },
      { email: 'jamie@example.com', error: ACCOUNT_NOT_ADDED },
    ]);
    const lines = csv.trim().split('\r\n');
    expect(lines[0]).toBe('Email,Set-password link,Result');
    expect(lines[1]).toContain('alex@example.com');
    expect(lines[1]).toContain('Added');
    expect(lines[2]).toContain('jamie@example.com');
    expect(lines[2]).toContain('could not add');
  });

  it('does not let a cell start a spreadsheet formula', () => {
    const csv = importResultsCsv([{ email: '=1+1@example.com', error: '=HYPERLINK("http://evil")' }]);
    expect(csv).toContain("'=1+1@example.com");
    expect(csv).toContain("'=HYPERLINK");
  });
});
