'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, ChevronRight, Circle } from 'lucide-react';
import { getFirstWeekFacts } from '@/lib/data/firstWeek';
import { FIRST_WEEK_DAYS, firstWeekChecklist, firstWeekDay, type FirstWeekFacts, type FirstWeekKey } from '@/lib/firstWeek';
import { Card } from '@/app/_components/ui';

// D17: "Your first week" on member Home for the 7 days after onboarding (MX24, MX12). Each step ticks itself from the member's own
// rows (read again each time Home opens) and opens where it is done; the card goes when all are done or the week is over.
export function FirstWeekCard({
  clientId,
  onboardedAt,
  todayIso,
  timezone,
  coachName,
  show,
  onOpen,
}: {
  clientId: string;
  onboardedAt: string | null | undefined;
  todayIso: string;
  timezone: string;
  coachName?: string | null;
  show: { photos: boolean; weighIn: boolean; forms: boolean };
  onOpen: (key: FirstWeekKey) => void;
}) {
  const inWeek = firstWeekDay(onboardedAt, todayIso, timezone) != null;
  const [facts, setFacts] = useState<FirstWeekFacts | null>(null);
  useEffect(() => {
    if (!inWeek) return;
    let live = true;
    getFirstWeekFacts(clientId)
      .then((f) => {
        if (live) setFacts(f);
      })
      .catch(() => {
        // a checklist that cannot be read stays away rather than showing every step as not done
      });
    return () => {
      live = false;
    };
  }, [clientId, inWeek]);

  const week = facts ? firstWeekChecklist({ onboardedAt, today: todayIso, tz: timezone, facts, coachName, show }) : null;
  if (!week) return null;
  const total = week.items.length;

  return (
    <Card flush className="overflow-hidden">
      <div className="px-4 pb-3 pt-3.5">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-base font-extrabold text-black dark:text-zinc-50">Your first week</p>
          <p className="shrink-0 text-xs font-semibold text-zinc-500">
            Day {week.day} of {FIRST_WEEK_DAYS}
          </p>
        </div>
        <p className="mt-0.5 text-xs text-zinc-500">
          {week.doneCount} of {total} done
        </p>
        <div className="mt-2 h-1.5 w-full rounded-full bg-black/5 dark:bg-white/10" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={week.doneCount} aria-label="First week steps done">
          <div className="h-1.5 rounded-full bg-accent" style={{ width: `${(week.doneCount / total) * 100}%` }} />
        </div>
      </div>
      <ul className="border-t border-black/5 dark:border-white/5">
        {week.items.map((item) => (
          <li key={item.key} className="border-b border-black/5 last:border-b-0 dark:border-white/5">
            <button
              type="button"
              onClick={() => onOpen(item.key)}
              className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-black/[.02] dark:hover:bg-white/[.03]"
            >
              {item.done ? <CheckCircle2 className="h-5 w-5 shrink-0 text-success" aria-label="Done" /> : <Circle className="h-5 w-5 shrink-0 text-zinc-300 dark:text-zinc-600" aria-label="To do" />}
              <span className="min-w-0 flex-1">
                <span className={`block truncate text-sm font-semibold ${item.done ? 'text-zinc-400 line-through' : 'text-black dark:text-zinc-50'}`}>{item.title}</span>
                {!item.done && <span className="block truncate text-xs text-zinc-500">{item.detail}</span>}
              </span>
              {!item.done && <ChevronRight className="h-4 w-4 shrink-0 text-zinc-400" />}
            </button>
          </li>
        ))}
      </ul>
    </Card>
  );
}
