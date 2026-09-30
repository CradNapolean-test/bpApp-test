'use client';

import { useState } from 'react';
import { CalendarDays, Check, Copy, MapPin, Share2, Star, Users } from 'lucide-react';
import { useAction } from '@/app/_components/useAction';
import { EmptyState } from '@/app/_components/EmptyState';
import { leaveEvent, signUpForEvent, submitFeedback } from '@/lib/data/community';
import type { EventWithSignup } from '@/lib/data/types';

const cardCls = 'rounded-2xl border border-black/[.06] bg-[var(--background)] p-4 dark:border-white/10';

// ---------------------------------------------------------------- Events

export function EventsTab({ events, readOnly }: { events: EventWithSignup[]; readOnly: boolean }) {
  const { run, busy } = useAction();
  const [busyId, setBusyId] = useState<string | null>(null);

  async function toggle(e: EventWithSignup) {
    setBusyId(e.id);
    try {
      await run(() => (e.signedUp ? leaveEvent(e.id) : signUpForEvent(e.id)), {
        success: e.signedUp ? 'You have left the event' : `You're in for ${e.title}`,
      });
    } finally {
      setBusyId(null);
    }
  }

  if (events.length === 0) {
    return (
      <EmptyState
        icon={CalendarDays}
        title="No upcoming events"
        hint="Gym events like walks, paddles and the Christmas do will show up here."
      />
    );
  }

  return (
    <div className="space-y-2.5">
      {events.map((e) => {
        const start = new Date(e.starts_at);
        const full = e.capacity != null && e.signups >= e.capacity && !e.signedUp;
        return (
          <div key={e.id} className={cardCls}>
            <div className="flex gap-3">
              <div className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-xl bg-accent-soft text-accent">
                <span className="text-[9px] font-bold uppercase">{start.toLocaleDateString(undefined, { month: 'short' })}</span>
                <span className="text-lg font-black leading-none">{start.getDate()}</span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-extrabold text-black dark:text-zinc-50">{e.title}</p>
                <p className="text-[11px] text-zinc-500">
                  {start.toLocaleDateString(undefined, { weekday: 'long' })},{' '}
                  {start.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
                </p>
                {e.location && (
                  <p className="mt-0.5 flex items-center gap-1 text-[11px] text-zinc-500">
                    <MapPin className="h-3 w-3" /> {e.location}
                  </p>
                )}
                {e.description && <p className="mt-1.5 text-xs text-zinc-600 dark:text-zinc-400">{e.description}</p>}
              </div>
            </div>
            <div className="mt-3 flex items-center justify-between">
              <p className="flex items-center gap-1 text-[11px] text-zinc-500">
                <Users className="h-3.5 w-3.5" />
                {e.signups} going{e.capacity != null ? ` · ${e.capacity} spots` : ''}
              </p>
              {!readOnly && (
                <button
                  type="button"
                  disabled={busy || busyId === e.id || full}
                  onClick={() => toggle(e)}
                  className={`rounded-full px-4 py-1.5 text-xs font-extrabold disabled:opacity-50 ${
                    e.signedUp ? 'bg-black/10 text-zinc-700 dark:bg-white/10 dark:text-zinc-300' : 'bg-accent text-accent-foreground'
                  }`}
                >
                  {e.signedUp ? "I'm in ✓ (leave)" : full ? 'Full' : "I'm in"}
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------- Feedback

export function FeedbackTab({ readOnly }: { readOnly: boolean }) {
  const { run, busy } = useAction();
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [sent, setSent] = useState(false);

  async function send() {
    await run(() => submitFeedback(rating, comment), {
      success: 'Thanks for your feedback!',
      onDone: () => {
        setSent(true);
        setRating(0);
        setComment('');
      },
    });
  }

  return (
    <div className={`${cardCls} space-y-4`}>
      <div>
        <p className="text-sm font-extrabold text-black dark:text-zinc-50">How are we doing?</p>
        <p className="text-xs text-zinc-500">Rate your experience at Ballistic Performance and tell us what we can do better.</p>
      </div>
      <div className="flex gap-1.5" role="radiogroup" aria-label="Rating">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={rating === n}
            aria-label={`${n} star${n === 1 ? '' : 's'}`}
            disabled={readOnly}
            onClick={() => {
              setRating(n);
              setSent(false);
            }}
          >
            <Star className={`h-9 w-9 ${n <= rating ? 'fill-amber-400 text-amber-400' : 'text-zinc-300 dark:text-zinc-600'}`} />
          </button>
        ))}
      </div>
      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        disabled={readOnly}
        rows={4}
        placeholder="Anything you'd like to add? (optional)"
        className="w-full rounded-xl border border-black/10 bg-transparent p-3 text-sm dark:border-white/15"
      />
      <button
        type="button"
        onClick={send}
        disabled={readOnly || busy || rating === 0}
        className="w-full rounded-xl bg-accent py-3 text-sm font-extrabold text-accent-foreground disabled:opacity-50"
      >
        {sent ? 'Sent ✓' : 'Send feedback'}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------- Refer a friend

// A stable, human-shareable code derived from the member's id -- nothing extra to store. The
// discount itself is redeemed manually at sign-up (no payments in the app), so the code is how
// the team knows who referred whom.
export function referralCodeFor(clientId: string): string {
  return `BP-${clientId.replace(/-/g, '').slice(0, 6).toUpperCase()}`;
}

export function ReferTab({ clientId, name }: { clientId: string; name: string }) {
  const [copied, setCopied] = useState(false);
  const code = referralCodeFor(clientId);
  const message = `${name.split(' ')[0]} here — I train at Ballistic Performance and think you'd love it. Ask about the 6 week challenge and mention my code ${code} for a discount.`;

  async function share() {
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Ballistic Performance', text: message });
        return;
      }
    } catch {
      return; // user dismissed the share sheet
    }
    await copy();
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable -- the message is visible to copy by hand */
    }
  }

  return (
    <div className={`${cardCls} space-y-4`}>
      <div>
        <p className="text-sm font-extrabold text-black dark:text-zinc-50">Refer a friend or family member</p>
        <p className="text-xs text-zinc-500">
          Send them your code. They get a discount off the 6 week challenge when they join and quote it.
        </p>
      </div>
      <div className="rounded-xl border border-dashed border-accent/40 bg-accent-soft py-4 text-center">
        <p className="text-[10px] uppercase tracking-widest text-zinc-500">Your code</p>
        <p className="mt-1 text-2xl font-black tracking-widest text-accent">{code}</p>
      </div>
      <p className="rounded-xl bg-black/[.03] p-3 text-xs text-zinc-600 dark:bg-white/[.04] dark:text-zinc-400">{message}</p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={share}
          className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-accent py-3 text-sm font-extrabold text-accent-foreground"
        >
          <Share2 className="h-4 w-4" /> Share
        </button>
        <button
          type="button"
          onClick={copy}
          className="flex items-center justify-center gap-2 rounded-xl border border-black/10 px-4 py-3 text-sm font-bold dark:border-white/15"
        >
          {copied ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
    </div>
  );
}
