'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { BottomSheet } from '@/app/_components/BottomSheet';
import { DropdownMenu } from '@/app/_components/DropdownMenu';
import { EmptyState } from '@/app/_components/EmptyState';
import { useToast } from '@/app/_components/ToastProvider';
import { getGymRoster, type GymCoachRow } from '@/lib/data/gym';
import { getRedFlagReport, saveRedFlagThresholds, updateRedFlagEntry } from '@/lib/data/redFlags';
import { addDays, DEFAULT_TIMEZONE, isoWeekKey, toIsoDate, todayIsoInTz } from '@/lib/utils/dates';
import type { RedFlagEntry, RedFlagReport, RedFlagStat } from '@/lib/data/types';

const field = 'w-full rounded-xl border border-black/10 bg-transparent px-3.5 py-2.5 text-base dark:border-white/10';
const shortDay = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const longDay = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });

// Monday of the last week that has finished.
function lastCompletedWeek(): string {
  const todayIso = todayIsoInTz(DEFAULT_TIMEZONE);
  return toIsoDate(addDays(new Date(`${isoWeekKey(todayIso)}T00:00:00Z`), -7));
}

const TIER_CLS: Record<'red' | 'amber' | 'green', string> = {
  red: 'bg-danger text-white',
  amber: 'bg-warning text-black',
  green: 'bg-success text-white',
};
const TIER_DOT: Record<'red' | 'amber' | 'green', string> = { red: 'bg-danger', amber: 'bg-warning', green: 'bg-success' };

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-3 py-1.5 text-xs font-bold ${
        active ? 'bg-accent text-accent-foreground' : 'border border-black/10 text-zinc-600 dark:border-white/15 dark:text-zinc-300'
      }`}
    >
      {children}
    </button>
  );
}

// One flagged member. Collapsed it shows who and why; opened it holds the team's columns from the SOP: contact
// made, reason, red flag tier and which coach is following up. Saved as you go.
function FlagRow({
  entry,
  stat,
  coaches,
  kind,
  thresholds,
  onChange,
}: {
  entry: RedFlagEntry;
  stat: RedFlagStat | undefined;
  coaches: GymCoachRow[];
  kind: 'low' | 'late';
  thresholds: { min_attended: number };
  onChange: (id: string, fields: Partial<RedFlagEntry>) => void;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState(entry.reason ?? '');
  const name = stat?.name ?? 'Member';
  const headline =
    kind === 'low'
      ? `${entry.attended} attended`
      : [entry.late_cancels > 0 ? `${entry.late_cancels} late cancel${entry.late_cancels === 1 ? '' : 's'}` : '', entry.no_shows > 0 ? `${entry.no_shows} no-show${entry.no_shows === 1 ? '' : 's'}` : '']
          .filter(Boolean)
          .join(' · ');
  const contactedLabel = entry.contacted === 'yes' ? 'Contacted' : entry.contacted === 'na' ? 'Reason known' : 'To contact';
  const coach = coaches.find((c) => c.id === entry.coach_id);
  void thresholds;

  return (
    <div className="rounded-2xl border border-black/[.06] bg-card dark:border-white/10">
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-3 p-3.5 text-left">
        <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${entry.tier ? TIER_DOT[entry.tier] : 'bg-zinc-300 dark:bg-zinc-600'}`} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-bold text-black dark:text-zinc-50">{name}</span>
          <span className="block text-xs text-zinc-500">
            {headline}
            {stat && stat.unmarked > 0 && <span className="text-warning"> · {stat.unmarked} not marked yet</span>}
          </span>
        </span>
        <span
          className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ${
            entry.contacted === 'no' ? 'bg-warning/15 text-warning' : 'bg-success/15 text-success'
          }`}
        >
          {contactedLabel}
        </span>
        <ChevronRight className={`h-4 w-4 shrink-0 text-zinc-400 transition-transform ${open ? 'rotate-90' : ''}`} />
      </button>

      {open && (
        <div className="space-y-4 border-t border-black/5 p-3.5 dark:border-white/10">
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-zinc-500">Contact made</p>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  ['no', 'Not yet'],
                  ['yes', 'Yes'],
                  ['na', 'N/A, reason known'],
                ] as const
              ).map(([value, label]) => (
                <Chip key={value} active={entry.contacted === value} onClick={() => onChange(entry.id, { contacted: value })}>
                  {label}
                </Chip>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <p className="text-xs font-medium text-zinc-500">Reason for absence</p>
            <textarea
              rows={2}
              className={field}
              value={reason}
              placeholder="Why they have been away, once you know"
              onChange={(e) => setReason(e.target.value)}
              onBlur={() => {
                if (reason.trim() !== (entry.reason ?? '')) onChange(entry.id, { reason: reason.trim() || null });
              }}
            />
          </div>

          <div className="space-y-1.5">
            <p className="text-xs font-medium text-zinc-500">Red flag tier</p>
            <div className="flex flex-wrap gap-2">
              {(['red', 'amber', 'green'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => onChange(entry.id, { tier: entry.tier === t ? null : t })}
                  className={`rounded-full px-3.5 py-1.5 text-xs font-bold capitalize ${
                    entry.tier === t ? TIER_CLS[t] : 'border border-black/10 text-zinc-600 dark:border-white/15 dark:text-zinc-300'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-zinc-500">
              Red: no reply, no valid reason, or the same reason for weeks. Amber: they replied but have been away a lot. Green: a good reason and they are
              coming back.
            </p>
          </div>

          <div className="space-y-1.5">
            <p className="text-xs font-medium text-zinc-500">Coach following up</p>
            <select
              className={field}
              value={entry.coach_id ?? ''}
              onChange={(e) => onChange(entry.id, { coach_id: e.target.value || null })}
            >
              <option value="">Not assigned</option>
              {coaches.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.displayName ?? c.email}
                </option>
              ))}
            </select>
            {coach && <p className="text-[11px] text-zinc-500">Assigned to {coach.displayName ?? coach.email}</p>}
          </div>

          <div className="flex flex-wrap gap-2">
            <Link
              href={`/coach/clients/${entry.client_id}?open=messages`}
              className="rounded-full bg-accent px-4 py-2 text-sm font-bold text-accent-foreground"
            >
              Message
            </Link>
            <Link
              href={`/coach/clients/${entry.client_id}`}
              className="rounded-full border border-black/10 px-4 py-2 text-sm font-bold text-zinc-700 dark:border-white/15 dark:text-zinc-200"
            >
              Open member
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

function ContactHelp({ onClose }: { onClose: () => void }) {
  return (
    <BottomSheet title="Getting in touch" onClose={onClose}>
      <div className="space-y-4 text-sm text-zinc-700 dark:text-zinc-300">
        <p>
          Use the way they usually reply: the app first, then email. Most red-flag members have drifted from the app too, so a phone call is often the best way
          to reach them.
        </p>
        <div>
          <p className="mb-1 font-bold text-black dark:text-zinc-50">On a call</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              <b>Obstacles:</b> find out what is stopping them coming.
            </li>
            <li>
              <b>Motivation:</b> help them set new goals if they have reached the old ones.
            </li>
            <li>
              <b>Scheduling:</b> plan sessions around their new work or other commitments.
            </li>
            <li>
              <b>Game plan:</b> suggest other sessions and agree a plan for turning up regularly.
            </li>
          </ul>
        </div>
        <div className="space-y-2 rounded-xl bg-black/[.03] p-3 dark:bg-white/[.04]">
          <p className="font-bold text-black dark:text-zinc-50">Call</p>
          <p>Hey {'{first name}'}, how is it going? I have not seen you in the gym as much recently, I just wanted to check in. Is there anything I can do to help keep you on track?</p>
          <p className="text-xs text-zinc-500">Then listen, find the problem, and offer a solution or a plan.</p>
        </div>
        <div className="space-y-2 rounded-xl bg-black/[.03] p-3 dark:bg-white/[.04]">
          <p className="font-bold text-black dark:text-zinc-50">Message</p>
          <p>
            I noticed you have not attended the gym lately. I just wanted to check in and make sure everything is ok? It would be great to get you back in so we can keep working
            on your goal together.
          </p>
        </div>
      </div>
    </BottomSheet>
  );
}

function ThresholdsSheet({ initial, onSaved, onClose }: { initial: RedFlagReport['thresholds']; onSaved: () => void; onClose: () => void }) {
  const toast = useToast();
  const [vals, setVals] = useState(initial);
  const [busy, setBusy] = useState(false);
  const num = (k: keyof typeof vals) => (
    <input
      type="number"
      min={1}
      inputMode="numeric"
      className={field}
      value={vals[k]}
      onChange={(e) => setVals({ ...vals, [k]: Math.max(1, Number(e.target.value) || 1) })}
    />
  );
  return (
    <BottomSheet title="Red flag thresholds" onClose={onClose}>
      <div className="space-y-4">
        <p className="text-sm text-zinc-600 dark:text-zinc-400">A member is flagged for a week when any of these is true. The usual setting is 2, 2 and 2.</p>
        <div className="space-y-1">
          <label className="text-xs font-medium text-zinc-500">Attended fewer than this many classes</label>
          {num('min_attended')}
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-zinc-500">Late cancels this many or more</label>
          {num('late_cancels')}
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-zinc-500">No-shows this many or more</label>
          {num('no_shows')}
        </div>
        <p className="text-xs text-zinc-500">Weeks already written keep the lists they had. New weeks use these numbers.</p>
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            const r = await saveRedFlagThresholds(vals);
            setBusy(false);
            if (r.ok) {
              toast.success('Saved');
              onSaved();
              onClose();
            } else toast.error(r.error);
          }}
          className="w-full rounded-full bg-accent py-3 text-sm font-extrabold text-accent-foreground disabled:opacity-50"
        >
          {busy ? 'Saving…' : 'Save'}
        </button>
      </div>
    </BottomSheet>
  );
}

export function RedFlagsView({ onOpenAttendance }: { onOpenAttendance?: () => void }) {
  const toast = useToast();
  const latest = lastCompletedWeek();
  const [week, setWeek] = useState(latest);
  const [data, setData] = useState<{ report: RedFlagReport | null; error: string | null } | null>(null);
  const [entries, setEntries] = useState<RedFlagEntry[]>([]);
  const [coaches, setCoaches] = useState<GymCoachRow[]>([]);
  const [filter, setFilter] = useState<'all' | 'todo' | 'red'>('all');
  const [sheet, setSheet] = useState<'help' | 'thresholds' | null>(null);
  const [reload, setReload] = useState(0);

  const load = useCallback(
    (w: string) => {
      getRedFlagReport(w).then((d) => {
        setData(d);
        setEntries(d.report?.entries ?? []);
      });
    },
    []
  );

  useEffect(() => {
    Promise.resolve().then(() => {
      setData(null);
      load(week);
    });
  }, [week, reload, load]);

  useEffect(() => {
    getGymRoster().then(setCoaches).catch(() => {});
  }, []);

  function change(id: string, fields: Partial<RedFlagEntry>) {
    const before = entries;
    setEntries((es) => es.map((e) => (e.id === id ? { ...e, ...fields } : e)));
    updateRedFlagEntry(id, fields).then((r) => {
      if (!r.ok) {
        toast.error(r.error);
        setEntries(before);
      }
    });
  }

  const report = data?.report ?? null;
  const statById = new Map((report?.stats ?? []).map((s) => [s.client_id, s]));
  const weekEnd = toIsoDate(addDays(new Date(`${week}T00:00:00Z`), 6));

  const visible = (e: RedFlagEntry) => (filter === 'todo' ? e.contacted === 'no' : filter === 'red' ? e.tier === 'red' : true);
  const worstFirst = (a: RedFlagEntry, b: RedFlagEntry, key: 'attended' | 'late') =>
    key === 'attended' ? a.attended - b.attended : b.late_cancels + b.no_shows - (a.late_cancels + a.no_shows);
  const low = entries.filter((e) => e.low_attendance && visible(e)).sort((a, b) => worstFirst(a, b, 'attended'));
  const late = entries.filter((e) => e.late_or_no_show && visible(e)).sort((a, b) => worstFirst(a, b, 'late'));
  const toContact = entries.filter((e) => e.contacted === 'no').length;
  const reds = entries.filter((e) => e.tier === 'red').length;
  const anyUnmarked = entries.some((e) => (statById.get(e.client_id)?.unmarked ?? 0) > 0);
  const leftOut = (report?.stats ?? []).filter((s) => s.status !== 'covered');
  const leftOutLabel: Record<string, string> = { new: 'Joined during or after the week', hold: 'On hold', ended: 'Membership already ended' };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label="Previous week"
            onClick={() => setWeek(toIsoDate(addDays(new Date(`${week}T00:00:00Z`), -7)))}
            className="rounded-full p-2 text-zinc-500 hover:bg-black/5 dark:hover:bg-white/10"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <div className="text-center">
            <p className="text-sm font-extrabold text-black dark:text-zinc-50">
              {shortDay(week)} to {longDay(weekEnd)}
            </p>
            <p className="text-[11px] text-zinc-500">{week === latest ? 'Last week' : 'Earlier week'}</p>
          </div>
          <button
            type="button"
            aria-label="Next week"
            disabled={week >= latest}
            onClick={() => setWeek(toIsoDate(addDays(new Date(`${week}T00:00:00Z`), 7)))}
            className="rounded-full p-2 text-zinc-500 hover:bg-black/5 disabled:opacity-30 dark:hover:bg-white/10"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        <DropdownMenu
          variant="header"
          triggerLabel="Red flag options"
          items={[
            { label: 'Getting in touch', onSelect: () => setSheet('help') },
            { label: 'Thresholds', onSelect: () => setSheet('thresholds'), disabled: !report },
          ]}
        />
      </div>

      {data === null && <p className="text-sm text-zinc-500">Loading…</p>}

      {data?.error && (
        <div className="rounded-2xl border border-warning/30 bg-warning/10 p-4 text-sm text-zinc-700 dark:text-zinc-300">
          <p className="font-bold text-black dark:text-zinc-50">The red flag report could not load.</p>
          <p className="mt-1 text-xs">{data.error}</p>
        </div>
      )}

      {report && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <Chip active={filter === 'all'} onClick={() => setFilter('all')}>
              Everyone ({entries.length})
            </Chip>
            <Chip active={filter === 'todo'} onClick={() => setFilter('todo')}>
              To contact ({toContact})
            </Chip>
            <Chip active={filter === 'red'} onClick={() => setFilter('red')}>
              Red, for the meeting ({reds})
            </Chip>
          </div>

          {anyUnmarked && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-warning/30 bg-warning/10 p-3.5">
              <p className="text-sm text-zinc-700 dark:text-zinc-300">
                Some bookings this week were never marked attended or no-show, so a few of these members may have come after all.
              </p>
              {onOpenAttendance && (
                <button type="button" onClick={onOpenAttendance} className="shrink-0 rounded-full bg-accent px-4 py-1.5 text-sm font-bold text-accent-foreground">
                  Mark attendance
                </button>
              )}
            </div>
          )}

          <section className="space-y-2">
            <div>
              <h3 className="text-sm font-extrabold text-black dark:text-zinc-50">Low attendance · {low.length}</h3>
              <p className="text-xs text-zinc-500">Attended fewer than {report.thresholds.min_attended} classes. Fewest first.</p>
            </div>
            {low.length === 0 && <EmptyState compact title={entries.some((e) => e.low_attendance) ? 'Nobody matches this filter.' : 'Nobody had low attendance this week.'} />}
            {low.map((e) => (
              <FlagRow key={`low-${e.id}`} entry={e} stat={statById.get(e.client_id)} coaches={coaches} kind="low" thresholds={report.thresholds} onChange={change} />
            ))}
          </section>

          <section className="space-y-2">
            <div>
              <h3 className="text-sm font-extrabold text-black dark:text-zinc-50">Late cancels and no-shows · {late.length}</h3>
              <p className="text-xs text-zinc-500">
                {report.thresholds.late_cancels}+ late cancels or {report.thresholds.no_shows}+ no-shows. Most first.
              </p>
            </div>
            {late.length === 0 && <EmptyState compact title={entries.some((e) => e.late_or_no_show) ? 'Nobody matches this filter.' : 'No late cancel or no-show problems this week.'} />}
            {late.map((e) => (
              <FlagRow key={`late-${e.id}`} entry={e} stat={statById.get(e.client_id)} coaches={coaches} kind="late" thresholds={report.thresholds} onChange={change} />
            ))}
          </section>

          <section className="space-y-2">
            <div>
              <h3 className="text-sm font-extrabold text-black dark:text-zinc-50">Last 6 weeks</h3>
              <p className="text-xs text-zinc-500">
                Members flagged for low attendance in any of these weeks who are still active. <span className="font-bold text-danger">0</span> no classes,{' '}
                <span className="font-bold text-warning">1</span> one class, <span className="font-bold text-success">IN</span> enough.
              </p>
            </div>
            {report.master.members.length === 0 ? (
              <EmptyState compact title="Nobody has been flagged in the last six weeks." />
            ) : (
              <div className="overflow-x-auto rounded-2xl border border-black/[.06] bg-card dark:border-white/10">
                <table className="w-full min-w-[420px] border-collapse text-sm">
                  <thead>
                    <tr className="text-[11px] uppercase tracking-wide text-zinc-400">
                      <th className="sticky left-0 z-10 bg-card px-3 py-2 text-left font-semibold">Member</th>
                      {report.master.weeks.map((w) => (
                        <th key={w} className="px-2 py-2 text-center font-semibold">
                          {shortDay(w)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {report.master.members.map((m) => (
                      <tr key={m.client_id} className="border-t border-black/5 dark:border-white/10">
                        <td className="sticky left-0 z-10 max-w-[9rem] truncate bg-card px-3 py-2 font-semibold text-black dark:text-zinc-50">
                          <Link href={`/coach/clients/${m.client_id}`} className="hover:underline">
                            {m.name}
                          </Link>
                        </td>
                        {m.counts.map((c, i) => (
                          <td key={i} className="px-1 py-1.5 text-center">
                            {c == null ? null : (
                              <span
                                className={`inline-block min-w-[2rem] rounded-md px-1.5 py-1 text-xs font-extrabold ${
                                  c === 0
                                    ? 'bg-danger/15 text-danger'
                                    : c < report.thresholds.min_attended
                                      ? 'bg-warning/20 text-warning'
                                      : 'bg-success/15 text-success'
                                }`}
                              >
                                {c < report.thresholds.min_attended ? c : 'IN'}
                              </span>
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {leftOut.length > 0 && (
            <details className="rounded-2xl border border-black/[.06] bg-card dark:border-white/10">
              <summary className="cursor-pointer list-none px-4 py-3 text-sm font-bold text-black dark:text-zinc-50">
                Left out this week ({leftOut.length})
                <span className="ml-2 text-xs font-medium text-zinc-500">new starters, on hold, ended</span>
              </summary>
              <ul className="divide-y divide-black/5 px-4 pb-2 dark:divide-white/10">
                {leftOut.map((s) => (
                  <li key={s.client_id} className="flex items-center justify-between gap-3 py-2 text-sm">
                    <Link href={`/coach/clients/${s.client_id}`} className="truncate font-semibold text-black hover:underline dark:text-zinc-50">
                      {s.name}
                    </Link>
                    <span className="shrink-0 text-xs text-zinc-500">{leftOutLabel[s.status]}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}

      {sheet === 'help' && <ContactHelp onClose={() => setSheet(null)} />}
      {sheet === 'thresholds' && report && (
        <ThresholdsSheet initial={report.thresholds} onSaved={() => setReload((n) => n + 1)} onClose={() => setSheet(null)} />
      )}
    </div>
  );
}
