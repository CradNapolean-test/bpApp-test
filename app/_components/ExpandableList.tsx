'use client';

import { useState } from 'react';
import type { ReactNode } from 'react';

// Shows every item on a wide screen, but only the first `phoneLimit` on a phone, with a
// "Show N more" toggle -- keeps long lists (activity, flagged clients) from turning a phone
// dashboard into a scroll marathon while leaving desktop unchanged.
export function ExpandableList<T>({
  items,
  phoneLimit,
  itemKey,
  render,
  className = 'space-y-2',
}: {
  items: T[];
  phoneLimit: number;
  itemKey: (item: T, index: number) => string;
  render: (item: T, index: number) => ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const hidden = items.length - phoneLimit;
  return (
    <div>
      <div className={className}>
        {items.map((item, i) => (
          <div key={itemKey(item, i)} className={i >= phoneLimit && !open ? 'hidden md:block' : undefined}>
            {render(item, i)}
          </div>
        ))}
      </div>
      {hidden > 0 && (
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="mt-2 w-full rounded-xl py-2 text-center text-sm font-semibold text-accent hover:bg-black/5 md:hidden dark:hover:bg-white/5"
        >
          {open ? 'Show less' : `Show ${hidden} more`}
        </button>
      )}
    </div>
  );
}
