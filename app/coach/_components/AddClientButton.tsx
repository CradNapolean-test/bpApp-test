'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import { useClickOutside } from '@/app/_components/useClickOutside';
import { AddClientForm } from './AddClientForm';
import { JoinLinkCard } from './JoinLinkCard';

// Compact black trigger + anchored popover for the Clients list page, wrapping the same
// AddClientForm the Dashboard shows inline as a standing card -- one invite flow, two entry
// points to match each page's own design.
export function AddClientButton() {
  const [open, setOpen] = useState(false);
  const ref = useClickOutside<HTMLDivElement>(() => setOpen(false), open);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex h-11 shrink-0 items-center gap-1.5 rounded-xl bg-accent px-4 text-sm font-extrabold text-accent-foreground hover:opacity-90"
      >
        <Plus className="h-4 w-4" strokeWidth={2.6} />
        Add member
      </button>
      {open && (
        <div
          role="dialog"
          aria-label="Add client"
          className="absolute right-0 z-20 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-[20px] border border-black/[.08] bg-card p-4 shadow-xl dark:border-white/10"
        >
          <AddClientForm />
          <JoinLinkCard />
        </div>
      )}
    </div>
  );
}
