'use server';

import { raise } from './errors';
import { createClient } from '@/lib/supabase/server';
import type { PushSubscriptionRow } from './types';

// Called from the client's own browser after PushManager.subscribe() succeeds, and again on each sign-in for a browser that already has
// a subscription (R18). register_web_push (migration 0128) never takes a person's id: it moves the browser's endpoint to whoever is
// signed in, so a phone shared between two members sends one person's pushes to one person. The direct upsert is only the fallback for
// a database that does not have the function yet.
export async function registerPushSubscription(subscription: { endpoint: string; p256dh: string; auth: string }): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.rpc('register_web_push', {
    p_endpoint: subscription.endpoint,
    p_p256dh: subscription.p256dh,
    p_auth: subscription.auth,
  });
  if (!error) return;
  if (!/could not find the function|does not exist|schema cache/i.test(error.message)) raise(error);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');
  const { error: fallbackError } = await supabase
    .from('push_subscriptions')
    .upsert(
      { client_id: user.id, endpoint: subscription.endpoint, p256dh: subscription.p256dh, auth: subscription.auth },
      { onConflict: 'client_id,endpoint' }
    );
  if (fallbackError) raise(fallbackError);
}

// Called on explicit opt-out (toggle off) and by /api/push/send when a send comes back
// 404/410 (the browser's push service has confirmed this subscription is dead).
export async function deletePushSubscription(endpoint: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint);
  if (error) raise(error);
}

export async function getPushSubscriptionsForClient(clientId: string): Promise<PushSubscriptionRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from('push_subscriptions').select('*').eq('client_id', clientId);
  if (error) raise(error);
  return data ?? [];
}

export async function hasPushSubscription(clientId: string): Promise<boolean> {
  const rows = await getPushSubscriptionsForClient(clientId);
  return rows.length > 0;
}
