'use client';

import { useEffect, useState } from 'react';
import { Check, Copy, Link2 } from 'lucide-react';
import { getMyJoinLinkToken, setJoinLinkActive } from '@/lib/data/onboarding';
import { useToast } from '@/app/_components/ToastProvider';

// The coach's reusable sign-up link: paste it into the Ontraport welcome email. Anyone who opens
// it can create a login attached to this coach, then goes through onboarding.
export function JoinLinkCard() {
  const toast = useToast();
  const [link, setLink] = useState<{ token: string; active: boolean } | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    getMyJoinLinkToken().then(setLink);
  }, []);

  if (!link) return null;
  const url = `${window.location.origin}/join/${link.token}`;

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
    const next = !link!.active;
    const res = await setJoinLinkActive(next);
    if (res.ok) {
      setLink({ ...link!, active: next });
      toast.success(next ? 'Sign-up link switched on' : 'Sign-up link switched off');
    } else {
      toast.error(res.error ?? 'Could not update the link');
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
      <p className={`mt-2 break-all rounded-lg bg-black/[.04] p-2 font-mono text-[11px] dark:bg-white/[.06] ${link.active ? '' : 'opacity-50'}`}>{url}</p>
      <div className="mt-2 flex items-center justify-between">
        <button type="button" onClick={copy} className="flex items-center gap-1.5 rounded-full bg-accent px-3.5 py-1.5 text-xs font-bold text-accent-foreground">
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? 'Copied' : 'Copy link'}
        </button>
        <button type="button" onClick={toggle} className="text-xs font-semibold text-zinc-500 underline">
          {link.active ? 'Switch link off' : 'Switch link on'}
        </button>
      </div>
    </div>
  );
}
