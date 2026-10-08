'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { getCoachReports } from '@/lib/data/reports';
import type { CoachReport } from '@/lib/data/types';
import { RedFlagsView } from './RedFlagsView';

// Quotes any field containing a comma/quote/newline, doubling internal quotes -- minimal
// correct CSV escaping, not a full RFC 4180 library for two simple flat tables.
function csvCell(value: string | number): string {
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function downloadCsv(filename: string, rows: (string | number)[][]) {
  const csv = rows.map((row) => row.map(csvCell).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

type Section = 'Red flags' | 'Overview' | 'No-shows' | 'Busiest';
const SECTIONS: Section[] = ['Red flags', 'Overview', 'No-shows', 'Busiest'];
const RANGES = [7, 30, 90] as const;

const cardCls = 'rounded-2xl border border-black/[.05] bg-card dark:border-white/10';

const shortDate = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });

// "+4" / "-2" against the period before; nothing when there is nothing to compare with.
function Delta({ now, before, unit = '', goodWhen = 'up' }: { now: number | null; before: number | null; unit?: string; goodWhen?: 'up' | 'down' }) {
  if (now == null || before == null || now === before) return null;
  const diff = now - before;
  const good = (diff > 0) === (goodWhen === 'up');
  return (
    <span className={`ml-1.5 text-xs font-bold ${good ? 'text-success' : 'text-danger'}`}>
      {diff > 0 ? '+' : ''}
      {diff}
      {unit}
    </span>
  );
}

// Classes and attendance across the gym. The first view is the weekly Red Flag list; the others look at a chosen
// period (7, 30 or 90 days) and compare it with the period before. `onOpenAttendance` jumps to the Attendance tab,
// where sessions get marked.
export function ReportsPane({ report: initialReport, onOpenAttendance }: { report: CoachReport; onOpenAttendance?: () => void }) {
  const [section, setSection] = useState<Section>('Red flags');
  const [days, setDays] = useState<(typeof RANGES)[number]>(30);
  const [current, setCurrent] = useState<CoachReport>(initialReport);
  const [previous, setPrevious] = useState<CoachReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAllSlots, setShowAllSlots] = useState(false);
  const [slotOrder, setSlotOrder] = useState<'busiest' | 'quietest'>('busiest');

  // Loads the chosen period and the one before it. The first 30 days arrive with the page; this runs on first view
  // too so the comparison is there.
  useEffect(() => {
    let live = true;
    Promise.resolve().then(() => {
      if (live) setLoading(true);
    });
    getCoachReports(days)
      .then((r) => {
        if (!live) return;
        setCurrent(r.current);
        setPrevious(r.previous);
        setLoading(false);
      })
      .catch(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [days]);

  const report = current;
  const rangeLabel = `Last ${days} days, across all classes`;

  // Who has no-showed, most often first, with the dates.
  const noShowByMember = useMemo(() => {
    const map = new Map<string, { clientId: string; name: string; items: { date: string; className: string }[] }>();
    for (const n of report.noShows) {
      const cur = map.get(n.clientId) ?? { clientId: n.clientId, name: n.clientName, items: [] };
      cur.items.push({ date: n.date, className: n.className });
      map.set(n.clientId, cur);
    }
    return [...map.values()]
      .map((m) => ({ ...m, items: m.items.sort((a, b) => (a.date < b.date ? 1 : -1)) }))
      .sort((a, b) => b.items.length - a.items.length || a.name.localeCompare(b.name));
  }, [report.noShows]);

  const slots = useMemo(() => {
    const sorted = [...report.classPopularity].sort((a, b) => (slotOrder === 'busiest' ? b.bookingCount - a.bookingCount : a.bookingCount - b.bookingCount));
    return showAllSlots ? sorted : sorted.slice(0, 10);
  }, [report.classPopularity, slotOrder, showAllSlots]);
  const maxBookings = Math.max(1, ...report.classPopularity.map((c) => c.bookingCount));

  function exportNoShows() {
    downloadCsv('no-shows.csv', [
      ['Client', 'Class', 'Date'],
      ...report.noShows.map((n) => [n.clientName, n.className, n.date]),
    ]);
  }

  function exportPopularity() {
    downloadCsv('class-popularity.csv', [
      ['Session', `Bookings (${days}d)`, 'Marked attended'],
      ...report.classPopularity.map((c) => [c.className, c.bookingCount, c.attended]),
    ]);
  }

  const unmarkedText =
    report.unmarked === 1
      ? "1 past booking hasn't been marked attended or no-show, so it isn't counted in the attendance rate yet."
      : `${report.unmarked} past bookings haven't been marked attended or no-show, so they aren't counted in the attendance rate yet.`;

  return (
    <div className="space-y-4">
      <div className="flex w-full gap-1 overflow-x-auto rounded-full border border-black/10 p-1 [scrollbar-width:none] dark:border-white/10 [&::-webkit-scrollbar]:hidden">
        {SECTIONS.map((sec) => (
          <button
            key={sec}
            type="button"
            onClick={() => setSection(sec)}
            className={`shrink-0 rounded-full px-4 py-2 text-sm font-bold ${section === sec ? 'bg-accent text-accent-foreground' : 'text-zinc-500'}`}
          >
            {sec}
          </button>
        ))}
      </div>

      {section === 'Red flags' && <RedFlagsView onOpenAttendance={onOpenAttendance} />}

      {section !== 'Red flags' && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex gap-1.5">
            {RANGES.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setDays(r)}
                className={`rounded-full px-3.5 py-1.5 text-xs font-bold ${
                  days === r ? 'bg-accent text-accent-foreground' : 'border border-black/10 text-zinc-600 dark:border-white/15 dark:text-zinc-300'
                }`}
              >
                {r} days
              </button>
            ))}
          </div>
          <p className="text-xs text-zinc-500">{loading ? 'Updating…' : rangeLabel}</p>
        </div>
      )}

      {section === 'Overview' && (
        <>
          <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
            <div className={`${cardCls} p-3.5`}>
              <p className="text-sm text-zinc-500">Attendance rate</p>
              <p className="mt-1 text-2xl font-extrabold text-black dark:text-zinc-50">
                {report.attendanceRate == null ? '—' : `${report.attendanceRate}%`}
                <Delta now={report.attendanceRate} before={previous?.attendanceRate ?? null} unit=" pts" />
              </p>
              <p className="mt-0.5 text-xs text-zinc-500">of sessions you&apos;ve marked</p>
            </div>
            <div className={`${cardCls} p-3.5`}>
              <p className="text-sm text-zinc-500">Booked</p>
              <p className="mt-1 text-2xl font-extrabold text-black dark:text-zinc-50">
                {report.totalBooked}
                <Delta now={report.totalBooked} before={previous?.totalBooked ?? null} />
              </p>
            </div>
            <div className={`${cardCls} p-3.5`}>
              <p className="text-sm text-zinc-500">Attended</p>
              <p className="mt-1 text-2xl font-extrabold text-black dark:text-zinc-50">
                {report.totalAttended}
                <Delta now={report.totalAttended} before={previous?.totalAttended ?? null} />
              </p>
            </div>
            <div className={`${cardCls} p-3.5`}>
              <p className="text-sm text-zinc-500">No-show rate</p>
              <p className="mt-1 text-2xl font-extrabold text-black dark:text-zinc-50">
                {report.noShowRate == null ? '—' : `${report.noShowRate}%`}
                <Delta now={report.noShowRate} before={previous?.noShowRate ?? null} unit=" pts" goodWhen="down" />
              </p>
              <p className="mt-0.5 text-xs text-zinc-500">of sessions you&apos;ve marked</p>
            </div>
          </div>
          {previous && <p className="text-xs text-zinc-500">Changes are against the {days} days before.</p>}

          {report.unmarked > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-warning/30 bg-warning/10 p-3.5">
              <p className="text-sm text-zinc-700 dark:text-zinc-300">{unmarkedText}</p>
              {onOpenAttendance && (
                <button type="button" onClick={onOpenAttendance} className="shrink-0 rounded-full bg-accent px-4 py-2 text-sm font-bold text-accent-foreground">
                  Mark attendance
                </button>
              )}
            </div>
          )}

          <div className={`${cardCls} p-4`}>
            <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Right now</h2>
            <p className="mt-1 text-sm text-zinc-500">
              {report.activeBookings} upcoming {report.activeBookings === 1 ? 'booking' : 'bookings'}
              {report.avgClassesPerClient != null ? ` · ${report.avgClassesPerClient} classes per client on average` : ''}
            </p>
          </div>
        </>
      )}

      {section === 'No-shows' && (
        <div className={`${cardCls} p-4`}>
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
              No-shows{report.noShowRate != null ? ` · ${report.noShowRate}% of marked sessions` : ''}
            </h2>
            {report.noShows.length > 0 && (
              <button type="button" onClick={exportNoShows} className="rounded-full border border-black/10 px-3 py-1.5 text-xs font-bold text-accent dark:border-white/15">
                Export CSV
              </button>
            )}
          </div>
          <ul className="mt-2 divide-y divide-black/5 text-sm dark:divide-white/5">
            {noShowByMember.map((m) => (
              <li key={m.clientId} className="py-3">
                <div className="flex items-center justify-between gap-3">
                  <Link href={`/coach/clients/${m.clientId}`} className="min-w-0 truncate font-bold text-black hover:underline dark:text-zinc-50">
                    {m.name}
                  </Link>
                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${m.items.length >= 2 ? 'bg-danger/15 text-danger' : 'bg-black/5 text-zinc-600 dark:bg-white/10 dark:text-zinc-300'}`}>
                    {m.items.length} no-show{m.items.length === 1 ? '' : 's'}
                  </span>
                </div>
                <p className="mt-1 text-xs text-zinc-500">
                  {m.items
                    .slice(0, 4)
                    .map((i) => `${shortDate(i.date)}, ${i.className}`)
                    .join(' · ')}
                  {m.items.length > 4 ? ` · and ${m.items.length - 4} more` : ''}
                </p>
              </li>
            ))}
            {report.noShows.length === 0 && (
              <li className="py-2 text-zinc-500">
                {report.unmarked > 0
                  ? 'No no-shows marked yet — mark attendance to see them here.'
                  : `No no-shows in the last ${days} days — everyone who booked turned up.`}
              </li>
            )}
          </ul>
        </div>
      )}

      {section === 'Busiest' && (
        <div className={`${cardCls} p-4`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex gap-1.5">
              {(['busiest', 'quietest'] as const).map((o) => (
                <button
                  key={o}
                  type="button"
                  onClick={() => setSlotOrder(o)}
                  className={`rounded-full px-3 py-1.5 text-xs font-bold capitalize ${
                    slotOrder === o ? 'bg-accent text-accent-foreground' : 'border border-black/10 text-zinc-600 dark:border-white/15 dark:text-zinc-300'
                  }`}
                >
                  {o}
                </button>
              ))}
            </div>
            {report.classPopularity.length > 0 && (
              <button type="button" onClick={exportPopularity} className="rounded-full border border-black/10 px-3 py-1.5 text-xs font-bold text-accent dark:border-white/15">
                Export CSV
              </button>
            )}
          </div>
          <ul className="mt-3 space-y-3 text-sm">
            {slots.map((c) => {
              const rate = c.bookingCount > 0 ? Math.round((c.attended / c.bookingCount) * 100) : 0;
              return (
                <li key={c.className}>
                  <p className="font-semibold text-black dark:text-zinc-50">{c.className}</p>
                  <p className="text-xs text-zinc-500">
                    {c.bookingCount} booking{c.bookingCount === 1 ? '' : 's'}
                    {c.attended > 0 && ` · ${rate}% came`}
                  </p>
                  <div className="mt-1 h-[6px] overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
                    <div className="h-full rounded-full bg-accent" style={{ width: `${(c.bookingCount / maxBookings) * 100}%` }} />
                  </div>
                </li>
              );
            })}
            {report.classPopularity.length === 0 && <li className="text-zinc-500">No bookings in the last {days} days yet.</li>}
          </ul>
          {report.classPopularity.length > 10 && (
            <button type="button" onClick={() => setShowAllSlots((v) => !v)} className="mt-3 rounded-full border border-black/10 px-4 py-1.5 text-sm font-semibold text-accent dark:border-white/15">
              {showAllSlots ? 'Show fewer' : `Show all ${report.classPopularity.length}`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
