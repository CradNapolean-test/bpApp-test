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
  variant = 'plain',
  children,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  headerActions?: ReactNode;
  // 'member': the November 2026 redesign's black header (a round back button, the subtitle above a large title), for the member's own
  // screens. The coach's builder keeps the plain bar.
  variant?: 'plain' | 'member';
  children: ReactNode;
}) {
  const [titleId] = useState(() => nextDialogId('overlay-title'));
  const ref = useDialog<HTMLDivElement>({ onClose });
  useBackHandler(true, onClose);

  return (
    <div ref={ref} role="dialog" aria-modal="true" aria-labelledby={titleId} className="fixed inset-0 z-[55] flex flex-col bg-[var(--background)]">
      {variant === 'member' ? (
        <div className="rounded-b-[28px] bg-[#1d1d1b] px-5 pb-5 pt-[max(1.25rem,env(safe-area-inset-top))] text-zinc-100 dark:border-b dark:border-white/10">
          <div className="mx-auto flex w-full max-w-2xl items-center gap-3">
            <button
              type="button"
              data-dialog-close
              onClick={onClose}
              aria-label="Back"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/15 text-zinc-100 hover:bg-white/10"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div className="min-w-0 flex-1">
              {subtitle && <p className="truncate text-[13px] text-zinc-400">{subtitle}</p>}
              <p id={titleId} className="truncate text-2xl font-extrabold leading-tight tracking-tight">
                {title}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">{headerActions}</div>
          </div>
        </div>
      ) : (
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
      )}
      <div className="min-h-0 flex-1 overflow-y-auto p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">{children}</div>
    </div>
  );
}
