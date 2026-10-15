import { toCsv } from './csv';

// Creating logins for coaches and members (CM2). The rules live here as plain functions, with the database and the Auth admin calls passed
// in, so email handling, batching and the clean-up after a failure can be tested without an account being made.

// One sentence for every "that did not work because the address is taken" case. It must not say whether the address belongs to a member
// or a coach, or to which gym: a coach who types any address would otherwise learn whether it exists anywhere in the business.
export const ACCOUNT_NOT_ADDED = 'We could not add that email. It may already have an account.';

export const IMPORT_BATCH_SIZE = 20;
export const IMPORT_MAX = 200;

// Trim and lower-case, so "Alex@Example.com " and "alex@example.com" are one address.
export function normaliseEmail(raw: unknown): string {
  return typeof raw === 'string' ? raw.trim().toLowerCase() : '';
}

// A real-looking address: one @, something before it, a dotted domain after it, no spaces, within the length email allows. This is a
// guard against a name or a note in a spreadsheet cell, not a full check of the standard (the sign-in email proves the address).
export function isValidEmail(email: string): boolean {
  if (email.length < 6 || email.length > 254) return false;
  return /^[^\s@,;<>()[\]\\"]+@[^\s@,;<>()[\]\\"]+\.[^\s@,;<>()[\]\\".]{2,}$/.test(email) && !email.includes('..');
}

export interface ParsedEmails {
  valid: string[];
  // Cells that were not an address, as typed (shown so the coach can fix them).
  rejected: string[];
  // Addresses that appeared more than once.
  duplicates: number;
}

// Pulls the addresses out of pasted text or a CSV that has already been split into rows. If the first row has a cell called "email" only
// that column is read and the header is skipped, so a name or notes column cannot be mistaken for an address. Otherwise every cell is a
// candidate (one per line, or comma-separated). A cell without an @ is ignored silently (an empty cell, a name); one with an @ that is not
// a valid address is reported back instead of being sent.
export function extractEmails(rows: string[][]): ParsedEmails {
  const result: ParsedEmails = { valid: [], rejected: [], duplicates: 0 };
  if (rows.length === 0) return result;
  const header = rows[0].map((c) => c.trim().toLowerCase());
  const emailColumn = header.indexOf('email');
  const cells = emailColumn >= 0 ? rows.slice(1).map((r) => r[emailColumn] ?? '') : rows.flat();
  const seen = new Set<string>();
  for (const cell of cells) {
    const trimmed = cell.trim();
    if (!trimmed) continue;
    const email = normaliseEmail(trimmed);
    if (isValidEmail(email)) {
      if (seen.has(email)) result.duplicates += 1;
      else {
        seen.add(email);
        result.valid.push(email);
      }
    } else if (trimmed.includes('@') || emailColumn >= 0) {
      result.rejected.push(trimmed);
    }
  }
  return result;
}

export function splitIntoBatches<T>(items: T[], size: number = IMPORT_BATCH_SIZE): T[][] {
  const step = Math.max(1, Math.floor(size));
  const batches: T[][] = [];
  for (let i = 0; i < items.length; i += step) batches.push(items.slice(i, i + step));
  return batches;
}

// What Supabase says when an address is taken (its wording has changed between versions).
export function isEmailTakenError(error: { message?: string; code?: string; status?: number } | null | undefined): boolean {
  if (!error) return false;
  if (error.code === 'email_exists' || error.code === 'user_already_exists') return true;
  return /already (been )?registered|already exists|duplicate key/i.test(error.message ?? '');
}

// ---- Creating a login without leaving half of one behind ----

export interface AccountSteps {
  // Makes the login with a password nobody will ever see. `exists` is true when the address is already in use.
  createLogin(email: string): Promise<{ id: string } | { error: string; exists?: boolean }>;
  // Everything that must follow for the login to be usable (the profile row, a gym membership). An error undoes the login.
  finish(id: string): Promise<{ error: string } | null>;
  // Removes a login made a moment ago.
  deleteLogin(id: string): Promise<void>;
}

export type CreatedAccount =
  | { ok: true; id: string }
  | { ok: false; reason: 'taken' | 'failed'; error: string; rolledBack: boolean };

// If the profile (or anything after it) cannot be written, the login is deleted again. Before this, the login stayed behind: the address was
// then "already registered" with no profile, and could be neither used nor added again.
export async function createAccountWithRollback(steps: AccountSteps, email: string): Promise<CreatedAccount> {
  const login = await steps.createLogin(email);
  if ('error' in login) {
    return login.exists
      ? { ok: false, reason: 'taken', error: ACCOUNT_NOT_ADDED, rolledBack: false }
      : { ok: false, reason: 'failed', error: login.error, rolledBack: false };
  }
  const problem = await steps.finish(login.id);
  if (!problem) return { ok: true, id: login.id };
  let rolledBack = true;
  try {
    await steps.deleteLogin(login.id);
  } catch {
    rolledBack = false;
  }
  return { ok: false, reason: 'failed', error: problem.error, rolledBack };
}

// ---- The password-set link a new person is given instead of a password ----

// The link opens /auth/confirm, which signs the person in with the one-time token and lands them on the page where they choose a password.
// It works once, from any device, and expires (Supabase's default is an hour).
export function passwordSetLink(origin: string, hashedToken: string): string {
  const base = origin.replace(/\/+$/, '');
  return `${base}/auth/confirm?token_hash=${encodeURIComponent(hashedToken)}&type=recovery&next=${encodeURIComponent('/reset-password')}`;
}

export interface ImportRow {
  email: string;
  link?: string;
  error?: string;
}

// The file the coach saves after an import: one line per address with its set-password link, or the reason it was not added. Built with
// the guarded CSV writer, so a cell that starts with = or @ cannot run as a formula when the file is opened in a spreadsheet.
export function importResultsCsv(rows: ImportRow[]): string {
  return toCsv(
    ['Email', 'Set-password link', 'Result'],
    rows.map((r) => [r.email, r.link ?? '', r.link ? 'Added' : r.error ?? 'Not added'])
  );
}
