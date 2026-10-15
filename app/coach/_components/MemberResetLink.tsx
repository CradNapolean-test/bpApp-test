'use client';

import { useState } from 'react';
import { useConfirm } from '@/app/_components/ConfirmDialog';
import { useToast } from '@/app/_components/ToastProvider';

// "Send password reset link" on a member's page (CL6): for a member who cannot sign in. It makes a one-time link, emails it to the member when
// email is set up, and shows it here to copy for when it is not.
export function MemberResetLink({ clientId }: { clientId: string }) {
  const confirm = useConfirm();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ link: string; email: string; emailed: boolean } | null>(null);

  async function send() {
    const ok = await confirm({
      title: 'Send a password reset link?',
      body: 'The member gets an email with a link to choose a new password (if email is set up). You also get a copy of the link here. Anyone holding the link can sign in as the member, so only pass it to them.',
      confirmLabel: 'Send link',
    });
    if (!ok) return;
    setBusy(true);
    try {
      const res = await fetch('/api/coach/reset-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(body.error ?? 'Could not make the link. Please try again.');
        return;
      }
      setResult({ link: body.link, email: body.email, emailed: body.emailed === true });
      toast.success(body.emailed ? 'Link emailed to the member' : 'Link made. Copy it and send it to them.');
    } catch {
      toast.error('Could not reach the server. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  }

  function copy() {
    if (!result) return;
    navigator.clipboard.writeText(result.link).then(
      () => toast.success('Link copied'),
      () => toast.error('Could not copy. Select the link and copy it by hand.')
    );
  }

  return (
    <div className="rounded-2xl border border-black/[.05] bg-card p-4 dark:border-white/10">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-zinc-500">Can&apos;t sign in? Send a link for choosing a new password.</p>
        <button
          type="button"
          disabled={busy}
          onClick={() => void send()}
          className="shrink-0 rounded-full border border-black/10 px-3.5 py-1.5 text-xs font-bold disabled:opacity-50 dark:border-white/15"
        >
          {busy ? 'Making link…' : 'Send password reset link'}
        </button>
      </div>
      {result && (
        <div className="mt-3 space-y-2 border-t border-black/[.06] pt-3 dark:border-white/10">
          <p className="text-xs text-zinc-600 dark:text-zinc-400">
            {result.emailed
              ? `Emailed to ${result.email}. If it does not arrive, copy the link below and send it to them yourself.`
              : 'Email is not set up for this app, so nothing was sent. Copy the link and send it to the member yourself.'}
          </p>
          <p className="break-all rounded-lg bg-black/[.04] p-2 font-mono text-[11px] dark:bg-white/[.06]">{result.link}</p>
          <div className="flex items-center gap-3">
            <button type="button" onClick={copy} className="rounded-full bg-accent px-3.5 py-1.5 text-xs font-bold text-accent-foreground">
              Copy link
            </button>
            <button type="button" onClick={() => setResult(null)} className="text-xs font-semibold text-zinc-500 underline">
              Hide
            </button>
          </div>
          <p className="text-[11px] text-zinc-400">It works once and runs out after about an hour.</p>
        </div>
      )}
    </div>
  );
}
