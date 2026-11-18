import { NextResponse } from 'next/server';
import { isAuthorizedCron } from '@/lib/cronAuth';
import { createAdminClient } from '@/lib/supabase/admin';
import { recordJobRun } from '@/lib/jobRuns';
import { notifyRolloutMembers } from '@/lib/memberNotify';

// Triggered daily by Vercel Cron (see vercel.json). Gives every scheduled programme rollout whose
// start date has arrived to the members it covers; the work happens in Postgres
// (apply_due_programme_rollouts), which uses each gym's own timezone to decide what is due.
//
// D20: everyone a rollout reaches is then told (in the app, and by push), the same as a programme started for one member. The database
// function answers only a count, so the rollouts waiting before the run are read first and the ones it applied are told apart
// afterwards. A rollout is due when its start date has arrived at its gym, which is never later than tomorrow in UTC, so only those are
// read. If that read fails the programmes still go out; only the notices are missed.

const DAY_MS = 24 * 60 * 60 * 1000;
const ID_CHUNK = 100;

const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export async function GET(request: Request) {
  // Refuses everyone when the secret is not set (lib/cronAuth.ts), instead of accepting "Bearer undefined".
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createAdminClient();
  const latestDue = isoDay(Date.now() + DAY_MS);
  const { data: waiting, error: waitingError } = await admin
    .from('programme_rollouts')
    .select('id')
    .is('applied_at', null)
    .lte('start_date', latestDue);

  const { data, error } = await admin.rpc('apply_due_programme_rollouts');
  if (error) {
    await recordJobRun('apply-programme-rollouts', false, error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // The rollouts that were waiting and are applied now: the ones this run gave out.
  const waitingIds = ((waiting ?? []) as { id: string }[]).map((r) => r.id);
  const given: string[] = [];
  let lookupFailed = !!waitingError;
  for (let i = 0; i < waitingIds.length; i += ID_CHUNK) {
    const { data: applied, error: appliedError } = await admin
      .from('programme_rollouts')
      .select('id')
      .in('id', waitingIds.slice(i, i + ID_CHUNK))
      .not('applied_at', 'is', null);
    if (appliedError) {
      lookupFailed = true;
      continue;
    }
    given.push(...((applied ?? []) as { id: string }[]).map((r) => r.id));
  }

  const notices = `rollouts given out: ${given.length}${lookupFailed ? ' (a rollout read failed, so some members may not be told)' : ''}`;
  await recordJobRun('apply-programme-rollouts', true, `programmes started: ${JSON.stringify(data)}; ${notices}`);
  const membersTold = await notifyRolloutMembers(given);
  return NextResponse.json({ programmesStarted: data, membersTold });
}
