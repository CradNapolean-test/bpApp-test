'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import { useClickOutside } from '@/app/_components/useClickOutside';
import { AddClientForm } from './AddClientForm';

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
        className="flex shrink-0 items-center gap-1.5 rounded-full bg-[#141414] px-4 py-2 text-sm font-bold text-white hover:opacity-90"
      >
        <Plus className="h-4 w-4" />
        Add client
      </button>
      {open && (
        <div
          role="dialog"
          aria-label="Add client"
          className="absolute right-0 z-20 mt-2 w-80 rounded-2xl border border-black/[.05] bg-[var(--background)] p-4 shadow-xl dark:border-white/10"
        >
          <AddClientForm />
        </div>
      )}
    </div>
  );
}
