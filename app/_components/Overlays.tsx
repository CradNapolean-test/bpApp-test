'use client';

import type { ReactNode } from 'react';
import { X } from 'lucide-react';
import { useDialog } from './useDialog';

// Two small wrappers that make a full-screen overlay behave as a dialog (SH3) without changing how it looks: focus moves in and returns,
// Tab stays inside, Escape closes, the page behind is inert and does not scroll, and a screen reader hears a named dialog.

// A bare overlay: the caller supplies the classes and the contents. Put data-dialog-close on its close button.
export function DialogOverlay({ label, onClose, className, children }: { label: string; onClose: () => void; className: string; children: ReactNode }) {
  const ref = useDialog<HTMLDivElement>({ onClose });
  return (
    <div ref={ref} role="dialog" aria-modal="true" aria-label={label} className={className}>
      {children}
    </div>
  );
}

// A photo shown large on a dark backdrop, with a Close button that can be reached and pressed (it used to be an image you had to know to tap).
// Tapping the backdrop closes it; tapping the picture does too, unless the picture is being zoomed or has controls of its own.
export function PhotoViewer({
  label,
  onClose,
  closeOnContentClick = true,
  children,
}: {
  label: string;
  onClose: () => void;
  closeOnContentClick?: boolean;
  children: ReactNode;
}) {
  const ref = useDialog<HTMLDivElement>({ onClose });
  return (
    <div
      ref={ref}
      role="dialog"
      aria-modal="true"
      aria-label={label}
      className="fixed inset-0 z-[70] flex flex-col items-center justify-center bg-black/90 p-4"
      onClick={onClose}
    >
      <button
        type="button"
        data-dialog-close
        aria-label="Close photo"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        className="absolute right-4 top-[max(1rem,env(safe-area-inset-top))] z-10 flex h-11 w-11 items-center justify-center rounded-full bg-white/15 text-white"
      >
        <X className="h-5 w-5" />
      </button>
      <div
        className="flex max-w-full flex-col items-center"
        onClick={closeOnContentClick ? undefined : (e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}
