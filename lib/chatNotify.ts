import { createAdminClient } from '@/lib/supabase/admin';
import { coachPushPayload, decideCoachPush } from '@/lib/coachPush';
import { pushQuietly, sendPushToClient, sendPushToCoach } from '@/lib/push';
import { DEFAULT_TIMEZONE } from '@/lib/utils/dates';

// Push after a chat message is stored (R40, R41). Server-only; lib/data/chat.ts runs it after the response has gone, so a slow push service
// never slows the sender down, and nothing here may throw into the caller.

// The coach wrote: ping the member's phone (when they have push on). The member sees the start of the message.
export async function pushMemberOfCoachMessage(clientId: string, preview: string): Promise<void> {
  await pushQuietly('chat: coach to member', () =>
    sendPushToClient(clientId, {
      title: 'New message from your coach',
      body: preview.length > 120 ? `${preview.slice(0, 117)}...` : preview,
      url: '/dashboard?open=messages',
      tag: `chat-${clientId}`,
    })
  );
}

// The member wrote: tell their coach, unless it is quiet hours at the gym or the member is mid-burst (lib/coachPush.ts). The notification
// names the member but never carries what they wrote. `createdAt` is when the message was stored, so the message itself is not mistaken
// for the "previous" one.
export async function pushCoachOfMemberMessage(clientId: string, createdAt: string = new Date().toISOString()): Promise<void> {
  try {
    const admin = createAdminClient();
    const { data: member } = await admin.from('profiles').select('coach_id, gym_id').eq('id', clientId).maybeSingle();
    const coachId = member?.coach_id as string | null | undefined;
    if (!coachId) return;

    const [{ data: gym }, { data: previous }, { data: profile }] = await Promise.all([
      member?.gym_id ? admin.from('gyms').select('timezone').eq('id', member.gym_id).maybeSingle() : Promise.resolve({ data: null }),
      admin
        .from('chat_messages')
        .select('created_at')
        .eq('client_id', clientId)
        .eq('sender_id', clientId)
        .lt('created_at', createdAt)
        .order('created_at', { ascending: false })
        .limit(1),
      admin.from('client_profiles').select('name').eq('client_id', clientId).maybeSingle(),
    ]);

    const previousAt = (previous as { created_at: string }[] | null)?.[0]?.created_at;
    const decision = decideCoachPush({
      now: new Date(),
      timeZone: ((gym as { timezone?: string | null } | null)?.timezone as string | null | undefined) || DEFAULT_TIMEZONE,
      previousMemberMessageAt: previousAt ? new Date(previousAt) : null,
    });
    if (!decision.push) return;

    await pushQuietly('chat: member to coach', () => sendPushToCoach(coachId, coachPushPayload((profile?.name as string | null | undefined) ?? null, clientId)));
  } catch {
    // Best effort: a missed notification never fails the message.
  }
}

// One entry point for chat.ts: who wrote decides who is told.
export async function notifyAfterMessage(input: { senderId: string; clientId: string; preview: string; createdAt?: string }): Promise<void> {
  if (input.senderId === input.clientId) return pushCoachOfMemberMessage(input.clientId, input.createdAt);
  return pushMemberOfCoachMessage(input.clientId, input.preview);
}
