'use client';

import { createContext, useCallback, useContext, useState } from 'react';
import type { ReactNode } from 'react';
import { CheckCircle2, X, XCircle } from 'lucide-react';

type ToastKind = 'success' | 'error';

interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
}

interface ToastApi {
  success: (message: string) => void;
  error: (message: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

// Every mutation in the app used to fail silently -- a rejected write left the button
// re-enabled and nothing else, which is how the coach-side check-in-reminder RLS bug went
// unnoticed. This is the one shared place failures (and confirmations) surface.
export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}

const AUTO_DISMISS_MS = 4000;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (kind: ToastKind, message: string) => {
      const id = Date.now() + Math.random();
      setToasts((prev) => [...prev, { id, kind, message }]);
      setTimeout(() => dismiss(id), AUTO_DISMISS_MS);
    },
    [dismiss]
  );

  // Stable identity so consumers can safely put `toast` in effect dependency arrays.
  const [api] = useState<ToastApi>(() => ({
    success: (m: string) => push('success', m),
    error: (m: string) => push('error', m),
  }));

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed bottom-4 left-4 z-50 flex flex-col gap-2 sm:left-auto sm:right-4">
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className={`pointer-events-auto flex max-w-sm items-start gap-2 rounded-lg border p-3 text-sm shadow-lg ${
              t.kind === 'success'
                ? 'border-emerald-600/30 bg-emerald-50 text-emerald-900 dark:bg-emerald-950/80 dark:text-emerald-200'
                : 'border-red-600/30 bg-red-50 text-red-900 dark:bg-red-950/80 dark:text-red-200'
            }`}
          >
            {t.kind === 'success' ? (
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            ) : (
              <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
            )}
            <span className="flex-1">{t.message}</span>
            <button onClick={() => dismiss(t.id)} aria-label="Dismiss" className="shrink-0 opacity-60 hover:opacity-100">
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
