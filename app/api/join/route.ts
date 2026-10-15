import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { createClient as createAnonClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/admin';
import { isMissingColumnError } from '@/lib/onboarding';
import { DAY, HOUR, adminRateStore, clientIpKey, takeToken } from '@/lib/rateLimit';
import {
  IP_ATTEMPTS_PER_HOUR,
  confirmationRequired,
  isExistingAccountAnswer,
  isMailRateLimit,
  joinFailure,
  linkDailyLimit,
  linkUsable,
  validateJoinInput,
  type JoinFailure,
} from '@/lib/joinFlow';

// Public endpoint behind a coach's sign-up link: creates a member login attached to that coach and their gym. It needs the link's token (the
// secret) and grants nothing beyond a bare account: no membership, credits or access to anyone else's data.
//
// M7 (decision D17): five attempts per address per hour; a daily cap per link (onboarding_links.max_uses_per_day, default 50) and an
// optional end date; the new member confirms their email before signing in (JOIN_EMAIL_CONFIRMATION=false keeps the old one-step flow);
// and every failure that is not a typing mistake says the same thing, so this page cannot be used to find out which emails have accounts.
// The real reasons go to Sentry (no addresses, no passwords).

function refuse(kind: JoinFailure, extra?: { retryAfterSeconds?: number }) {
  const { status, error } = joinFailure(kind);
  return NextResponse.json({ error }, { status, headers: extra?.retryAfterSeconds ? { 'Retry-After': String(extra.retryAfterSeconds) } : undefined });
}

function report(reason: string, error?: unknown) {
  const message = error && typeof error === 'object' && 'message' in error ? String((error as { message?: unknown }).message) : undefined;
  Sentry.captureMessage(`Sign-up refused: ${reason}`, { level: 'warning', tags: { area: 'join' }, extra: message ? { providerMessage: message.replace(/[^\s<>"',;()]+@[^\s<>"',;()]+/g, '[address]').slice(0, 200) } : undefined });
}

export async function POST(request: Request) {
  const input = validateJoinInput(await request.json().catch(() => null));
  if (!input.ok) return refuse(input.failure);
  const { token, email, password } = input;

  const store = adminRateStore();
  const onFailure = (e: unknown) => report('rate counter unavailable', e);

  // 1. Per address: 5 attempts an hour, whatever the link or the email. A broken counter lets the request through (sign-up must not stop).
  const ip = await takeToken(store, `join:ip:${clientIpKey(request)}`, IP_ATTEMPTS_PER_HOUR, HOUR, { onError: 'allow', onFailure });
  if (!ip.allowed) return refuse('ip-limit', { retryAfterSeconds: ip.retryAfterSeconds });

  const admin = createAdminClient();
  // 2. The link. The two newer columns arrive with migration 0140; before it the link is read without them.
  const selectLink = (withLimits: boolean) =>
    admin.from('onboarding_links').select(withLimits ? 'coach_id, active, expires_at, max_uses_per_day' : 'coach_id, active').eq('token', token).maybeSingle();
  let found = await selectLink(true);
  if (found.error && isMissingColumnError(found.error, 'max_uses_per_day')) found = await selectLink(false);
  const link = found.data as { coach_id: string; active: boolean; expires_at?: string | null; max_uses_per_day?: number | null } | null;
  if (linkUsable(link, Date.now()) !== 'ok' || !link) return refuse('bad-link');

  // 3. Per link: a daily cap, so one leaked link cannot fill a coach's client list.
  const perLink = await takeToken(store, `join:link:${createHash('sha256').update(token).digest('hex').slice(0, 16)}`, linkDailyLimit(link), DAY, { onError: 'allow', onFailure });
  if (!perLink.allowed) return refuse('link-limit', { retryAfterSeconds: perLink.retryAfterSeconds });

  const { data: coach } = await admin.from('profiles').select('gym_id').eq('id', link.coach_id).maybeSingle();
  const profileRow = (id: string) => ({ id, role: 'client', coach_id: link.coach_id, gym_id: coach?.gym_id ?? null, email });

  if (confirmationRequired(process.env.JOIN_EMAIL_CONFIRMATION)) {
    // The login is created unconfirmed and Supabase emails the confirmation (it uses its own mailer, so this works without Resend). The member
    // signs in after confirming. An address that already has an account gets the same answer as a new one.
    const anon = createAnonClient(process.env.NEXT_PUBLIC_SUPABASE_URL as string, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await anon.auth.signUp({ email, password, options: { emailRedirectTo: `${new URL(request.url).origin}/login` } });
    if (error) {
      if (isMailRateLimit(error)) return refuse('mail-busy');
      report('sign-up failed', error);
      return refuse('create-failed');
    }
    if (!data.user) {
      report('sign-up returned no user');
      return refuse('create-failed');
    }
    if (isExistingAccountAnswer(data.user)) return NextResponse.json({ ok: true, confirm: true });

    const { error: profileError } = await admin.from('profiles').insert(profileRow(data.user.id));
    if (profileError) {
      report('profile insert failed', profileError);
      // Don't leave an orphan login that can't be used.
      await admin.auth.admin.deleteUser(data.user.id);
      return refuse('profile-failed');
    }
    // No session means the project wants the email confirmed first; a session means confirmation is switched off in Supabase.
    return NextResponse.json({ ok: true, confirm: !data.session });
  }

  // The one-step flow (JOIN_EMAIL_CONFIRMATION=false): the address is marked verified without proof.
  const { data: newUser, error: createUserError } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (createUserError || !newUser?.user) {
    report('create user failed', createUserError);
    return refuse(/already|registered|exists/i.test(createUserError?.message ?? '') ? 'exists' : 'create-failed');
  }
  const { error: profileError } = await admin.from('profiles').insert(profileRow(newUser.user.id));
  if (profileError) {
    report('profile insert failed', profileError);
    await admin.auth.admin.deleteUser(newUser.user.id);
    return refuse('profile-failed');
  }
  return NextResponse.json({ ok: true, confirm: false });
}
