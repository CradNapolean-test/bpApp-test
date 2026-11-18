'use client';

import { useState } from 'react';
import { inputCls } from '@/app/_components/ui';
import { useOnDemand } from '@/app/_components/useOnDemand';
import { getSessionCredits } from '@/lib/data/classes';
import { shortDayLabel, type SessionCredit } from '@/lib/utils/booking';
import type { CoachClientRow } from '@/lib/data/coach';

// Search for a member and add them to one session: used by the Sessions roster pop-up and by Run this class (a walk-in, CS2). Says
// what it costs, or that they go on the waitlist when it is full; the database (book_class_for_client) decides. A member short of
// credits can be given what they are short and booked in one step (onAddWithCredits, D18). Only the coach's own members are listed:
// the database lets only a member's own coach book them in or add credits.
// A credit counts in the week the session runs (D13b, migration 0171): once a member is chosen, what they can pay with is read for the
// session's own day (that week's weekly credits plus bonus credits), so a session next week is not judged on this week's balance.
export function AddToSessionPanel({
  clients,
  excludeIds,
  full,
  creditCost,
  date,
  busy,
  onAdd,
  onAddWithCredits,
}: {
  // null while the list is loading.
  clients: CoachClientRow[] | null;
  // Members already booked or waiting.
  excludeIds: Set<string>;
  full: boolean;
  creditCost: number;
  // The session's date (YYYY-MM-DD).
  date: string;
  busy: boolean;
  onAdd: (clientId: string) => void;
  // Adds the credits they are short, then books them (grantCreditsAndBook). Without it a short member can't be added here.
  onAddWithCredits?: (clientId: string, credits: number) => void;
}) {
  const [clientId, setClientId] = useState('');
  const [search, setSearch] = useState('');

  const addable = (clients ?? []).filter((c) => !excludeIds.has(c.id));
  const chosen = addable.find((c) => c.id === clientId) ?? null;
  const term = search.trim().toLowerCase();
  const matches = addable
    .filter((c) => !term || (c.name ?? '').toLowerCase().includes(term) || c.email.toLowerCase().includes(term))
    .sort((a, b) => (a.name ?? a.email).localeCompare(b.name ?? b.email))
    .slice(0, 20);
  const sessionCredits = useOnDemand<Record<string, SessionCredit>>(
    () => (chosen ? getSessionCredits(chosen.id, [date]) : Promise.resolve({})),
    `${chosen?.id ?? ''}|${date}`
  );
  // Until the session's own numbers arrive (or if they can't be read), the balance in the list; the database decides either way.
  const credit = chosen ? sessionCredits.data?.[date] : undefined;
  const available = credit ? Math.max(credit.weeklyLeft, 0) + Math.max(credit.bonus, 0) : (chosen?.balance ?? 0);
  const afterPlanEnd = !!credit?.planLastDay && date > credit.planLastDay;
  const noCredits = !!chosen && !afterPlanEnd && available < creditCost;
  const short = chosen ? Math.max(1, creditCost - Math.max(0, available)) : 0;
  const topUp = noCredits && !full && !!onAddWithCredits;

  return (
    <div className="space-y-2">
      <input
        autoFocus
        value={search}
        onChange={(e) => {
          setSearch(e.target.value);
          setClientId('');
        }}
        placeholder="Search members…"
        aria-label="Search members"
        className={inputCls}
      />
      {clients == null && <p className="px-1 text-sm text-zinc-500">Loading members…</p>}
      {clients != null &&
        !chosen &&
        (matches.length === 0 ? (
          <p className="px-1 text-sm text-zinc-500">{addable.length === 0 ? 'Every member is already booked or waitlisted.' : 'No member matches.'}</p>
        ) : (
          <div className="max-h-52 space-y-1 overflow-y-auto">
            {matches.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => {
                  setClientId(c.id);
                  setSearch(c.name ?? c.email);
                }}
                className="flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2.5 text-left text-sm hover:bg-black/5 dark:hover:bg-white/5"
              >
                <span className="truncate font-semibold text-black dark:text-zinc-50">{c.name ?? c.email}</span>
                <span className={`shrink-0 text-xs font-bold ${c.balance < creditCost ? 'text-danger' : 'text-zinc-500'}`}>
                  {c.balance} credit{c.balance === 1 ? '' : 's'}
                </span>
              </button>
            ))}
          </div>
        ))}
      {clients != null && !chosen && (
        <p className="px-1 text-[11px] text-zinc-500">Only your own members are listed: a member&apos;s own coach books them in and adds their credits.</p>
      )}
      {chosen && (
        <>
          {afterPlanEnd && credit?.planLastDay ? (
            <p className="rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">
              {chosen.name ? `${chosen.name}'s` : 'Their'} plan ends on {shortDayLabel(credit.planLastDay)}, so they can&apos;t be booked after that. Start their next plan
              from their profile first.
            </p>
          ) : full ? (
            <p className="rounded-xl bg-warning/10 px-3 py-2 text-sm text-warning">This session is full, so {chosen.name ?? 'they'} will join the waitlist (no credit is taken until a place opens).</p>
          ) : noCredits ? (
            <p className="rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">
              {chosen.name ?? 'They'} only {available === 1 ? 'has 1 credit' : `has ${available} credits`} for that week and this session costs {creditCost}.
              {topUp ? ' Add what they are short and book them in one go.' : ' Add credits from their profile first.'}
            </p>
          ) : (
            <p className="px-1 text-xs text-zinc-500">
              Takes {creditCost} credit{creditCost === 1 ? '' : 's'} ({available} available for that week).
            </p>
          )}
          <button
            type="button"
            disabled={busy || afterPlanEnd || (noCredits && !full && !topUp)}
            onClick={() => (topUp ? onAddWithCredits!(chosen.id, short) : onAdd(chosen.id))}
            className="h-12 w-full rounded-xl bg-accent text-[15px] font-extrabold text-accent-foreground disabled:opacity-50"
          >
            {busy ? 'Adding…' : full ? 'Add to waitlist' : topUp ? `Add ${short} credit${short === 1 ? '' : 's'} and book` : 'Add to session'}
          </button>
        </>
      )}
    </div>
  );
}
