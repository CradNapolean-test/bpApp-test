'use client';

import { ClipboardCheck } from 'lucide-react';
import { useAction } from '@/app/_components/useAction';
import { clearReviewFlag } from '@/lib/data/onboarding';

// Shown to the coach on a new member's page until they've checked the automatic starting plan.
export function ReviewBanner({ clientId, reasons, canAct }: { clientId: string; reasons: string[]; canAct: boolean }) {
  const { run, busy } = useAction();
  return (
    <div className="mt-4 rounded-2xl border border-amber-500/30 bg-amber-50 p-3.5 dark:bg-amber-500/10">
      <p className="flex items-center gap-2 text-sm font-extrabold text-amber-800 dark:text-amber-300">
        <ClipboardCheck className="h-4 w-4" /> New member: review their starting plan
      </p>
      {reasons.length > 0 && (
        <ul className="mt-1.5 list-disc space-y-0.5 pl-5 text-xs text-zinc-700 dark:text-zinc-300">
          {reasons.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      )}
      <p className="mt-1.5 text-xs text-zinc-600 dark:text-zinc-400">
        Check their targets under Personal details &amp; goals, then set up their membership.
      </p>
      {canAct && (
        <button
          type="button"
          disabled={busy}
          onClick={() => run(() => clearReviewFlag(clientId), { success: 'Marked as reviewed' })}
          className="mt-2.5 rounded-full bg-amber-600 px-4 py-1.5 text-xs font-bold text-white disabled:opacity-60"
        >
          {busy ? 'Saving…' : 'Mark as reviewed'}
        </button>
      )}
    </div>
  );
}
