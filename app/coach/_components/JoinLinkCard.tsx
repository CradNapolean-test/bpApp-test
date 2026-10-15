'use client';

import { useState } from 'react';
import { Check, Copy, Link2 } from 'lucide-react';
import { createOrResetMyJoinLink, getMyJoinLinkToken, setJoinLinkActive } from '@/lib/data/onboarding';
import { useConfirm } from '@/app/_components/ConfirmDialog';
import { useOnDemand } from '@/app/_components/useOnDemand';
import { useToast } from '@/app/_components/ToastProvider';

type Link = { token: string; active: boolean };

// The coach's reusable sign-up link: paste it into the Ontraport welcome email. Anyone who opens
// it can create a login attached to this coach, then goes through onboarding.
//
// Opening this card only reads (JL1): the link is made on an explicit "Create sign-up link" click, and "Reset link" makes a new one
// so a leaked address stops working. A failed read says so and offers Retry instead of hiding the card.
export function JoinLinkCard() {
  const toast = useToast();
  const confirm = useConfirm();
  const { data, loading, error, reload } = useOnDemand(() => getMyJoinLinkToken(), 'join-link');
  // What this card changed itself (made, reset, switched on or off) wins over what was read when it opened.
  const [local, setLocal] = useState<Link | null | undefined>(undefined);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);

  const failure = error ? 'Could not load your sign-up link.' : data && !data.ok ? data.error : null;
  const ready = local !== undefined || (data?.ok === true);
  const link: Link | null = local !== undefined ? local : data?.ok ? data.link : null;
  const url = link ? `${window.location.origin}/join/${link.token}` : '';

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Could not copy. Select the link and copy it by hand.');
    }
  }

  async function toggle() {
    if (!link) return;
    const next = !link.active;
    setBusy(true);
    try {
      const res = await setJoinLinkActive(next);
      if (res.ok) {
        setLocal({ ...link, active: next });
        toast.success(next ? 'Sign-up link switched on' : 'Sign-up link switched off');
      } else {
        toast.error(res.error ?? 'Could not update the link');
      }
    } finally {
      setBusy(false);
    }
  }

  async function makeLink(isReset: boolean) {
    if (isReset) {
      const ok = await confirm({
        title: 'Reset your sign-up link?',
        body: 'You get a new address and the old one stops working at once. Anywhere you pasted the old link (for example your Ontraport welcome email) needs the new one.',
        confirmLabel: 'Reset link',
        destructive: true,
      });
      if (!ok) return;
    }
    setBusy(true);
    try {
      const res = await createOrResetMyJoinLink();
      if (res.ok) {
        setLocal(res.link);
        toast.success(isReset ? 'New sign-up link made. The old one no longer works.' : 'Sign-up link created');
      } else {
        toast.error(res.error);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-4 border-t border-black/[.06] pt-4 dark:border-white/10">
      <p className="flex items-center gap-1.5 text-sm font-bold text-black dark:text-zinc-50">
        <Link2 className="h-4 w-4" /> New member sign-up link
      </p>
      <p className="mt-1 text-xs text-zinc-500">
        Add this to your Ontraport welcome email. New members create their own login, answer the onboarding questions and
        get a starting plan. You&apos;ll be asked to review it.
      </p>

      {loading && local === undefined && <p className="mt-2 text-xs text-zinc-500">Loading your link…</p>}

      {failure && local === undefined && (
        <div className="mt-2 rounded-lg bg-danger/10 p-2.5 text-xs text-danger" role="alert">
          <p>{failure}</p>
          <button type="button" onClick={reload} className="mt-1.5 font-bold underline">
            Try again
          </button>
        </div>
      )}

      {ready && !link && (
        <button
          type="button"
          disabled={busy}
          onClick={() => void makeLink(false)}
          className="mt-2 rounded-full bg-accent px-3.5 py-1.5 text-xs font-bold text-accent-foreground disabled:opacity-50"
        >
          {busy ? 'Creating…' : 'Create sign-up link'}
        </button>
      )}

      {link && (
        <>
          <p className={`mt-2 break-all rounded-lg bg-black/[.04] p-2 font-mono text-[11px] dark:bg-white/[.06] ${link.active ? '' : 'opacity-50'}`}>{url}</p>
          <div className="mt-2 flex items-center justify-between gap-3">
            <button type="button" onClick={copy} className="flex items-center gap-1.5 rounded-full bg-accent px-3.5 py-1.5 text-xs font-bold text-accent-foreground">
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? 'Copied' : 'Copy link'}
            </button>
            <div className="flex items-center gap-3">
              <button type="button" disabled={busy} onClick={toggle} className="text-xs font-semibold text-zinc-500 underline disabled:opacity-50">
                {link.active ? 'Switch link off' : 'Switch link on'}
              </button>
              <button type="button" disabled={busy} onClick={() => void makeLink(true)} className="text-xs font-semibold text-zinc-500 underline disabled:opacity-50">
                Reset link
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
