'use client';

import { useState } from 'react';
import { X } from 'lucide-react';
import { useBackHandler } from './useBackHandler';
import { useDialog } from './useDialog';
import { nextDialogId } from '@/lib/dialogFocus';

// A sheet that slides up from the bottom on a phone and centres as a dialog on desktop. It is a modal dialog (SH3): focus starts on the close
// button, Tab stays inside, Escape closes (only this one, if a confirm question is open over it), the page behind is inert and does not
// scroll, and focus returns to what opened it.
export function BottomSheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  const [titleId] = useState(() => nextDialogId('sheet-title'));
  const ref = useDialog<HTMLDivElement>({ onClose });

  useBackHandler(true, onClose);

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center md:items-center">
      {/* The dimmed backdrop closes the sheet for a mouse or a finger; keyboard and screen-reader users have the Close button and Escape. */}
      <button type="button" aria-hidden tabIndex={-1} onClick={onClose} className="absolute inset-0 bg-black/60" />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative max-h-[88vh] w-full max-w-md overflow-y-auto rounded-t-3xl border border-black/10 bg-card p-5 pb-[calc(2rem+env(safe-area-inset-bottom))] shadow-2xl md:rounded-3xl md:pb-5 dark:border-white/10"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 id={titleId} className="text-lg font-extrabold text-black dark:text-zinc-50">
            {title}
          </h2>
          <button
            type="button"
            data-dialog-close
            onClick={onClose}
            aria-label="Close"
            className="flex h-10 w-10 items-center justify-center rounded-full text-zinc-500 hover:bg-black/5 dark:hover:bg-white/10"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
