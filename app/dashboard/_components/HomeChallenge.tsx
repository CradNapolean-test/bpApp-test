'use client';

import { useEffect, useState } from 'react';
import { ChevronRight, Dumbbell, Phone } from 'lucide-react';
import { getPackagesForGym } from '@/lib/data/memberships';
import { ongoingPlans, whatsNextDraft, type ChallengeHome, type PlanOption } from '@/lib/challengeHome';
import { formatLongDate, formatShortDate } from '@/lib/utils/dates';
import { IconChip } from '@/app/_components/ui';

// D5: the challenge countdown and the "What's next" card on member Home. The rules are in lib/challengeHome.ts.

export const shortDay = (iso: string) => formatShortDate(iso);

// The member chat keeps a half-written message in sessionStorage under this key (ChatTab's draftKey, set in DashboardShell as
// `member-${clientId}`). A choice here leaves its message there, so the chat opens with it ready to send.
const memberChatDraftKey = (clientId: string) => `chat-draft:member-${clientId}`;

function leaveDraft(clientId: string, text: string) {
  try {
    // Never over a message the member had started writing themselves.
    if (!window.sessionStorage.getItem(memberChatDraftKey(clientId))) window.sessionStorage.setItem(memberChatDraftKey(clientId), text);
  } catch {
    // storage can be blocked: the chat still opens, empty
  }
}

function ChoiceRow({ icon, title, subtitle, onClick }: { icon: typeof Dumbbell; title: string; subtitle: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center justify-between gap-3 rounded-2xl border border-black/[.06] bg-card px-3.5 py-3 text-left transition-colors hover:bg-black/[.02] dark:border-white/10 dark:hover:bg-white/[.03]"
    >
      <span className="flex min-w-0 items-center gap-3">
        <IconChip icon={icon} size="sm" />
        <span className="min-w-0">
          <span className="block truncate text-sm font-bold text-black dark:text-zinc-50">{title}</span>
          <span className="block truncate text-xs text-zinc-500">{subtitle}</span>
        </span>
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-accent" />
    </button>
  );
}

// In the last 2 weeks of a plan with a set length: carry on with one of the gym's ongoing plans (Big Dog), or a call with the coach.
// Both open the chat with the coach, a message ready to send: nothing is bought in the app, the coach moves the member on.
export function WhatsNextCard({
  home,
  clientId,
  gymId,
  coachName,
  onOpenChat,
}: {
  home: ChallengeHome;
  clientId: string;
  gymId: string | null;
  coachName?: string | null;
  onOpenChat: () => void;
}) {
  const [plans, setPlans] = useState<PlanOption[]>([]);
  useEffect(() => {
    if (!gymId) return;
    let live = true;
    getPackagesForGym(gymId)
      .then((rows) => {
        if (live) setPlans(ongoingPlans(rows));
      })
      .catch(() => {
        // the call choice still shows
      });
    return () => {
      live = false;
    };
  }, [gymId]);

  const { endsOn, state } = home.countdown;
  const title =
    state === 'ended'
      ? `Your ${home.planName} has finished`
      : endsOn
        ? `Your ${home.planName} ends ${formatLongDate(endsOn)}`
        : `Your ${home.planName} is nearly over`;
  const choose = (choice: { plan: string } | 'call') => {
    leaveDraft(clientId, whatsNextDraft(home, choice, shortDay));
    onOpenChat();
  };
  const coach = coachName ?? 'your coach';

  return (
    <div className="rounded-3xl border border-accent/30 bg-accent-soft p-4">
      <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-accent">What&apos;s next</p>
      <p className="mt-1 text-lg font-black leading-snug text-black dark:text-zinc-50">{title}</p>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
        Keep the momentum going. Pick one and a message to {coach} is ready for you to send.
      </p>
      <div className="mt-3 space-y-2">
        {plans.map((p) => (
          <ChoiceRow
            key={p.id}
            icon={Dumbbell}
            title={`Carry on with ${p.name}`}
            subtitle={`${p.credits_per_week} credit${p.credits_per_week === 1 ? '' : 's'} a week`}
            onClick={() => choose({ plan: p.name })}
          />
        ))}
        <ChoiceRow icon={Phone} title={`Book a call with ${coach}`} subtitle="Talk through what comes next" onClick={() => choose('call')} />
      </div>
    </div>
  );
}
