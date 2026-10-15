import webpush from 'web-push';
import * as Sentry from '@sentry/nextjs';
import { createAdminClient } from '@/lib/supabase/admin';
import { checkPushConfig, pushFailureKey } from '@/lib/pushConfig';

// Browser Web Push, the only push this project sends. Server-only, mirrors lib/email.ts's graceful-degradation contract: missing VAPID keys
// (or no contact for the push services, R42) means "skip sending, and say so" rather than throwing -- callers already have working
// in-app-notification delivery, so a push send shouldn't fail the caller outright just because push isn't configured yet.
//
// NOT here, on purpose (R39, decision D10): the push_devices table and register_push_device (migration 0113) are groundwork for a phone
// app that is not part of this project. Nothing reads them and nothing sends to them; do not build Expo sending. The owner can drop them
// with one migration if they decide to.
//
// Failures are counted and reported (R41): sendPushTo* return what happened, callers log it with reportPushResult, and nothing here ever
// reports an endpoint or a person.

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
  // A phone replaces an earlier notification with the same tag instead of stacking them (public/sw.js must pass it to showNotification).
  tag?: string;
}

export interface PushSendResult {
  sent: number;
  failed: number;
  // true when nothing was attempted (no VAPID keys, or no contact for the push services)
  skipped: boolean;
  reason?: 'not-configured' | 'no-contact';
  // Failures by HTTP status ("410": 2, "network": 1), never an endpoint.
  reasons: Record<string, number>;
}

let warnedNoContact = false;

function ensureConfigured(): { ok: true } | { ok: false; reason: 'not-configured' | 'no-contact' } {
  const config = checkPushConfig({
    VAPID_PUBLIC_KEY: process.env.VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY: process.env.VAPID_PRIVATE_KEY,
    VAPID_SUBJECT: process.env.VAPID_SUBJECT,
    SUPPORT_EMAIL: process.env.SUPPORT_EMAIL,
  });
  if (!config.ok) {
    if (config.reason === 'no-contact' && !warnedNoContact) {
      warnedNoContact = true;
      Sentry.captureMessage('Push is switched off: set VAPID_SUBJECT or SUPPORT_EMAIL (push services need a contact for the sender)', { level: 'warning', tags: { area: 'push' } });
    }
    return config;
  }
  webpush.setVapidDetails(config.subject, process.env.VAPID_PUBLIC_KEY as string, process.env.VAPID_PRIVATE_KEY as string);
  return { ok: true };
}

// Sends to every subscription (browser/device) this person has registered. Uses the admin client, not the RLS-scoped server client --
// this runs from trusted server contexts (cron routes, the /api/push/send webhook route, after a message is stored) with no end-user
// session to scope RLS against. push_subscriptions.client_id holds the person's profile id, whether they are a member or a coach.
async function sendPushToProfile(profileId: string, payload: PushPayload): Promise<PushSendResult> {
  const config = ensureConfigured();
  if (!config.ok) return { sent: 0, failed: 0, skipped: true, reason: config.reason, reasons: {} };

  const admin = createAdminClient();
  const { data: subscriptions, error } = await admin
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth')
    .eq('client_id', profileId);
  if (error) throw error;
  if (!subscriptions || subscriptions.length === 0) {
    return { sent: 0, failed: 0, skipped: false, reasons: {} };
  }

  const body = JSON.stringify({ title: payload.title, body: payload.body, url: payload.url ?? '/', ...(payload.tag ? { tag: payload.tag } : {}) });
  let sent = 0;
  let failed = 0;
  const reasons: Record<string, number> = {};

  await Promise.all(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, body);
        sent += 1;
      } catch (err: unknown) {
        failed += 1;
        const key = pushFailureKey(err);
        reasons[key] = (reasons[key] ?? 0) + 1;
        // 404/410 means the browser's push service has confirmed this subscription is dead
        // (permission revoked, site data cleared, etc.) -- prune it so future sends don't
        // keep paying for a doomed request.
        if (key === '404' || key === '410') {
          await admin.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
        }
      }
    })
  );

  return { sent, failed, skipped: false, reasons };
}

export function sendPushToClient(clientId: string, payload: PushPayload): Promise<PushSendResult> {
  return sendPushToProfile(clientId, payload);
}

// A coach's own devices (R40): they opt in on their Settings page, which writes push_subscriptions for the coach's own profile id.
export function sendPushToCoach(coachId: string, payload: PushPayload): Promise<PushSendResult> {
  return sendPushToProfile(coachId, payload);
}

// What every caller does with a result (R41): failures go to Sentry with counts and HTTP statuses (no endpoints, no people), so a push that
// keeps failing is visible instead of silently thrown away. A dead subscription (404/410) is normal housekeeping, not a problem.
export function reportPushResult(label: string, result: PushSendResult): void {
  const dead = (result.reasons['404'] ?? 0) + (result.reasons['410'] ?? 0);
  if (result.failed - dead <= 0) return;
  Sentry.captureMessage(`Push failed: ${label}`, { level: 'warning', tags: { area: 'push' }, extra: { sent: result.sent, failed: result.failed, reasons: result.reasons } });
}

// For a caller that does not care about the details: send, report, never throw.
export async function pushQuietly(label: string, send: () => Promise<PushSendResult>): Promise<PushSendResult | null> {
  try {
    const result = await send();
    reportPushResult(label, result);
    return result;
  } catch (err) {
    Sentry.captureException(err instanceof Error ? err : new Error(String(err)), { tags: { area: 'push' }, extra: { label } });
    return null;
  }
}
