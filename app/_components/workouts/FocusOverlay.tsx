'use client';

import { useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import type { ReactNode } from 'react';
import { useBackHandler } from '../useBackHandler';
import { useDialog } from '../useDialog';
import { nextDialogId } from '@/lib/dialogFocus';

// Shared fullscreen shell for "click an item, go into its detail view" -- same fixed-inset-0
// convention as BarcodeScanner.tsx. Purely presentational, no business logic of its own --
// callers (WorkoutTab.tsx/ProgramTemplateManager.tsx's day view, EducationPane.tsx/
// EducationTab.tsx's course view) render their own content as children.
//
// It is announced as a dialog (SH3): the title names it, focus starts on Back, Tab stays inside, Escape does what Back does, the page behind
// is inert, and focus returns to what opened it.
export function FocusOverlay({
  title,
  subtitle,
  onClose,
  headerActions,
  children,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  headerActions?: ReactNode;
  children: ReactNode;
}) {
  const [titleId] = useState(() => nextDialogId('overlay-title'));
  const ref = useDialog<HTMLDivElement>({ onClose });
  useBackHandler(true, onClose);

  return (
    <div ref={ref} role="dialog" aria-modal="true" aria-labelledby={titleId} className="fixed inset-0 z-[55] flex flex-col bg-[var(--background)]">
      <div className="flex items-center justify-between gap-2 border-b border-black/10 p-4 pt-[max(1rem,env(safe-area-inset-top))] dark:border-white/10">
        <button
          type="button"
          data-dialog-close
          onClick={onClose}
          className="flex min-h-10 shrink-0 items-center gap-1 text-sm font-medium text-zinc-500 hover:text-black dark:hover:text-zinc-300"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>
        <div className="min-w-0 flex-1 text-center">
          <p id={titleId} className="truncate text-sm font-semibold text-black dark:text-zinc-50">
            {title}
          </p>
          {subtitle && <p className="truncate text-xs text-zinc-500">{subtitle}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-2">{headerActions}</div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">{children}</div>
    </div>
  );
}
