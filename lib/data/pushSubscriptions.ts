'use server';

import { raise } from './errors';
import { createClient } from '@/lib/supabase/server';
import type { PushSubscriptionRow } from './types';

// Called from the client's own browser after PushManager.subscribe() succeeds -- upsert on
// (client_id, endpoint) since re-subscribing the same browser/device (e.g. after clearing
// site data) should replace the old keys, not create a duplicate row.
export async function savePushSubscription(
  clientId: string,
  subscription: { endpoint: string; p256dh: string; auth: string }
): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from('push_subscriptions')
    .upsert(
      { client_id: clientId, endpoint: subscription.endpoint, p256dh: subscription.p256dh, auth: subscription.auth },
      { onConflict: 'client_id,endpoint' }
    );
  if (error) raise(error);
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
