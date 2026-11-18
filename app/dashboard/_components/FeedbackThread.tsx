'use client';

import { useState } from 'react';
import { MessageSquareText, Trash2 } from 'lucide-react';
import { useAction } from '@/app/_components/useAction';
import { useConfirm } from '@/app/_components/ConfirmDialog';
import { addNutritionFeedback, deleteNutritionFeedback } from '@/lib/data/nutritionFeedback';
import { markReviewed } from '@/lib/data/coachReviews';
import type { NutritionFeedbackRow } from '@/lib/data/types';

const timeLabel = (iso: string) =>
  new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true }).replace(' am', 'am').replace(' pm', 'pm');

// The coach's feedback on a day of food (or on one photo) as the member sees it, plus the box a
// coach uses to leave it. Members only ever see the comments; the compose controls are coach-only.
export function FeedbackThread({
  clientId,
  date,
  photoId = null,
  items,
  canGive,
  placeholder,
  buttonLabel,
}: {
  clientId: string;
  date: string;
  photoId?: string | null;
  items: NutritionFeedbackRow[];
  canGive: boolean;
  placeholder: string;
  buttonLabel: string;
}) {
  const confirm = useConfirm();
  const { run, busy } = useAction();
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState('');

  const mine = items.filter((i) => i.log_date === date && (i.photo_id ?? null) === photoId);
  if (mine.length === 0 && !canGive) return null;

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    const ok = await run(() => addNutritionFeedback(clientId, date, body, photoId), { success: 'Feedback sent' });
    if (ok) {
      setBody('');
      setOpen(false);
      // Leaving feedback on a day counts as reviewing it (R20); simply looking at it does not.
      if (canGive) void markReviewed('diary_day', clientId, date);
    }
  }

  async function remove(id: string) {
    const ok = await confirm({ title: 'Delete this feedback?', destructive: true });
    if (ok) await run(() => deleteNutritionFeedback(id), { success: 'Feedback deleted' });
  }

  return (
    <div className="space-y-2">
      {mine.map((f) => (
        <div key={f.id} className="rounded-2xl border border-accent/25 bg-accent-soft p-3.5">
          <div className="flex items-start justify-between gap-2">
            <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-accent-strong dark:text-accent">
              <MessageSquareText className="h-3.5 w-3.5" /> Coach feedback
              <span className="font-medium normal-case tracking-normal text-zinc-500">· {timeLabel(f.created_at)}</span>
            </p>
            {canGive && (
              <button type="button" aria-label="Delete feedback" onClick={() => remove(f.id)} className="rounded-full p-1 text-zinc-400 hover:text-danger">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <p className="mt-1 whitespace-pre-wrap text-sm text-black dark:text-zinc-50">{f.body}</p>
        </div>
      ))}

      {canGive &&
        (open ? (
          <form onSubmit={send} className="space-y-2 rounded-[20px] border border-black/[.08] bg-card p-3 dark:border-white/10">
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder={placeholder}
              rows={3}
              autoFocus
              className="w-full rounded-xl border border-black/10 bg-transparent px-3 py-2.5 text-base dark:border-white/10"
            />
            <p className="text-xs text-zinc-500">The member sees this and gets a notification.</p>
            <div className="flex gap-2">
              <button type="submit" disabled={busy || !body.trim()} className="inline-flex h-11 items-center rounded-xl bg-[#1d1d1b] text-white dark:bg-zinc-100 dark:text-[#1d1d1b] px-5 text-sm font-bold disabled:opacity-50">
                {busy ? 'Sending…' : 'Send'}
              </button>
              <button type="button" onClick={() => setOpen(false)} className="h-11 rounded-xl px-4 text-sm font-bold text-zinc-600 dark:text-zinc-300">
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <button type="button" onClick={() => setOpen(true)} className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl border-[1.5px] border-black/20 px-3.5 text-[13px] font-bold text-black dark:border-white/25 dark:text-zinc-50">
            {buttonLabel}
          </button>
        ))}
    </div>
  );
}
