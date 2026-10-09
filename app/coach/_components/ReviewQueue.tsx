'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ChevronDown, ClipboardCheck } from 'lucide-react';
import type { ReviewQueueItem } from '@/lib/data/onboarding';

// New members who finished onboarding and are waiting for the coach to check their starting plan.
// One line until opened, so it does not push the member list off a phone screen.
export function ReviewQueue({ items }: { items: ReviewQueueItem[] }) {
  const [open, setOpen] = useState(false);
  if (items.length === 0) return null;
  return (
    <div className="mb-4 rounded-2xl border border-amber-500/30 bg-amber-50 dark:bg-amber-500/10">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex w-full items-center justify-between gap-2 px-4 py-3">
        <span className="flex items-center gap-2 text-sm font-extrabold text-amber-800 dark:text-amber-300">
          <ClipboardCheck className="h-4 w-4" /> {items.length} new member{items.length === 1 ? '' : 's'} to review
        </span>
        <ChevronDown className={`h-4 w-4 text-amber-800 transition-transform dark:text-amber-300 ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <ul className="space-y-1.5 px-4 pb-4">
          {items.map((i) => (
            <li key={i.clientId}>
              <Link href={`/coach/clients/${i.clientId}`} className="flex flex-col rounded-xl bg-white/70 px-3 py-2 text-sm dark:bg-black/20">
                <span className="font-bold text-black dark:text-zinc-50">{i.name}</span>
                {i.reasons.length > 1 && <span className="text-xs text-zinc-600 dark:text-zinc-400">{i.reasons.filter((r) => r !== 'New member: check the starting plan').join(' · ')}</span>}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
