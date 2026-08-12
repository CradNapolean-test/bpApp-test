'use client';

import { ArrowLeft } from 'lucide-react';
import type { ReactNode } from 'react';

// Shared fullscreen shell for "click an item, go into its detail view" -- same fixed-inset-0
// convention as BarcodeScanner.tsx. Purely presentational, no business logic of its own --
// callers (WorkoutTab.tsx/ProgramTemplateManager.tsx's day view, EducationPane.tsx/
// EducationTab.tsx's course view) render their own content as children.
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
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[var(--background)]">
      <div className="flex items-center justify-between gap-2 border-b border-black/10 p-4 dark:border-white/10">
        <button
          onClick={onClose}
          className="flex shrink-0 items-center gap-1 text-sm font-medium text-zinc-500 hover:text-black dark:hover:text-zinc-300"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>
        <div className="min-w-0 flex-1 text-center">
          <p className="truncate text-sm font-semibold text-black dark:text-zinc-50">{title}</p>
          {subtitle && <p className="truncate text-xs text-zinc-500">{subtitle}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-2">{headerActions}</div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">{children}</div>
    </div>
  );
}
