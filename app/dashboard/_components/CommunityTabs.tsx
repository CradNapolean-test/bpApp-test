'use client';

import { useEffect, useRef, useState } from 'react';
import CountUp from '@/app/_components/motion/CountUp';
import ClickSpark from '@/app/_components/motion/ClickSpark';
import type { ClickSparkHandle } from '@/app/_components/motion/ClickSpark';
import { gsap, pop, prefersReducedMotion, useGSAP } from '@/app/_components/motion/gsap';
import { useLenis } from 'lenis/react';
import { useGrowIn } from '@/app/_components/motion/useGrowIn';
import Link from 'next/link';
import { CalendarDays, Check, ChevronDown, Copy, ExternalLink, Gift, MapPin, MessageSquare, Share2, Star, Users } from 'lucide-react';
import { useAction } from '@/app/_components/useAction';
import { useOnDemand } from '@/app/_components/useOnDemand';
import { EmptyState } from '@/app/_components/EmptyState';
import { leaveEvent, signUpForEvent, submitFeedback } from '@/lib/data/community';
import { getMemberTimetable } from '@/lib/data/classes';
import { clubBadges, clubProgress } from '@/lib/clubs';
import { cancellationPolicyText } from '@/lib/bookingRules';
import { buildFaqs } from '@/lib/faqContent';
import { createClient } from '@/lib/supabase/client';
import { ClubBar } from './ClubBar';
import type { ClientMembershipRow, EventWithSignup, RewardsForMember } from '@/lib/data/types';

const cardCls = 'rounded-[20px] border border-black/[.08] bg-card p-4 dark:border-white/10';
const headCls = 'text-base font-extrabold text-black dark:text-zinc-50';
const blackBtn = 'rounded-xl bg-[#1d1d1b] font-bold text-white disabled:opacity-60 dark:bg-zinc-100 dark:text-[#1d1d1b]';

// ---------------------------------------------------------------- Events

export function EventsTab({ events, readOnly }: { events: EventWithSignup[]; readOnly: boolean }) {
  const { run, busy } = useAction();
  const [busyId, setBusyId] = useState<string | null>(null);
  const sparks = useRef<ClickSparkHandle>(null);
  const area = useRef<HTMLElement>(null);

  async function toggle(e: EventWithSignup, button: HTMLElement) {
    const joining = !e.signedUp;
    setBusyId(e.id);
    try {
      const ok = await run(() => (e.signedUp ? leaveEvent(e.id) : signUpForEvent(e.id)), {
        success: e.signedUp ? 'You have left the event' : `You're in for ${e.title}`,
      });
      // Only once it has saved, and only for joining: the sparks come out of the button.
      const box = area.current?.getBoundingClientRect();
      if (ok && joining && box && button.isConnected) {
        const at = button.getBoundingClientRect();
        sparks.current?.spark(at.left - box.left + at.width / 2, at.top - box.top + at.height / 2);
      }
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
    <ClickSpark ref={sparks} clickToSpark={false} sparkColor={['#19adb1', '#5fd6d6', '#f59e0b']} sparkCount={12} sparkRadius={44} sparkSize={12} shape="star" duration={700}>
    <section ref={area} className="space-y-2.5">
      <h2 className={headCls}>Coming up</h2>
      {events.map((e) => {
        const start = new Date(e.starts_at);
        const full = e.capacity != null && e.signups >= e.capacity && !e.signedUp;
        return (
          <div key={e.id} className={cardCls}>
            <div className="flex gap-3">
              <div className="flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-2xl bg-[#1d1d1b] text-white dark:bg-zinc-100 dark:text-[#1d1d1b]">
                <span className="text-[11px] font-extrabold uppercase text-[#5fd6d6] dark:text-[#0e6266]">{start.toLocaleDateString('en-GB', { month: 'short' })}</span>
                <span className="text-xl font-black leading-none">{start.getDate()}</span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-base font-extrabold text-black dark:text-zinc-50">{e.title}</p>
                <p className="text-[13px] text-zinc-500 dark:text-zinc-400">
                  {start.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })} ·{' '}
                  {start.toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit', hour12: true }).replace(' ', '')}
                </p>
                {e.location && (
                  <p className="mt-0.5 flex items-center gap-1 text-[13px] text-zinc-500 dark:text-zinc-400">
                    <MapPin className="h-3.5 w-3.5" /> {e.location}
                  </p>
                )}
                {e.description && <p className="mt-1.5 text-sm text-zinc-600 dark:text-zinc-400">{e.description}</p>}
              </div>
            </div>
            <div className="mt-3 flex items-center justify-between gap-3">
              <p className="flex min-w-0 items-center gap-1.5 text-[13px] font-semibold text-zinc-600 dark:text-zinc-400">
                <Users className="h-4 w-4 shrink-0" />
                {e.signedUp
                  ? e.signups > 1
                    ? `You and ${e.signups - 1} other${e.signups - 1 === 1 ? '' : 's'} are in`
                    : 'You are in'
                  : `${e.signups} ${e.signups === 1 ? 'member is' : 'members are'} in`}
                {e.capacity != null ? ` · ${e.capacity} spots` : ''}
              </p>
              {!readOnly && (
                <button
                  type="button"
                  disabled={busy || busyId === e.id || full}
                  onClick={(ev) => toggle(e, ev.currentTarget)}
                  aria-label={e.signedUp ? `You're in. Leave ${e.title}` : undefined}
                  className={`flex h-11 shrink-0 items-center gap-1.5 px-4 text-sm ${
                    e.signedUp ? 'rounded-xl bg-accent-soft font-bold text-accent disabled:opacity-60' : blackBtn
                  }`}
                >
                  {e.signedUp ? (
                    <>
                      <Check className="h-4 w-4" strokeWidth={2.6} /> You&apos;re in · Leave
                    </>
                  ) : full ? (
                    'Full'
                  ) : (
                    "I'm in"
                  )}
                </button>
              )}
            </div>
          </div>
        );
      })}
    </section>
    </ClickSpark>
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
    <section className="space-y-2.5">
    <h2 className={headCls}>How are we doing?</h2>
    <div className={`${cardCls} space-y-4`}>
      <div>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">Rate your experience at Ballistic Performance and tell us what is working and what is not.</p>
        <p className="mt-1 text-[13px] text-zinc-500 dark:text-zinc-400">Your name is sent with your feedback, so the gym knows who it is from.</p>
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
            onClick={(e) => {
              pop(e.currentTarget.firstElementChild, 0.6);
              setRating(n);
              setSent(false);
            }}
            className="flex h-11 w-11 items-center justify-center"
          >
            <Star className={`h-9 w-9 ${n <= rating ? 'fill-amber-400 text-amber-400' : 'text-zinc-300 dark:text-zinc-600'}`} />
          </button>
        ))}
      </div>
      <textarea
        maxLength={1000}
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        disabled={readOnly}
        rows={4}
        placeholder="Anything you'd like to add? (optional)"
        className="w-full rounded-xl border border-black/[.14] bg-background p-3 text-base dark:border-white/15"
      />
      <button type="button" onClick={send} disabled={readOnly || busy || rating === 0} className={`h-12 w-full text-[15px] ${blackBtn}`}>
        {sent ? 'Sent ✓' : 'Send feedback'}
      </button>
    </div>
    </section>
  );
}

// ---------------------------------------------------------------- Refer a friend

// The member's own gym's referral page (gyms.referral_url, migration 0138). It used to be one gym's address for every member, so another
// gym's members shared the wrong site, and it promised a discount that nothing credits. The screen is hidden for a gym that has no link.
export function ReferTab({ name, referralUrl }: { name: string; referralUrl: string }) {
  const [copied, setCopied] = useState(false);
  const copyButton = useRef<HTMLButtonElement>(null);
  const message = `${name.split(' ')[0]} here — I train at Ballistic Performance and think you'd love it. Have a look: ${referralUrl}`;

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
      pop(copyButton.current, 0.85);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable -- the message is visible to copy by hand */
    }
  }

  return (
    <section className="space-y-2.5">
    <h2 className={headCls}>Refer a friend or family member</h2>
    <div className={`${cardCls} space-y-4`}>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">Send them your gym&apos;s link so they can find out about joining.</p>
      <p className="rounded-xl bg-black/[.04] p-3 text-[13px] text-zinc-700 dark:bg-white/[.06] dark:text-zinc-300">{message}</p>
      <div className="flex gap-2">
        <button type="button" onClick={share} className={`flex h-12 flex-1 items-center justify-center gap-2 text-[15px] ${blackBtn}`}>
          <Share2 className="h-4 w-4" /> Share
        </button>
        <button
          ref={copyButton}
          type="button"
          onClick={copy}
          className="flex h-12 items-center justify-center gap-2 rounded-xl border border-black/[.14] px-4 text-sm font-bold dark:border-white/15"
        >
          {copied ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
          {copied ? 'Copied' : 'Copy'}
        </button>
        <a
          href={referralUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Open the referral page"
          className="flex h-12 w-12 items-center justify-center rounded-xl border border-black/[.14] dark:border-white/15"
        >
          <ExternalLink className="h-4 w-4" />
        </a>
      </div>
    </div>
    </section>
  );
}

// ---------------------------------------------------------------- Rewards

export function RewardsTab({ data }: { data: RewardsForMember }) {
  const { rewards, grantedIds, sessions, months } = data;
  const club = clubProgress(sessions);

  const progressOf = (r: RewardsForMember['rewards'][number]) => (r.kind === 'sessions' ? sessions : months) / r.threshold;
  // Earned-but-not-received first, then nearest to being earned, then already received.
  const rank = (r: RewardsForMember['rewards'][number]) => (grantedIds.includes(r.id) ? 2 : progressOf(r) >= 1 ? 0 : 1);
  const sorted = [...rewards].sort((a, b) => rank(a) - rank(b) || progressOf(b) - progressOf(a));
  // The club bar and the rewards' bars fill when the screen opens.
  const screen = useRef<HTMLDivElement>(null);
  useGrowIn(screen, 0.2);

  return (
    <div ref={screen} className="space-y-5">
      <section className="space-y-2.5">
      <h2 className={headCls}>Session clubs</h2>
      <div className={cardCls}>
        <p className="text-[28px] font-black leading-tight text-black dark:text-zinc-50">
          <CountUp to={sessions} delay={0.1} /> session{sessions === 1 ? '' : 's'}
        </p>
        <p className="text-[15px] font-bold text-black dark:text-zinc-50">
          {club.earned.length > 0 ? `You're in the ${club.earned[club.earned.length - 1]} club` : `${club.toGo} sessions to the ${club.next} club`}
        </p>
        {club.earned.length > 0 && (
          <p className="text-[13px] text-zinc-500 dark:text-zinc-400">
            {club.toGo} more session{club.toGo === 1 ? '' : 's'} to the {club.next} club
          </p>
        )}
        <div className="mt-2.5">
          <ClubBar progress={club} />
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {clubBadges(sessions).map(({ n, reached }) => (
            <span
              key={n}
              className={`rounded-full px-3 py-1 text-xs font-extrabold ${
                reached ? 'bg-accent text-accent-foreground' : 'bg-black/5 text-zinc-500 dark:bg-white/10 dark:text-zinc-400'
              }`}
            >
              {n} club
            </span>
          ))}
        </div>
      </div>
      </section>

      {sorted.length === 0 ? (
        <EmptyState icon={Gift} title="No rewards yet" hint="Loyalty gifts like bottles and hoodies will show up here." />
      ) : (
        <section className="space-y-2.5">
        <h2 className={headCls}>Rewards</h2>
        <div className="divide-y divide-black/[.07] overflow-hidden rounded-[20px] border border-black/[.08] bg-card dark:divide-white/10 dark:border-white/10">
        {sorted.map((r) => {
          const value = r.kind === 'sessions' ? sessions : months;
          const unit = r.kind === 'sessions' ? 'sessions' : 'months';
          const given = grantedIds.includes(r.id);
          const earned = value >= r.threshold;
          const pct = Math.min(100, Math.round((value / r.threshold) * 100));
          return (
            <div key={r.id} className="px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[15px] font-bold text-black dark:text-zinc-50">{r.name}</p>
                  <p className="text-[13px] text-zinc-500 dark:text-zinc-400">
                    {r.kind === 'sessions' ? `After ${r.threshold} sessions` : `After ${r.threshold} months as a member`}
                    {r.description ? ` · ${r.description}` : ''}
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-extrabold ${
                    given
                      ? 'bg-accent-soft text-accent'
                      : earned
                        ? 'bg-[#1d1d1b] text-white dark:bg-zinc-100 dark:text-[#1d1d1b]'
                        : 'bg-black/5 text-zinc-600 dark:bg-white/10 dark:text-zinc-300'
                  }`}
                >
                  {given ? 'Received ✓' : earned ? 'Earned — ask your coach' : `${value} of ${r.threshold} ${unit}`}
                </span>
              </div>
              {!earned && (
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-black/10 dark:bg-white/15">
                  <div data-grow="bar" className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
                </div>
              )}
            </div>
          );
        })}
        </div>
        </section>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- FAQs

// The answers are built from the app's own data (the club list, the member's plan, the gym's cancellation rule, the check-in window) and
// the wording the owner edits in lib/faqContent.ts, which also lists what the owner must confirm (R16).
export function FaqTab({
  clientId,
  membership,
  gymBlackout,
  referralUrl,
  onMessageCoach,
}: {
  clientId: string;
  membership: ClientMembershipRow | null;
  gymBlackout: { start: string | null; end: string | null } | null;
  referralUrl: string | null;
  // The member's screen: "Still stuck?" opens the chat with their coach.
  onMessageCoach?: () => void;
}) {
  const [open, setOpen] = useState<number | null>(null);
  const faqList = useRef<HTMLDivElement>(null);
  const lenis = useLenis();
  useGSAP(
    () => {
      if (open == null) return;
      const panel = faqList.current?.querySelector<HTMLElement>(`[data-faq-panel="${open}"]`);
      if (!panel) return;
      // Scrolled so the question sits near the top when the answer would end under the tab bar.
      const intoView = () => {
        const bottom = panel.getBoundingClientRect().bottom;
        const question = panel.previousElementSibling as HTMLElement | null;
        if (bottom > window.innerHeight - 110 && question) {
          if (lenis) lenis.scrollTo(question, { offset: -120 });
          else question.scrollIntoView({ block: 'start' });
        }
      };
      if (prefersReducedMotion()) return intoView();
      gsap.from(panel, {
        height: 0,
        paddingBottom: 0,
        opacity: 0,
        duration: 0.35,
        ease: 'power2.out',
        clearProps: 'height,paddingBottom,opacity',
        onComplete: intoView,
      });
    },
    { scope: faqList, dependencies: [open] }
  );
  // Each session has its own cancel-by time; the sessions are read when this screen opens to say whether the gym has one rule.
  const timetable = useOnDemand(() => getMemberTimetable(clientId), clientId);
  // The member's coach's address (the narrow get_my_coach_email read, migration 0048); the question is left out until it is known.
  const [coachEmail, setCoachEmail] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    void Promise.resolve(createClient().rpc('get_my_coach_email'))
      .then(({ data }) => {
        if (!cancelled && typeof data === 'string' && data) setCoachEmail(data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);
  const cutoffs = (timetable.data ?? []).map((o) => o.cutoffHours);
  const pkg = membership?.package ?? null;
  const FAQS = buildFaqs({
    planName: pkg?.name ?? null,
    creditsPerWeek: pkg?.credits_per_week ?? null,
    advanceBookingDays: pkg?.advance_booking_days ?? null,
    cancellation: cancellationPolicyText(gymBlackout, cutoffs),
    referralUrl,
    coachEmail,
    planEndsOn: membership?.scheduled_end ?? null,
    planFixedLength: !!pkg?.duration_weeks && pkg.duration_weeks > 0,
  });
  return (
    <div className="space-y-4">
      <div ref={faqList} className={`${cardCls} overflow-hidden !p-0`}>
        {FAQS.map((f, i) => (
          <div key={f.q} className="border-b border-black/[.07] last:border-b-0 dark:border-white/10">
            <button
              type="button"
              onClick={() => setOpen(open === i ? null : i)}
              aria-expanded={open === i}
              className="flex min-h-14 w-full items-center justify-between gap-3 px-4 py-3 text-left"
            >
              <span className="text-[15px] font-bold text-black dark:text-zinc-50">{f.q}</span>
              <ChevronDown className={`h-4 w-4 shrink-0 text-zinc-400 transition-transform ${open === i ? 'rotate-180' : ''}`} />
            </button>
            {open === i && (
              <div data-faq-panel={i} className="overflow-hidden px-4 pb-3.5 text-sm text-zinc-600 dark:text-zinc-400">
                <p>{f.a}</p>
                {f.email && (
                  <a href={`mailto:${f.email}`} className="mt-1 inline-block break-all font-semibold text-accent underline">
                    {f.email}
                  </a>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
      {onMessageCoach && (
        <div className={`${cardCls} flex items-center gap-3`}>
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-extrabold text-black dark:text-zinc-50">Still stuck?</p>
            <p className="text-[13px] text-zinc-500 dark:text-zinc-400">Your coach usually knows the answer.</p>
          </div>
          <button type="button" onClick={onMessageCoach} className={`flex h-11 shrink-0 items-center gap-1.5 px-4 text-sm ${blackBtn}`}>
            <MessageSquare className="h-4 w-4" /> Message
          </button>
        </div>
      )}
      <div className="flex justify-center gap-2 text-[13px] text-zinc-500">
        <Link href="/legal/terms" className="flex min-h-11 items-center px-2 underline">Terms &amp; conditions</Link>
        <Link href="/legal/privacy" className="flex min-h-11 items-center px-2 underline">Privacy policy</Link>
      </div>
    </div>
  );
}
