// The contact a push sender gives the push services (R42). VAPID requires one, and the services use it to reach the sender if there is a
// problem. It used to fall back to a personal Gmail address typed into the code; now it is only ever what the owner sets, and with none the
// app does not send push at all (and says so) instead of publishing someone's address.

export interface PushEnv {
  VAPID_PUBLIC_KEY?: string;
  VAPID_PRIVATE_KEY?: string;
  VAPID_SUBJECT?: string;
  SUPPORT_EMAIL?: string;
}

export type PushConfig = { ok: true; subject: string } | { ok: false; reason: 'not-configured' | 'no-contact' };

// VAPID_SUBJECT is a mailto: or https: address; SUPPORT_EMAIL is a plain address and is turned into a mailto:.
export function vapidSubject(env: Pick<PushEnv, 'VAPID_SUBJECT' | 'SUPPORT_EMAIL'>): string | null {
  const subject = env.VAPID_SUBJECT?.trim();
  if (subject) return /^(mailto:|https:\/\/)/i.test(subject) ? subject : `mailto:${subject}`;
  const support = env.SUPPORT_EMAIL?.trim();
  return support ? `mailto:${support}` : null;
}

export function checkPushConfig(env: PushEnv): PushConfig {
  if (!env.VAPID_PUBLIC_KEY?.trim() || !env.VAPID_PRIVATE_KEY?.trim()) return { ok: false, reason: 'not-configured' };
  const subject = vapidSubject(env);
  return subject ? { ok: true, subject } : { ok: false, reason: 'no-contact' };
}

// What a failed send was, without anything that identifies the device: the push service's HTTP status, or "network" for no answer.
export function pushFailureKey(error: unknown): string {
  const status = (error as { statusCode?: unknown } | null)?.statusCode;
  return typeof status === 'number' ? String(status) : 'network';
}
