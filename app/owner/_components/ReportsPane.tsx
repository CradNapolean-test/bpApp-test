'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Download } from 'lucide-react';
import { EmptyState } from '@/app/_components/EmptyState';
import { toCsv } from '@/lib/csv';
import { getOwnerActivityReport } from '@/lib/data/owner';
import type { ActivityReport } from '@/lib/data/owner';

// Owner reports: check-ins through the week, per day and per week, and how much each coach has messaged.
// A check-in is a member logging anything on their daily check-in that day (the same measure as the Overview's
// "Logged this week"). Percentages are of members who finished onboarding in the chosen gym(s).

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const card = 'rounded-2xl border border-black/[.06] bg-card p-4 dark:border-white/10';
const shortDate = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });

function saveCsv(filename: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

function Heading({ title, hint, onCsv }: { title: string; hint?: string; onCsv?: () => void }) {
  return (
    <div className="mb-3 flex items-start justify-between gap-3">
      <div>
        <h3 className="text-base font-extrabold text-black dark:text-zinc-50">{title}</h3>
        {hint && <p className="text-xs text-zinc-500">{hint}</p>}
      </div>
      {onCsv && (
        <button
          type="button"
          onClick={onCsv}
          className="flex shrink-0 items-center gap-1.5 rounded-full border border-black/10 px-3 py-1.5 text-xs font-bold text-zinc-600 dark:border-white/15 dark:text-zinc-300"
        >
          <Download className="h-3.5 w-3.5" /> CSV
        </button>
      )}
    </div>
  );
}

function Bars({ items, max, label }: { items: { key: string; value: number; label: string; title: string }[]; max: number; label: string }) {
  return (
    <div className="flex h-32 items-end gap-1" role="img" aria-label={label}>
      {items.map((i) => (
        <div key={i.key} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1" title={i.title}>
          <div className="w-full rounded-t bg-accent/70" style={{ height: `${Math.max(i.value > 0 ? 3 : 0, (i.value / Math.max(1, max)) * 100)}%` }} />
          <span className="text-[10px] text-zinc-400">{i.label}</span>
        </div>
      ))}
    </div>
  );
}

export function ReportsPane({ gymId }: { gymId: string | null }) {
  const [report, setReport] = useState<ActivityReport | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading');
  const requested = useRef<string | null | undefined>(undefined);

  const load = useCallback(async (id: string | null) => {
    setState('loading');
    const data = await getOwnerActivityReport(id, 12);
    setReport(data);
    setState(data ? 'ready' : 'failed');
  }, []);

  // Fetch when the pane opens and whenever the gym filter changes (each value once).
  useEffect(() => {
    if (requested.current === gymId) return;
    requested.current = gymId;
    void load(gymId);
  }, [gymId, load]);

  if (state === 'loading' && !report) return <p className="text-sm text-zinc-500">Loading reports...</p>;
  if (state === 'failed' || !report) {
    return <EmptyState icon={Download} title="Reports are not available yet" hint="Run migration 0120, then reload." />;
  }
  if (report.members === 0) {
    return <EmptyState icon={Download} title="No members to report on yet" hint="Reports count members who have finished onboarding." />;
  }

  const thisWeek = report.perWeek[report.perWeek.length - 1];
  const lastWeek = report.perWeek[report.perWeek.length - 2];
  const best = [...report.byWeekday].sort((a, b) => b.avgPct - a.avgPct)[0];
  const worst = [...report.byWeekday].sort((a, b) => a.avgPct - b.avgPct)[0];
  const maxDay = Math.max(...report.perDay.map((d) => d.checkIns));
  const weekdayLabel = (dow: number) => WEEKDAYS[dow - 1];

  return (
    <div className={`space-y-4 ${state === 'loading' ? 'opacity-60' : ''}`}>
      <p className="text-xs text-zinc-500">
        A check-in is a member logging anything on their daily check-in that day. Percentages are of the {report.members} members who have finished
        onboarding.
      </p>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Tile label="Checked in this week" value={`${thisWeek.pct}%`} sub={`${thisWeek.activeMembers} of ${report.members} members`} />
        <Tile
          label="Last week"
          value={lastWeek ? `${lastWeek.pct}%` : '-'}
          sub={lastWeek ? `${lastWeek.activeMembers} of ${report.members} members` : undefined}
        />
        <Tile label="Best day" value={weekdayLabel(best.dow)} sub={`${best.avgPct}% on average`} />
        <Tile label="Quietest day" value={weekdayLabel(worst.dow)} sub={`${worst.avgPct}% on average`} />
      </div>

      <section className={card}>
        <Heading title="Check-ins through the week" hint="Share of members checking in on each weekday, average of the last 8 complete weeks." />
        <Bars
          label="Average check-in percentage by weekday"
          max={Math.max(...report.byWeekday.map((d) => d.avgPct))}
          items={report.byWeekday.map((d) => ({ key: String(d.dow), value: d.avgPct, label: weekdayLabel(d.dow), title: `${weekdayLabel(d.dow)}: ${d.avgPct}%` }))}
        />
        <div className="mt-1 flex justify-between px-0.5 text-[11px] font-semibold text-zinc-500">
          {report.byWeekday.map((d) => (
            <span key={d.dow} className="min-w-0 flex-1 text-center">
              {d.avgPct}%
            </span>
          ))}
        </div>
      </section>

      <section className={card}>
        <Heading
          title="Check-ins per day"
          hint="Members who checked in each day, last 28 days."
          onCsv={() =>
            saveCsv('checkins-per-day.csv', toCsv(['Date', 'Check-ins', 'Percent of members'], report.perDay.map((d) => [d.date, d.checkIns, d.pct])))
          }
        />
        <Bars
          label="Check-ins per day, last 28 days"
          max={maxDay}
          items={report.perDay.map((d, i) => ({
            key: d.date,
            value: d.checkIns,
            label: i % 7 === 0 ? shortDate(d.date) : '',
            title: `${shortDate(d.date)}: ${d.checkIns} (${d.pct}%)`,
          }))}
        />
      </section>

      <section className={card}>
        <Heading
          title="Check-ins and messages per week"
          hint="Members who checked in, and messages sent by coaches and by members."
          onCsv={() =>
            saveCsv(
              'weekly-activity.csv',
              toCsv(
                ['Week starting', 'Members who checked in', 'Percent of members', 'Check-in days', 'Coach messages', 'Member messages'],
                report.perWeek.map((w) => [w.weekStart, w.activeMembers, w.pct, w.checkIns, w.coachMessages, w.memberMessages])
              )
            )
          }
        />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[26rem] text-left text-sm">
            <thead>
              <tr className="text-[11px] uppercase tracking-wide text-zinc-500">
                <th className="py-1.5 pr-2 font-bold">Week of</th>
                <th className="px-2 py-1.5 text-right font-bold">Checked in</th>
                <th className="px-2 py-1.5 text-right font-bold">%</th>
                <th className="px-2 py-1.5 text-right font-bold">Coach msgs</th>
                <th className="py-1.5 pl-2 text-right font-bold">Member msgs</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/[.05] dark:divide-white/10">
              {[...report.perWeek].reverse().map((w) => (
                <tr key={w.weekStart}>
                  <td className="py-2 pr-2 text-zinc-600 dark:text-zinc-300">{shortDate(w.weekStart)}</td>
                  <td className="px-2 py-2 text-right">{w.activeMembers}</td>
                  <td className="px-2 py-2 text-right font-semibold">{w.pct}%</td>
                  <td className="px-2 py-2 text-right">{w.coachMessages}</td>
                  <td className="py-2 pl-2 text-right">{w.memberMessages}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className={card}>
        <Heading
          title="Coach messaging"
          hint="Messages each coach sent in the last 30 days, and how many different members they wrote to."
          onCsv={() =>
            saveCsv(
              'coach-messaging.csv',
              toCsv(
                ['Coach', 'Members', 'Checked in this week', 'Messages sent (30 days)', 'Members messaged (30 days)'],
                report.coaches.map((c) => [c.name, c.members, c.checkedInThisWeek, c.sent30, c.membersMessaged30])
              )
            )
          }
        />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[24rem] text-left text-sm">
            <thead>
              <tr className="text-[11px] uppercase tracking-wide text-zinc-500">
                <th className="py-1.5 pr-2 font-bold">Coach</th>
                <th className="px-2 py-1.5 text-right font-bold">Members</th>
                <th className="px-2 py-1.5 text-right font-bold">Checked in</th>
                <th className="px-2 py-1.5 text-right font-bold">Messages sent</th>
                <th className="py-1.5 pl-2 text-right font-bold">Members messaged</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/[.05] dark:divide-white/10">
              {report.coaches.map((c) => (
                <tr key={c.coachId}>
                  <td className="max-w-[10rem] truncate py-2 pr-2 font-semibold text-black dark:text-zinc-50">{c.name}</td>
                  <td className="px-2 py-2 text-right">{c.members}</td>
                  <td className="px-2 py-2 text-right">
                    {c.checkedInThisWeek} of {c.members}
                  </td>
                  <td className="px-2 py-2 text-right">{c.sent30}</td>
                  <td className={`py-2 pl-2 text-right ${c.members > 0 && c.membersMessaged30 < c.members ? 'text-warning' : ''}`}>
                    {c.membersMessaged30} of {c.members}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl border border-black/[.06] bg-card p-3.5 dark:border-white/10">
      <p className="text-2xl font-black text-black dark:text-zinc-50">{value}</p>
      <p className="text-xs text-zinc-500">{label}</p>
      {sub && <p className="text-[11px] text-zinc-400">{sub}</p>}
    </div>
  );
}
