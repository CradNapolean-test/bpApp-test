import { createAdminClient } from '@/lib/supabase/admin';
import { pushQuietly, sendPushToClient } from '@/lib/push';
import {
  creditsAddedMessage,
  planReadyMessage,
  programmeAssignedMessage,
  rolloutRecipients,
  type MemberMessage,
  type RolloutCopy,
  type RolloutForNotice,
} from '@/lib/memberPush';

// Tells a member about something their coach just did for them (decision D20): the in-app notice, then the push. Server-only. The server
// actions call these with after(), once their database call has succeeded, so a slow push service never slows the coach down and nothing
// here can fail or undo the action. Never throws. The admin client writes the notice because a coach cannot write a member's
// notifications; nothing read here goes back to the coach. These are not reminders, so they do not follow the member's "Reminders"
// switch in Account (client_profiles.notifications_enabled: check-ins, booked classes and birthday wishes); a member stops the pushes by
// turning push off on the device.

export async function notifyMember(label: string, clientId: string, message: MemberMessage): Promise<void> {
  try {
    await createAdminClient().from('notifications').insert({ client_id: clientId, message: message.notice });
  } catch {
    // Best effort: the push below still goes.
  }
  await pushQuietly(label, () => sendPushToClient(clientId, message.push));
}

export function notifyPlanReady(clientId: string): Promise<void> {
  return notifyMember('plan ready', clientId, planReadyMessage());
}

export function notifyProgrammeAssigned(clientId: string, programName: string | null): Promise<void> {
  return notifyMember('programme assigned', clientId, programmeAssignedMessage(programName));
}

const PUSH_BATCH = 10;
const NOTICE_BATCH = 500;
const PAGE = 1000;
const MAX_PAGES = 20;

// The same notice and push to many members (a rollout can reach a whole gym): the notices a few hundred to an insert, the pushes a few
// at a time so a large gym does not open hundreds of connections at once. Never throws.
async function notifyMembers(label: string, clientIds: string[], message: MemberMessage): Promise<void> {
  for (let i = 0; i < clientIds.length; i += NOTICE_BATCH) {
    try {
      await createAdminClient()
        .from('notifications')
        .insert(clientIds.slice(i, i + NOTICE_BATCH).map((id) => ({ client_id: id, message: message.notice })));
    } catch {
      // Best effort: the pushes below still go.
    }
  }
  for (let i = 0; i < clientIds.length; i += PUSH_BATCH) {
    await Promise.all(clientIds.slice(i, i + PUSH_BATCH).map((id) => pushQuietly(label, () => sendPushToClient(id, message.push))));
  }
}

// D20 for programmes given out through a rollout ("Everyone at the gym" or chosen members), whether it starts at once or the daily job
// hands it out on its start date: every member the rollout gave a copy to is told, the same notice and push as a programme started for
// one member. A rollout is applied once (applied_at), and only that makes copies with its rollout_id, so nobody is told twice. Read with
// the admin client because a gym-wide rollout reaches members the coach does not coach; nothing read here goes back to anyone. Answers
// how many members were told. Never throws.
export async function notifyRolloutMembers(rolloutIds: string[]): Promise<number> {
  const ids = [...new Set(rolloutIds)];
  if (ids.length === 0) return 0;
  try {
    const admin = createAdminClient();
    const { data: rollouts, error } = await admin.from('programme_rollouts').select('id, program_name, created_by').in('id', ids);
    if (error || !rollouts?.length) return 0;
    const copies: RolloutCopy[] = [];
    for (const r of rollouts as RolloutForNotice[]) {
      for (let page = 0; page < MAX_PAGES; page += 1) {
        const { data, error: readError } = await admin
          .from('workout_programs')
          .select('client_id, rollout_id')
          .eq('rollout_id', r.id)
          .order('id')
          .range(page * PAGE, page * PAGE + PAGE - 1);
        if (readError) break;
        copies.push(...((data ?? []) as RolloutCopy[]));
        if (!data || data.length < PAGE) break;
      }
    }
    let told = 0;
    for (const group of rolloutRecipients(rollouts as RolloutForNotice[], copies)) {
      await notifyMembers('programme assigned', group.clientIds, programmeAssignedMessage(group.programName));
      told += group.clientIds.length;
    }
    return told;
  } catch {
    return 0;
  }
}

// A rollout the coach started for today or earlier: schedule_programme_rollout saves and applies it in one call but answers only a
// count, so the rollout is found as this coach's newest applied one of that template, start date and audience, then its members are told.
export async function notifyStartedRollout(input: {
  startedBy: string;
  templateId: string;
  startDate: string;
  audience: 'all' | 'selected';
}): Promise<void> {
  try {
    const { data } = await createAdminClient()
      .from('programme_rollouts')
      .select('id')
      .eq('created_by', input.startedBy)
      .eq('template_id', input.templateId)
      .eq('start_date', input.startDate)
      .eq('audience', input.audience)
      .not('applied_at', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1);
    const id = (data?.[0] as { id: string } | undefined)?.id;
    if (id) await notifyRolloutMembers([id]);
  } catch {
    // Best effort, as above.
  }
}

// The member's own timezone, for the "to use by" date.
async function memberTimeZone(clientId: string): Promise<string | null> {
  try {
    const { data } = await createAdminClient().from('client_profiles').select('timezone').eq('client_id', clientId).maybeSingle();
    return (data?.timezone as string | null | undefined) ?? null;
  } catch {
    return null;
  }
}

export async function notifyCreditsAdded(clientId: string, amount: number, expiresAt: string | null): Promise<void> {
  const timeZone = expiresAt ? await memberTimeZone(clientId) : null;
  await notifyMember('credits added', clientId, creditsAddedMessage({ amount, expiresAt, timeZone }));
}

// A credit pack: the database read the pack itself (grant_credit_pack), so its name, size and expiry are read here the same way.
export async function notifyCreditPackAdded(clientId: string, packId: string): Promise<void> {
  try {
    const { data: pack } = await createAdminClient().from('credit_packs').select('name, credits, expires_after_days').eq('id', packId).maybeSingle();
    if (!pack || !(Number(pack.credits) > 0)) return;
    const days = pack.expires_after_days as number | null;
    const expiresAt = days != null ? new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString() : null;
    const timeZone = expiresAt ? await memberTimeZone(clientId) : null;
    await notifyMember('credits added', clientId, creditsAddedMessage({ amount: Number(pack.credits), packName: pack.name as string, expiresAt, timeZone }));
  } catch {
    // Best effort, as above.
  }
}
