'use client';

import { useState } from 'react';
import { MoreHorizontal } from 'lucide-react';
import { useClickOutside } from './useClickOutside';

export interface DropdownMenuItem {
  label: string;
  onSelect: () => void;
  destructive?: boolean;
  disabled?: boolean;
}

// The "⋯" overflow menu. Screens keep ONE main button visible and put everything else (Import,
// Export, Delete, ...) in here, so a page never shows a row of equal-weight buttons.
//   variant 'header' -- a bordered round button next to a page's primary action
//   variant 'row'    -- a quiet icon on a card / list row (next to its Edit link)
export function DropdownMenu({
  items,
  triggerLabel,
  variant = 'row',
}: {
  items: DropdownMenuItem[];
  triggerLabel: string;
  variant?: 'header' | 'row';
}) {
  const [open, setOpen] = useState(false);
  const ref = useClickOutside<HTMLDivElement>(() => setOpen(false), open);

  const triggerCls =
    variant === 'header'
      ? 'flex h-9 w-9 items-center justify-center rounded-full border border-black/10 text-zinc-600 hover:bg-black/5 dark:border-white/10 dark:text-zinc-300 dark:hover:bg-white/5'
      : 'flex h-8 w-8 items-center justify-center rounded-full text-zinc-500 hover:bg-black/5 dark:text-zinc-400 dark:hover:bg-white/5';

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') setOpen(false);
        }}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={triggerLabel}
        className={triggerCls}
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 z-30 mt-1.5 min-w-[11rem] rounded-xl border border-black/10 bg-card p-1 shadow-xl dark:border-white/10"
        >
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              disabled={item.disabled}
              onClick={() => {
                setOpen(false);
                item.onSelect();
              }}
              className={`block w-full rounded-lg px-3 py-2 text-left text-sm font-medium disabled:opacity-40 ${
                item.destructive
                  ? 'text-danger hover:bg-danger/10'
                  : 'text-zinc-800 hover:bg-black/5 dark:text-zinc-200 dark:hover:bg-white/5'
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
