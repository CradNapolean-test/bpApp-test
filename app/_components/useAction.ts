'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from './ToastProvider';

// Wraps the mutation shape repeated ~37 times across the app: busy flag, run the write,
// surface success/failure as a toast, refresh. Before this, most handlers had no catch at
// all -- a rejected write silently re-enabled the button and left the user believing it
// saved. Call it once per independent action so their busy states don't interfere.
// Supabase throws PostgrestError, a plain object -- not an Error instance -- and a Server
// Action re-throwing it arrives client-side as a serialized blob. Without this the toast
// showed a raw `{code: "P0001", details: Null, ...}` dump instead of the actual reason.
function messageFrom(err: unknown): string {
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === 'string') return err;
  if (err && typeof err === 'object') {
    const maybe = err as { message?: unknown };
    if (typeof maybe.message === 'string' && maybe.message) return maybe.message;
  }
  return 'Something went wrong. Please try again.';
}

export function useAction() {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const run = useCallback(
    async (fn: () => Promise<unknown>, opts?: { success?: string; onDone?: () => void }): Promise<boolean> => {
      setBusy(true);
      try {
        const result = await fn();
        // Domain errors come back as a value rather than a throw, because Next.js redacts
        // thrown Server Action messages in production builds. See lib/data/result.ts.
        if (result && typeof result === 'object' && (result as { ok?: unknown }).ok === false) {
          toast.error((result as { error?: string }).error ?? 'Something went wrong. Please try again.');
          return false;
        }
        if (opts?.success) toast.success(opts.success);
        opts?.onDone?.();
        router.refresh();
        return true;
      } catch (err) {
        toast.error(messageFrom(err));
        return false;
      } finally {
        setBusy(false);
      }
    },
    [router, toast]
  );

  return { run, busy };
}
