'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ChevronDown } from 'lucide-react';
import { Avatar } from '@/app/_components/Avatar';
import type { ReviewQueueItem } from '@/lib/data/onboarding';

// The coach's own new members who finished onboarding and are waiting for them to check their starting plan. One line until opened,
// so it does not push the member list off a phone screen. It used to count the whole gym and list other coaches' members unlabelled
// (CL2): now it lists the coach's own and only says how many more are waiting with other coaches at this gym. The same members as the
// "New to review" filter (My clients) and the dashboard's "New members to review" (CL16).
export function ReviewQueue({ items, gymName = 'the gym' }: { items: ReviewQueueItem[]; gymName?: string }) {
  const [open, setOpen] = useState(false);
  const mine = items.filter((i) => i.mine);
  const others = items.length - mine.length;
  if (mine.length === 0) return null;
  return (
    <section aria-label="New members to review" className="rounded-[20px] bg-[#1d1d1b] px-5 py-4 text-zinc-100 sm:px-6 dark:border dark:border-white/10">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
        <div className="flex -space-x-2" aria-hidden>
          {mine.slice(0, 4).map((i) => (
            <span key={i.clientId} className="rounded-full ring-2 ring-[#1d1d1b]">
              <Avatar name={i.name} size="md" />
            </span>
          ))}
        </div>
        <div className="min-w-0 flex-1 basis-60">
          <h2 className="text-lg font-extrabold">
            {mine.length === 1 ? '1 new member is' : `${mine.length} new members are`} waiting for their plan
          </h2>
          <p className="text-sm text-zinc-400">They have finished signing up. Check their details and set their targets.</p>
        </div>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex h-11 shrink-0 items-center gap-1.5 rounded-xl bg-accent px-4 text-sm font-extrabold text-accent-foreground"
        >
          {open ? 'Hide' : mine.length === 1 ? 'Review' : `Review all ${mine.length}`}
          <ChevronDown className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
      </div>
      {open && (
        <div className="mt-4 space-y-1.5">
          <ul className="space-y-1.5">
            {mine.map((i) => (
              <li key={i.clientId}>
                <Link href={`/coach/clients/${i.clientId}`} className="flex flex-col rounded-xl bg-white/[.08] px-3 py-2.5 text-sm hover:bg-white/[.12]">
                  <span className="font-bold text-white">{i.name}</span>
                  {i.reasons.length > 1 && <span className="text-xs text-zinc-400">{i.reasons.filter((r) => r !== 'New member: check the starting plan').join(' · ')}</span>}
                </Link>
              </li>
            ))}
          </ul>
          {others > 0 && (
            <p className="px-1 pt-1 text-xs text-zinc-400">
              {others} more new member{others === 1 ? '' : 's'} at {gymName} {others === 1 ? 'belongs' : 'belong'} to other coaches.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
