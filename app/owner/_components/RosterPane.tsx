'use client';

import { useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import { Avatar } from '@/app/_components/Avatar';
import { useOnDemand } from '@/app/_components/useOnDemand';
import { inputCls } from '@/app/_components/ui';
import { getOwnerGymRoster } from '@/lib/data/owner';
import { LOAD_FAILED, settle } from '@/lib/ownerReport';
import {
  ROSTER_FILTERS,
  ROSTER_FILTER_LABELS,
  ROSTER_PAGE_SIZE,
  STATUS_LABELS,
  hasNextPage,
  hasPreviousPage,
  lastActiveLabel,
  previousOffset,
  rangeLabel,
  type RosterFilter,
} from '@/lib/ownerRoster';

// A read-only list of a gym's members for the owner: name, coach, plan, last active and status, with search, a filter and paging. The
// database function behind it returns no health information, so there is none to show (R37).
export function RosterPane({ gymId, initialFilter }: { gymId: string; initialFilter: RosterFilter | null }) {
  const [filter, setFilter] = useState<RosterFilter | null>(initialFilter);
  const [search, setSearch] = useState('');
  const [typed, setTyped] = useState('');
  const [offset, setOffset] = useState(0);

  // One read per filter, search and page; an answer for an earlier choice is dropped, and a thrown error becomes a failed result.
  const { data: answer, loading, reload } = useOnDemand(
    () => settle(() => getOwnerGymRoster(gymId, { filter, search, limit: ROSTER_PAGE_SIZE, offset })),
    `${gymId}|${filter ?? ''}|${search}|${offset}`
  );
  const roster = answer?.ok ? answer.data : null;
  const state: 'loading' | 'ready' | 'failed' = answer == null ? 'loading' : answer.ok ? 'ready' : 'failed';
  const error = answer && !answer.ok ? answer.error : LOAD_FAILED;

  // Search runs half a second after typing stops, from the first page.
  useEffect(() => {
    const id = setTimeout(() => {
      setSearch(typed.trim());
      setOffset(0);
    }, 450);
    return () => clearTimeout(id);
  }, [typed]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[12rem] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" aria-hidden />
          <input
            type="search"
            aria-label="Search members by name or email"
            placeholder="Search by name or email"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            className={`${inputCls} pl-9`}
          />
        </div>
        <select
          aria-label="Show"
          value={filter ?? ''}
          onChange={(e) => {
            setFilter((e.target.value || null) as RosterFilter | null);
            setOffset(0);
          }}
          className={`${inputCls} w-auto`}
        >
          <option value="">Everyone</option>
          {ROSTER_FILTERS.map((f) => (
            <option key={f} value={f}>
              {ROSTER_FILTER_LABELS[f]}
            </option>
          ))}
        </select>
      </div>

      {state === 'failed' && (
        <div className="rounded-lg border border-dashed border-black/10 p-6 text-center dark:border-white/15" role="alert">
          <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{error}</p>
          <button
            type="button"
            onClick={reload}
            className="mt-3 rounded-full bg-accent px-4 py-2 text-sm font-bold text-accent-foreground"
          >
            Try again
          </button>
        </div>
      )}

      {state !== 'failed' && (
        <div>
          {!roster ? (
            <p className="text-sm text-zinc-500">Loading members…</p>
          ) : roster.members.length === 0 ? (
            <p className="rounded-lg border border-dashed border-black/10 p-6 text-center text-sm text-zinc-500 dark:border-white/15">
              No members match{filter ? ` “${ROSTER_FILTER_LABELS[filter]}”` : ''}
              {search ? ` and “${search}”` : ''}.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-black/[.06] bg-card dark:border-white/10">
              <table className="w-full min-w-[34rem] text-left text-sm">
                <thead>
                  <tr className="text-[11px] uppercase tracking-wide text-zinc-500">
                    <th className="px-3 py-2 font-bold">Member</th>
                    <th className="px-2 py-2 font-bold">Coach</th>
                    <th className="px-2 py-2 font-bold">Plan</th>
                    <th className="px-2 py-2 font-bold">Last active</th>
                    <th className="px-3 py-2 font-bold">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/[.05] dark:divide-white/10">
                  {roster.members.map((m) => (
                    <tr key={m.clientId}>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-2.5">
                          <Avatar name={m.name} size="sm" />
                          <div className="min-w-0">
                            <p className="max-w-[12rem] truncate font-semibold text-black dark:text-zinc-50">{m.name}</p>
                            {m.name !== m.email && <p className="max-w-[12rem] truncate text-xs text-zinc-500">{m.email}</p>}
                          </div>
                        </div>
                      </td>
                      <td className="px-2 py-2.5 text-zinc-600 dark:text-zinc-300">{m.coachName ?? <span className="text-zinc-400">No coach</span>}</td>
                      <td className="px-2 py-2.5 text-zinc-600 dark:text-zinc-300">{m.plan ?? <span className="text-zinc-400">None</span>}</td>
                      <td className="px-2 py-2.5 text-zinc-600 dark:text-zinc-300">{lastActiveLabel(m.lastActive)}</td>
                      <td className="px-3 py-2.5">
                        <span className={`font-semibold ${m.status === 'no_plan' ? 'text-warning' : m.status === 'ending_soon' ? 'text-accent' : 'text-zinc-700 dark:text-zinc-200'}`}>
                          {STATUS_LABELS[m.status] ?? m.status}
                        </span>
                        {m.flagged && <span className="ml-1.5 text-xs font-bold text-danger">Flagged</span>}
                        {!m.onboarded && <span className="ml-1.5 text-xs text-zinc-400">Not set up</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {roster && roster.total > 0 && (
            <div className="mt-3 flex items-center justify-between gap-3 text-xs text-zinc-500">
              <span aria-live="polite">{rangeLabel(roster.total, roster.limit, roster.offset)}</span>
              <span className="flex gap-2">
                <button
                  type="button"
                  disabled={!hasPreviousPage(roster.offset) || loading}
                  onClick={() => setOffset(previousOffset(roster.limit, roster.offset))}
                  className="rounded-full border border-black/10 px-3 py-1.5 font-bold disabled:opacity-40 dark:border-white/15"
                >
                  Previous
                </button>
                <button
                  type="button"
                  disabled={!hasNextPage(roster.total, roster.limit, roster.offset) || loading}
                  onClick={() => setOffset(roster.offset + roster.limit)}
                  className="rounded-full border border-black/10 px-3 py-1.5 font-bold disabled:opacity-40 dark:border-white/15"
                >
                  Next
                </button>
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
