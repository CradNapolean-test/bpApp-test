import webpush from 'web-push';
import { createAdminClient } from '@/lib/supabase/admin';

// Server-only, mirrors lib/email.ts's graceful-degradation contract: missing VAPID keys means
// "skip sending" rather than throwing -- callers already have working in-app-notification
// delivery, so a push send shouldn't fail the caller outright just because push isn't
// configured yet.
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
// Required by the VAPID spec -- push services (FCM, Mozilla's push service) use this to
// contact the sender if there's an abuse/behavior issue with sends, not user-facing. Defaults
// to the coach's own contact address; override with VAPID_SUBJECT if that should be different.
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:basfitnz@gmail.com';

let configured = false;
function ensureConfigured(): boolean {
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) return false;
  if (!configured) {
    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
    configured = true;
  }
  return true;
}

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
}

export interface PushSendResult {
  sent: number;
  failed: number;
  skipped: boolean; // true when VAPID keys aren't set -- nothing was attempted
}

// Sends to every subscription (browser/device) this client has registered. Uses the admin
// client, not the RLS-scoped server client -- this runs from trusted server contexts (cron
// routes, the /api/push/send webhook route) with no end-user session to scope RLS against.
export async function sendPushToClient(clientId: string, payload: PushPayload): Promise<PushSendResult> {
  if (!ensureConfigured()) {
    return { sent: 0, failed: 0, skipped: true };
  }

  const admin = createAdminClient();
  const { data: subscriptions, error } = await admin
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth')
    .eq('client_id', clientId);
  if (error) throw error;
  if (!subscriptions || subscriptions.length === 0) {
    return { sent: 0, failed: 0, skipped: false };
  }

  const body = JSON.stringify({ title: payload.title, body: payload.body, url: payload.url ?? '/' });
  let sent = 0;
  let failed = 0;

  await Promise.all(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          body
        );
        sent += 1;
      } catch (err: unknown) {
        failed += 1;
        // 404/410 means the browser's push service has confirmed this subscription is dead
        // (permission revoked, site data cleared, etc.) -- prune it so future sends don't
        // keep paying for a doomed request.
        const statusCode = (err as { statusCode?: number })?.statusCode;
        if (statusCode === 404 || statusCode === 410) {
          await admin.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
        }
      }
    })
  );

  return { sent, failed, skipped: false };
}
