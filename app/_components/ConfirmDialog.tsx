'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Button } from './Button';
import { useBackHandler } from './useBackHandler';
import { useDialog } from './useDialog';
import { nextDialogId } from '@/lib/dialogFocus';

interface ConfirmOptions {
  title: string;
  body?: string;
  confirmLabel?: string;
  destructive?: boolean;
}

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

// Promise-returning so call sites stay linear:
//   if (!(await confirm({ ... }))) return;
// rather than restructuring every handler around a modal callback.
export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm must be used inside <ConfirmProvider>');
  return ctx;
}

interface Pending {
  options: ConfirmOptions;
  resolve: (value: boolean) => void;
  key: number;
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [active, setActive] = useState<Pending | null>(null);
  // A question asked while another is open waits its turn instead of replacing it: the first caller's promise is never orphaned (SH2).
  const queue = useRef<Pending[]>([]);
  const nextKey = useRef(1);
  const activeRef = useRef<Pending | null>(null);
  useEffect(() => {
    activeRef.current = active;
  });

  const confirm = useCallback<ConfirmFn>((opts) => {
    return new Promise<boolean>((resolve) => {
      const pending: Pending = { options: opts, resolve, key: nextKey.current++ };
      if (activeRef.current) {
        queue.current.push(pending);
      } else {
        activeRef.current = pending;
        setActive(pending);
      }
    });
  }, []);

  const settle = useCallback((result: boolean) => {
    const current = activeRef.current;
    if (!current) return;
    current.resolve(result);
    const next = queue.current.shift() ?? null;
    activeRef.current = next;
    setActive(next);
  }, []);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {active && <ConfirmView key={active.key} options={active.options} onSettle={settle} />}
    </ConfirmContext.Provider>
  );
}

// One open question. It is a modal alert dialog: focus starts on Cancel for a destructive question (on Confirm otherwise) so an Enter
// keypress cannot delete by accident, Escape cancels, Tab stays inside, and focus returns to what opened it.
function ConfirmView({ options, onSettle }: { options: ConfirmOptions; onSettle: (result: boolean) => void }) {
  const [ids] = useState(() => ({ title: nextDialogId('confirm-title'), body: nextDialogId('confirm-body') }));
  const ref = useDialog<HTMLDivElement>({ onClose: () => onSettle(false) });
  // The phone's back gesture means "cancel" (R21); without this it left the screen with the question still open.
  useBackHandler(true, () => onSettle(false));

  return (
    <div className="fixed inset-0 z-[66] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" aria-hidden onClick={() => onSettle(false)} />
      <div
        ref={ref}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={ids.title}
        aria-describedby={options.body ? ids.body : undefined}
        className="relative w-full max-w-sm rounded-lg border border-black/10 bg-[var(--background)] p-5 shadow-xl dark:border-white/10"
      >
        <h2 id={ids.title} className="text-base font-semibold text-black dark:text-zinc-50">
          {options.title}
        </h2>
        {options.body && (
          <p id={ids.body} className="mt-2 text-sm text-zinc-500">
            {options.body}
          </p>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" onClick={() => onSettle(false)} {...(options.destructive ? { 'data-autofocus': '' } : {})}>
            Cancel
          </Button>
          <Button variant={options.destructive ? 'danger-solid' : 'primary'} onClick={() => onSettle(true)} {...(options.destructive ? {} : { 'data-autofocus': '' })}>
            {options.confirmLabel ?? (options.destructive ? 'Delete' : 'Confirm')}
          </Button>
        </div>
      </div>
    </div>
  );
}
