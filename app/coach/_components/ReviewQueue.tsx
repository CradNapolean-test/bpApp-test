'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ChevronDown, ClipboardCheck } from 'lucide-react';
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
    <div className="mb-4 rounded-2xl border border-amber-500/30 bg-amber-50 dark:bg-amber-500/10">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex w-full items-center justify-between gap-2 px-4 py-3">
        <span className="flex items-center gap-2 text-sm font-extrabold text-amber-800 dark:text-amber-300">
          <ClipboardCheck className="h-4 w-4" /> {mine.length} of your new member{mine.length === 1 ? '' : 's'} to review
        </span>
        <ChevronDown className={`h-4 w-4 text-amber-800 transition-transform dark:text-amber-300 ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="space-y-1.5 px-4 pb-4">
          <ul className="space-y-1.5">
            {mine.map((i) => (
              <li key={i.clientId}>
                <Link href={`/coach/clients/${i.clientId}`} className="flex flex-col rounded-xl bg-white/70 px-3 py-2 text-sm dark:bg-black/20">
                  <span className="font-bold text-black dark:text-zinc-50">{i.name}</span>
                  {i.reasons.length > 1 && <span className="text-xs text-zinc-600 dark:text-zinc-400">{i.reasons.filter((r) => r !== 'New member: check the starting plan').join(' · ')}</span>}
                </Link>
              </li>
            ))}
          </ul>
          {others > 0 && (
            <p className="px-1 pt-1 text-xs text-amber-800 dark:text-amber-300">
              {others} more new member{others === 1 ? '' : 's'} at {gymName} {others === 1 ? 'belongs' : 'belong'} to other coaches.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
