import { createAdminClient } from '@/lib/supabase/admin';
import { pushQuietly, sendPushToClient } from '@/lib/push';
import { creditsAddedMessage, planReadyMessage, programmeAssignedMessage, type MemberMessage } from '@/lib/memberPush';

// Tells a member about something their coach just did for them (decision D20): the in-app notice, then the push. Server-only. The server
// actions call these with after(), once their database call has succeeded, so a slow push service never slows the coach down and nothing
// here can fail or undo the action. Never throws. The admin client writes the notice because a coach cannot write a member's
// notifications; nothing read here goes back to the coach.

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
