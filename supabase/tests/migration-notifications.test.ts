import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// Static checks on migration 0139 (fix brief 09): the broadcast email result columns and the job_runs table. No database.
const dir = path.join(__dirname, '..', 'migrations');
const file = fs.readdirSync(dir).find((f) => f.startsWith('0139_'));
const sql = file ? fs.readFileSync(path.join(dir, file), 'utf8').replace(/--.*$/gm, '') : '';

describe('migration 0139', () => {
  it('exists', () => {
    expect(file).toBeTruthy();
  });

  it('adds the email result columns to scheduled_communications, and can be run twice', () => {
    for (const column of ['email_sent_count', 'email_failed_count', 'email_error', 'email_attempts', 'email_last_attempt_at']) {
      expect(sql).toMatch(new RegExp(`add column if not exists ${column}\\b`));
    }
    expect(sql).toMatch(/drop constraint if exists scheduled_communications_email_error_length/);
  });

  it('creates job_runs closed to the API: row level security on, no policies, no grants', () => {
    expect(sql).toMatch(/create table if not exists public\.job_runs/);
    expect(sql).toMatch(/alter table public\.job_runs enable row level security/);
    expect(sql).toMatch(/revoke all on table public\.job_runs from anon, authenticated/);
    expect(sql).not.toMatch(/create policy[^;]*job_runs/i);
  });

  it('is indexed for "did this job run lately"', () => {
    expect(sql).toMatch(/job_runs_job_ran_at_idx on public\.job_runs \(job, ran_at desc\)/);
  });

  it('never rejects existing rows (only nullable or defaulted additions)', () => {
    expect(sql).not.toMatch(/add column[^;]*not null(?![^;]*default)/i);
  });
});
