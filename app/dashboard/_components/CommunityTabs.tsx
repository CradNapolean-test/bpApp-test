'use client';

import { useState } from 'react';
import Link from 'next/link';
import { CalendarDays, Check, ChevronDown, Copy, ExternalLink, Gift, MapPin, Share2, Star, Users } from 'lucide-react';
import { useAction } from '@/app/_components/useAction';
import { EmptyState } from '@/app/_components/EmptyState';
import { leaveEvent, signUpForEvent, submitFeedback } from '@/lib/data/community';
import type { EventWithSignup, RewardsForMember } from '@/lib/data/types';

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

// The gym's own referral sign-up page -- the referral discount is already applied there, so
// members just share this link.
export const REFER_URL = 'https://ballisticperformancequays.co.uk/refer';

export function ReferTab({ name }: { name: string }) {
  const [copied, setCopied] = useState(false);
  const message = `${name.split(' ')[0]} here — I train at Ballistic Performance and think you'd love it. Join with my link and your discount is already applied: ${REFER_URL}`;

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
          Send them your link. Their discount off the 6 week challenge is already applied when they sign up through it.
        </p>
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
        <a
          href={REFER_URL}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Open the referral page"
          className="flex items-center justify-center rounded-xl border border-black/10 px-3 dark:border-white/15"
        >
          <ExternalLink className="h-4 w-4" />
        </a>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Rewards

export function RewardsTab({ data }: { data: RewardsForMember }) {
  const { rewards, grantedIds, sessions, months } = data;
  const clubs = Math.floor(sessions / 100);

  return (
    <div className="space-y-3">
      <div className={cardCls}>
        <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Session clubs</p>
        <p className="mt-1 text-sm font-extrabold text-black dark:text-zinc-50">
          {clubs > 0 ? `You're in the ${clubs * 100} club` : `${100 - sessions} sessions to the 100 club`}
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {[100, 200, 300, 400, 500].map((n) => (
            <span
              key={n}
              className={`rounded-full px-3 py-1 text-[11px] font-extrabold ${
                sessions >= n ? 'bg-accent text-accent-foreground' : 'bg-black/5 text-zinc-400 dark:bg-white/10'
              }`}
            >
              {n} club
            </span>
          ))}
        </div>
      </div>

      {rewards.length === 0 ? (
        <EmptyState icon={Gift} title="No rewards yet" hint="Loyalty gifts like bottles and hoodies will show up here." />
      ) : (
        rewards.map((r) => {
          const value = r.kind === 'sessions' ? sessions : months;
          const given = grantedIds.includes(r.id);
          const earned = value >= r.threshold;
          const pct = Math.min(100, Math.round((value / r.threshold) * 100));
          return (
            <div key={r.id} className={cardCls}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-extrabold text-black dark:text-zinc-50">{r.name}</p>
                  <p className="text-[11px] text-zinc-500">
                    {r.kind === 'sessions' ? `${r.threshold} sessions` : `${r.threshold} months as a member`}
                    {r.description ? ` · ${r.description}` : ''}
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-extrabold ${
                    given
                      ? 'bg-success/15 text-success'
                      : earned
                        ? 'bg-accent/15 text-accent'
                        : 'bg-black/5 text-zinc-500 dark:bg-white/10'
                  }`}
                >
                  {given ? 'Received ✓' : earned ? 'Earned — ask your coach' : `${value}/${r.threshold}`}
                </span>
              </div>
              {!earned && (
                <div className="mt-2.5 h-[5px] overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
                  <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}

// ---------------------------------------------------------------- FAQs

// DRAFT answers, written from the booking rules in the owner's brief. Rob should review the
// wording (and add anything from the TeamUp FAQ) before this goes in front of members.
const FAQS: { q: string; a: string }[] = [
  { q: 'How do I book a session?', a: 'Open the Book tab, pick a day, and tap Book on the session you want. Your credits are shown at the top.' },
  { q: 'Where can I see my booked sessions?', a: 'Under "My bookings" on the Book tab. They also appear on your Home screen as your next class.' },
  {
    q: 'What is the cancellation policy?',
    a: 'Cancel at least 3 hours before your session to keep your credit. Between 11pm and 5am does not count, so for early-morning sessions you need to cancel by 11pm the night before. Each booking shows its exact cancel-by time. Cancel later than that and the credit is lost.',
  },
  { q: 'What if a session is full?', a: 'Tap Waitlist. If a spot opens and you have enough credits, you are booked in automatically and we let you know.' },
  { q: 'How far ahead can I book?', a: 'Challenge members can book 2 weeks ahead. Full and Big Dog members can book 2 weeks and 5 days ahead.' },
  { q: 'What are Strong and Big Dog memberships?', a: 'Strong gives you 3 sessions a week. Big Dog gives you unlimited sessions.' },
  {
    q: 'What are the Big Dog T-shirts?',
    a: 'Hit the Big Dog standard in one exercise for a White shirt, 3 for Turquoise, 6 for Silver, and every exercise for Gold. Your standards are on your profile.',
  },
  { q: 'How do I refer a friend?', a: 'Open Refer a friend, tap Share, and send them your link. Their discount is already applied.' },
];

export function FaqTab() {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <div className="space-y-3">
      <div className={`${cardCls} !p-0`}>
        {FAQS.map((f, i) => (
          <div key={f.q} className="border-b border-black/5 last:border-b-0 dark:border-white/5">
            <button
              type="button"
              onClick={() => setOpen(open === i ? null : i)}
              aria-expanded={open === i}
              className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left"
            >
              <span className="text-sm font-bold text-black dark:text-zinc-50">{f.q}</span>
              <ChevronDown className={`h-4 w-4 shrink-0 text-zinc-400 transition-transform ${open === i ? 'rotate-180' : ''}`} />
            </button>
            {open === i && <p className="px-4 pb-3.5 text-sm text-zinc-600 dark:text-zinc-400">{f.a}</p>}
          </div>
        ))}
      </div>
      <div className="flex justify-center gap-4 text-xs text-zinc-500">
        <Link href="/legal/terms" className="underline">Terms &amp; conditions</Link>
        <Link href="/legal/privacy" className="underline">Privacy policy</Link>
      </div>
    </div>
  );
}
