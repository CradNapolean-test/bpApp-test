'use client';

import { useEffect } from 'react';
import { X } from 'lucide-react';
import { useBackHandler } from './useBackHandler';

// A sheet that slides up from the bottom on a phone and centres as a dialog on desktop.
export function BottomSheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useBackHandler(true, onClose);

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center md:items-center" role="dialog" aria-modal="true" aria-label={title}>
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-black/60" />
      <div className="relative max-h-[88vh] w-full max-w-md overflow-y-auto rounded-t-3xl border border-black/10 bg-card p-5 pb-[calc(2rem+env(safe-area-inset-bottom))] shadow-2xl md:rounded-3xl md:pb-5 dark:border-white/10">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-extrabold text-black dark:text-zinc-50">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-full p-1.5 text-zinc-500 hover:bg-black/5 dark:hover:bg-white/10">
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
