'use client';

import { useState } from 'react';
import { MoreVertical } from 'lucide-react';
import { useClickOutside } from './useClickOutside';

export interface DropdownMenuItem {
  label: string;
  onSelect: () => void;
  destructive?: boolean;
}

export function DropdownMenu({ items, triggerLabel }: { items: DropdownMenuItem[]; triggerLabel: string }) {
  const [open, setOpen] = useState(false);
  const ref = useClickOutside<HTMLDivElement>(() => setOpen(false), open);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') setOpen(false);
        }}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={triggerLabel}
        className="rounded-md p-1 text-zinc-400 hover:bg-black/5 dark:text-zinc-600 dark:hover:bg-white/5"
      >
        <MoreVertical className="h-4 w-4" />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 z-20 mt-1 min-w-[9rem] rounded-md border border-black/10 bg-[var(--background)] py-1 shadow-lg dark:border-white/10"
        >
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                item.onSelect();
              }}
              className={`block w-full px-3 py-1.5 text-left text-sm ${
                item.destructive
                  ? 'text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30'
                  : 'text-zinc-700 hover:bg-black/5 dark:text-zinc-300 dark:hover:bg-white/5'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
