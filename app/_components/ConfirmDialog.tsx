'use client';

import { createContext, useCallback, useContext, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Button } from './Button';

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

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const resolverRef = useRef<((value: boolean) => void) | null>(null);

  const confirm = useCallback<ConfirmFn>((opts) => {
    setOptions(opts);
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
    });
  }, []);

  function settle(result: boolean) {
    resolverRef.current?.(result);
    resolverRef.current = null;
    setOptions(null);
  }

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {options && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => settle(false)} />
          <div
            role="dialog"
            aria-modal="true"
            className="relative w-full max-w-sm rounded-lg border border-black/10 bg-[var(--background)] p-5 shadow-xl dark:border-white/10"
          >
            <h2 className="text-base font-semibold text-black dark:text-zinc-50">{options.title}</h2>
            {options.body && <p className="mt-2 text-sm text-zinc-500">{options.body}</p>}
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="outline" onClick={() => settle(false)}>
                Cancel
              </Button>
              <Button variant={options.destructive ? 'danger-solid' : 'primary'} autoFocus onClick={() => settle(true)}>
                {options.confirmLabel ?? (options.destructive ? 'Delete' : 'Confirm')}
              </Button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}
