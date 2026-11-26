'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useSlidingThumb } from '@/app/_components/motion/useSlidingThumb';
import { CoachStatStrip } from '../../_components/CoachUi';
import Link from 'next/link';
import { getCoachReports } from '@/lib/data/reports';
import { fillPercent } from '@/lib/slotPopularity';
import type { CoachReport } from '@/lib/data/types';
import { handleTabListKeys } from '@/app/_components/tabKeys';
import { toCsv, downloadTextFile } from '@/lib/utils/csv';
import { useActiveGymId } from '@/app/coach/_components/CoachGymsContext';
import { PeakWeekScoresCard } from './PeakWeekScoresCard';

function downloadCsv(filename: string, rows: (string | number)[][]) {
  const [headers, ...body] = rows;
  downloadTextFile(filename, toCsv(headers as string[], body), 'text/csv;charset=utf-8;');
}

type Section = 'Overview' | 'No-shows' | 'Busiest';
const SECTIONS: Section[] = ['Overview', 'No-shows', 'Busiest'];

// What each section is called in a link (?tab=reports&section=...), so the dashboard can open the one it is about (UX3).
// Red flags has its own Classes tab since D12 (ClassesHubShell reads ?section=red-flags).
const SECTION_PARAM: Record<string, Section> = { overview: 'Overview', 'no-shows': 'No-shows', busiest: 'Busiest' };
export const reportSectionFromParam = (value: string | null): Section | undefined => (value ? SECTION_PARAM[value] : undefined);
const RANGES = [7, 30, 90] as const;

const cardCls = 'rounded-[20px] border border-black/[.08] bg-card dark:border-white/10';
// The board's segmented control: white on a grey track.
const segTrack = 'relative flex max-w-full gap-1 overflow-x-auto rounded-xl bg-black/[.06] p-1 [scrollbar-width:none] dark:bg-white/10 [&::-webkit-scrollbar]:hidden';
const segBtn = (on: boolean) =>
  `relative min-h-9 shrink-0 whitespace-nowrap rounded-lg px-3.5 text-sm font-bold transition-colors ${on ? 'bg-card text-black shadow-sm dark:text-zinc-50' : 'text-zinc-600 hover:text-black dark:text-zinc-300'}`;

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

// Classes and attendance across the gym, for a chosen
// period (7, 30 or 90 days) and compare it with the period before. `onOpenAttendance` jumps to the Attendance tab,
// where sessions get marked. Overview also holds the Peak Week score downloads (BO9).
export function ReportsPane({
  report: initialReport,
  onOpenAttendance,
  initialSection = 'Overview',
}: {
  report: CoachReport;
  onOpenAttendance?: () => void;
  initialSection?: Section;
}) {
  const [section, setSection] = useState<Section>(initialSection);
  const [days, setDays] = useState<(typeof RANGES)[number]>(30);
  const [current, setCurrent] = useState<CoachReport>(initialReport);
  const [previous, setPrevious] = useState<CoachReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAllSlots, setShowAllSlots] = useState(false);
  const [slotOrder, setSlotOrder] = useState<'busiest' | 'quietest'>('busiest');
  // The gym chosen in the header: a switch there loads that gym's figures again (getCoachReports reads the active gym).
  const gymId = useActiveGymId();
  // The switches' white highlights slide to the option picked (GSAP). The order switch only shows on one section, so it is placed again
  // when the section changes.
  const sectionTrack = useRef<HTMLDivElement>(null);
  const periodTrack = useRef<HTMLDivElement>(null);
  const orderTrack = useRef<HTMLDivElement>(null);
  useSlidingThumb(sectionTrack, section);
  useSlidingThumb(periodTrack, days);
  useSlidingThumb(orderTrack, `${section}|${slotOrder}`);

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
  }, [days, gymId]);

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

  // Ordered by how full each slot gets, not by raw bookings, so a big class doesn't always beat a small one (CS15).
  const slots = useMemo(() => {
    const byFill = (a: CoachReport['classPopularity'][number], b: CoachReport['classPopularity'][number]) => fillPercent(a) - fillPercent(b) || a.bookingCount - b.bookingCount;
    const sorted = [...report.classPopularity].sort((a, b) => (slotOrder === 'busiest' ? byFill(b, a) : byFill(a, b)));
    return showAllSlots ? sorted : sorted.slice(0, 10);
  }, [report.classPopularity, slotOrder, showAllSlots]);

  function exportNoShows() {
    downloadCsv('no-shows.csv', [
      ['Client', 'Class', 'Date'],
      ...report.noShows.map((n) => [n.clientName, n.className, n.date]),
    ]);
  }

  function exportPopularity() {
    downloadCsv('class-popularity.csv', [
      ['Session', `Sessions run (${days}d)`, 'Places', 'Booked', 'Fill %', 'Marked', 'Attended'],
      ...report.classPopularity.map((c) => [c.className, c.sessions, c.places, c.bookingCount, fillPercent(c), c.marked, c.attended]),
    ]);
  }

  const unmarkedText =
    report.unmarked === 1
      ? "1 past booking hasn't been marked attended or no-show, so it isn't counted in the attendance rate yet."
      : `${report.unmarked} past bookings haven't been marked attended or no-show, so they aren't counted in the attendance rate yet.`;

  return (
    <div className="space-y-4">
      <div
        role="tablist"
        aria-label="Reports"
        onKeyDown={handleTabListKeys}
        ref={sectionTrack}
        className={`${segTrack} w-max`}
      >
        <span data-thumb-el aria-hidden className="pointer-events-none absolute left-0 top-0 rounded-lg bg-card shadow-sm" />
        {SECTIONS.map((sec) => (
          <button
            key={sec}
            type="button"
            role="tab"
            aria-selected={section === sec}
            tabIndex={section === sec ? 0 : -1}
            data-active={section === sec}
            onClick={() => setSection(sec)}
            className={segBtn(section === sec)}
          >
            {sec}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div ref={periodTrack} role="group" aria-label="Period" className={segTrack}>
          <span data-thumb-el aria-hidden className="pointer-events-none absolute left-0 top-0 rounded-lg bg-card shadow-sm" />
          {RANGES.map((r) => (
            <button
              key={r}
              type="button"
              aria-pressed={days === r}
              data-active={days === r}
              onClick={() => setDays(r)}
              className={segBtn(days === r)}
            >
              Last {r} days
            </button>
          ))}
        </div>
        <p className="text-sm text-zinc-500">{loading ? 'Updating…' : rangeLabel}</p>
      </div>

      {section === 'Overview' && (
        <>
          <CoachStatStrip
            label="This period at a glance"
            stats={[
              {
                label: 'Attendance rate',
                value: report.attendanceRate == null ? '—' : `${report.attendanceRate}%`,
                sub: (
                  <>
                    of sessions you&apos;ve marked
                    <Delta now={report.attendanceRate} before={previous?.attendanceRate ?? null} unit=" pts" />
                  </>
                ),
              },
              {
                label: 'Booked',
                value: report.totalBooked,
                sub: previous ? <Delta now={report.totalBooked} before={previous.totalBooked} /> : undefined,
              },
              {
                label: 'Attended',
                value: report.totalAttended,
                tone: 'teal',
                sub: previous ? <Delta now={report.totalAttended} before={previous.totalAttended} /> : undefined,
              },
              {
                label: 'No-show rate',
                value: report.noShowRate == null ? '—' : `${report.noShowRate}%`,
                sub: (
                  <>
                    of sessions you&apos;ve marked
                    <Delta now={report.noShowRate} before={previous?.noShowRate ?? null} unit=" pts" goodWhen="down" />
                  </>
                ),
              },
            ]}
          />
          {previous && <p className="text-xs text-zinc-500">Changes are against the {days} days before.</p>}

          {report.unmarked > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-[20px] border border-amber-500/30 bg-amber-50 px-5 py-4 dark:bg-amber-500/10">
              <p className="text-sm text-zinc-700 dark:text-zinc-300">{unmarkedText}</p>
              {onOpenAttendance && (
                <button type="button" onClick={onOpenAttendance} className="flex h-11 shrink-0 items-center rounded-xl bg-[#1d1d1b] px-4 text-sm font-bold text-white dark:bg-zinc-100 dark:text-[#1d1d1b]">
                  Mark attendance
                </button>
              )}
            </div>
          )}

          <div className={`${cardCls} px-5 py-4 sm:px-6`}>
            <h2 className="text-lg font-extrabold text-black dark:text-zinc-50">Right now</h2>
            <p className="mt-1 text-sm text-zinc-500">
              {report.activeBookings} upcoming {report.activeBookings === 1 ? 'booking' : 'bookings'}
              {report.avgClassesPerClient != null ? ` · ${report.avgClassesPerClient} classes per member on average` : ''}
            </p>
          </div>

          <PeakWeekScoresCard />
        </>
      )}

      {section === 'No-shows' && (
        <div className={`${cardCls} px-5 py-4 sm:px-6`}>
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-lg font-extrabold text-black dark:text-zinc-50">
              No-shows{report.noShowRate != null ? ` · ${report.noShowRate}% of marked sessions` : ''}
            </h2>
            {report.noShows.length > 0 && (
              <button type="button" onClick={exportNoShows} className="flex h-11 items-center rounded-xl border-[1.5px] border-black/20 px-4 text-sm font-bold text-black dark:border-white/25 dark:text-zinc-50">
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
        <div className={`${cardCls} px-5 py-4 sm:px-6`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div ref={orderTrack} role="group" aria-label="Order" className={segTrack}>
              <span data-thumb-el aria-hidden className="pointer-events-none absolute left-0 top-0 rounded-lg bg-card shadow-sm" />
              {(['busiest', 'quietest'] as const).map((o) => (
                <button
                  key={o}
                  type="button"
                  aria-pressed={slotOrder === o}
                  data-active={slotOrder === o}
                  onClick={() => setSlotOrder(o)}
                  className={`${segBtn(slotOrder === o)} capitalize`}
                >
                  {o}
                </button>
              ))}
            </div>
            {report.classPopularity.length > 0 && (
              <button type="button" onClick={exportPopularity} className="flex h-11 items-center rounded-xl border-[1.5px] border-black/20 px-4 text-sm font-bold text-black dark:border-white/25 dark:text-zinc-50">
                Export CSV
              </button>
            )}
          </div>
          <p className="mt-2 text-xs text-zinc-500">How full each session gets: places booked out of places offered, over the sessions that have happened (up to yesterday). Upcoming bookings aren&apos;t counted.</p>
          <ul className="mt-3 space-y-3 text-sm">
            {slots.map((c) => {
              const fill = fillPercent(c);
              // Out of the bookings the coach has marked, as Overview counts it (CS28): an unmarked booking isn't a no-show.
              const rate = c.marked > 0 ? Math.round((c.attended / c.marked) * 100) : null;
              return (
                <li key={c.className}>
                  <p className="text-[15px] font-bold text-black dark:text-zinc-50">{c.className}</p>
                  <p className="text-xs text-zinc-500">
                    <span className="font-bold text-black dark:text-zinc-50">{fill}% full</span>
                    {` · ${c.bookingCount} of ${c.places} places over ${c.sessions} session${c.sessions === 1 ? '' : 's'}`}
                    {rate != null && ` · ${rate}% came`}
                  </p>
                  <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-black/10 dark:bg-white/15">
                    <div className="h-full rounded-full bg-accent" style={{ width: `${Math.min(100, fill)}%` }} />
                  </div>
                </li>
              );
            })}
            {report.classPopularity.length === 0 && <li className="text-zinc-500">No sessions in the last {days} days yet.</li>}
          </ul>
          {report.classPopularity.length > 10 && (
            <button type="button" onClick={() => setShowAllSlots((v) => !v)} className="mt-3 min-h-11 text-sm font-bold text-accent">
              {showAllSlots ? 'Show fewer' : `Show all ${report.classPopularity.length}`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
