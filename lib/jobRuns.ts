import { createAdminClient } from '@/lib/supabase/admin';
import { scrubAddresses } from '@/lib/scrub';

// "Did the job run today?" answered from the database (job_runs, migration 0139): every daily job calls recordJobRun when it finishes.
// Recording is best effort: it never throws and never changes what the job returns, and if the table is not there yet it does nothing.
// The last 60 days are kept.

export const JOB_RUN_KEEP_DAYS = 60;
const MAX_DETAIL = 500;

type JobRunClient = {
  from(table: 'job_runs'): {
    insert(row: { job: string; ok: boolean; detail: string | null }): PromiseLike<{ error: unknown }>;
    delete(): { lt(column: 'ran_at', value: string): PromiseLike<{ error: unknown }> };
  };
};

export function jobRunCutoff(now: Date = new Date(), days: number = JOB_RUN_KEEP_DAYS): string {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
}

// `detail` is a short summary such as counts. It is stripped of anything that looks like an email address before it is stored.
export async function recordJobRun(job: string, ok: boolean, detail?: string | null, client?: JobRunClient, now: Date = new Date()): Promise<void> {
  try {
    const db = client ?? (createAdminClient() as unknown as JobRunClient);
    const { error } = await db.from('job_runs').insert({ job, ok, detail: detail ? scrubAddresses(detail, MAX_DETAIL) : null });
    if (error) return;
    await db.from('job_runs').delete().lt('ran_at', jobRunCutoff(now));
  } catch {
    // Never let bookkeeping break a job.
  }
}
