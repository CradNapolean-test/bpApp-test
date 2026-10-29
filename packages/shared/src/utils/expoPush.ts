// Push notifications to the phone app (via Expo's push service), kept pure so the web app's sender and the phone share one
// set of rules and both can be tested. The sender is apps/web/lib/expoPush.ts; the phone's side is apps/mobile/src/lib/push.ts.

export const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
// Expo accepts at most 100 messages per request.
export const EXPO_BATCH_SIZE = 100;
// A lock-screen notification shows a few lines; the full text is in the app.
export const PUSH_TITLE_MAX = 80;
export const PUSH_BODY_MAX = 200;

// Same shape the database insists on (migration 0113): ExponentPushToken[...] with a plain id inside.
export function isExpoPushToken(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 200 && /^Expo(nent)?PushToken\[[A-Za-z0-9_-]{10,100}\]$/.test(value);
}

export type PushPayload = { title: string; body: string; url?: string };

export type ExpoMessage = {
  to: string;
  title: string;
  body: string;
  data: { url: string };
  sound: 'default';
  priority: 'high';
  channelId: 'default';
};

const clip = (text: string, max: number) => {
  const t = text.trim();
  return t.length > max ? `${t.slice(0, max - 3)}...` : t;
};

// One message per phone. The same `url` the web's browser push carries rides along as data, and the phone maps it to a screen
// (routeForPushUrl). Anything that is not a plausible Expo token is left out rather than sent.
export function buildExpoMessages(tokens: string[], payload: PushPayload): ExpoMessage[] {
  return [...new Set(tokens)].filter(isExpoPushToken).map((to) => ({
    to,
    title: clip(payload.title, PUSH_TITLE_MAX),
    body: clip(payload.body, PUSH_BODY_MAX),
    data: { url: payload.url ?? '/dashboard' },
    sound: 'default',
    priority: 'high',
    channelId: 'default',
  }));
}

export function inBatches<T>(items: T[], size: number = EXPO_BATCH_SIZE): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export type TicketSummary = { sent: number; failed: number; deadTokens: string[] };

// Expo answers a batch with one "ticket" per message, in the same order. An error ticket "DeviceNotRegistered" means the app
// was uninstalled or its permission removed: that token is dead and should be forgotten. Anything unexpected (the request
// failed, the answer is not a list of the right length) counts every message as failed and forgets nothing.
export function summariseTickets(tokens: string[], tickets: unknown): TicketSummary {
  if (!Array.isArray(tickets) || tickets.length !== tokens.length) return { sent: 0, failed: tokens.length, deadTokens: [] };
  let sent = 0;
  let failed = 0;
  const deadTokens: string[] = [];
  tickets.forEach((t: { status?: unknown; details?: { error?: unknown } } | null, i) => {
    if (t && t.status === 'ok') sent += 1;
    else {
      failed += 1;
      if (t && t.status === 'error' && t.details?.error === 'DeviceNotRegistered') deadTokens.push(tokens[i]);
    }
  });
  return { sent, failed, deadTokens };
}

// ---------- tapping a notification ----------

// The web's notifications carry /dashboard?open=<where> (and the phone app must understand them without the web changing).
const WEB_OPEN_TO_SCREEN: Record<string, string> = {
  messages: '/chat',
  book: '/classes',
  checkin: '/checkin',
  nutrition: '/food',
};

// Screens a notification may open when it names one directly.
const APP_SCREENS = new Set(['/', '/chat', '/classes', '/checkin', '/food', '/notifications', '/workouts', '/forms', '/credits', '/progress', '/events', '/rewards', '/learn']);

export const DEFAULT_PUSH_SCREEN = '/notifications';

// Where a tapped notification goes. Only ever one of the app's own screens, whatever the notification says: a missing, odd or
// unknown link opens the notifications list, where everything the member was told is kept.
export function routeForPushUrl(url: unknown): string {
  if (typeof url !== 'string' || !url.startsWith('/') || url.startsWith('//')) return DEFAULT_PUSH_SCREEN;
  let parsed: URL;
  try {
    parsed = new URL(url, 'https://app.invalid');
  } catch {
    return DEFAULT_PUSH_SCREEN;
  }
  if (parsed.pathname === '/dashboard') {
    const open = parsed.searchParams.get('open');
    if (!open) return '/';
    return WEB_OPEN_TO_SCREEN[open] ?? DEFAULT_PUSH_SCREEN;
  }
  return APP_SCREENS.has(parsed.pathname) ? parsed.pathname : DEFAULT_PUSH_SCREEN;
}
