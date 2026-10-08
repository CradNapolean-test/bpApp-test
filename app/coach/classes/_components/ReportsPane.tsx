'use client';

import { useState } from 'react';
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

type Section = 'Red flags' | 'Overview' | 'No-shows' | 'Busiest sessions';
const SECTIONS: Section[] = ['Red flags', 'Overview', 'No-shows', 'Busiest sessions'];

const cardCls = 'rounded-2xl border border-black/[.05] bg-card dark:border-white/10';

// Last 30 days across the gym's classes. The three sections are real views (one at a time), not
// page anchors. `onOpenAttendance` jumps to the Attendance tab, where sessions get marked.
export function ReportsPane({ report, onOpenAttendance }: { report: CoachReport; onOpenAttendance?: () => void }) {
  const [section, setSection] = useState<Section>('Red flags');

  function exportNoShows() {
    downloadCsv('no-shows.csv', [
      ['Client', 'Class', 'Date'],
      ...report.noShows.map((n) => [n.clientName, n.className, n.date]),
    ]);
  }

  function exportPopularity() {
    downloadCsv('class-popularity.csv', [
      ['Session', 'Bookings (30d)'],
      ...report.classPopularity.map((c) => [c.className, c.bookingCount]),
    ]);
  }

  const unmarkedText =
    report.unmarked === 1
      ? "1 past booking hasn't been marked attended or no-show, so it isn't counted in the attendance rate yet."
      : `${report.unmarked} past bookings haven't been marked attended or no-show, so they aren't counted in the attendance rate yet.`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex w-max max-w-full gap-1 overflow-x-auto rounded-full border border-black/10 p-0.5 dark:border-white/10">
          {SECTIONS.map((sec) => (
            <button
              key={sec}
              type="button"
              onClick={() => setSection(sec)}
              className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-bold ${
                section === sec ? 'bg-accent text-accent-foreground' : 'text-zinc-500'
              }`}
            >
              {sec}
            </button>
          ))}
        </div>
        {section !== 'Red flags' && <p className="text-xs text-zinc-500">Last 30 days, across all classes</p>}
      </div>

      {section === 'Red flags' && <RedFlagsView onOpenAttendance={onOpenAttendance} />}

      {section === 'Overview' && (
        <>
          <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
            <div className={`${cardCls} p-3.5`}>
              <p className="text-sm text-zinc-500">Attendance rate</p>
              <p className="mt-1 text-2xl font-extrabold text-black dark:text-zinc-50">
                {report.attendanceRate == null ? '—' : `${report.attendanceRate}%`}
              </p>
              <p className="mt-0.5 text-xs text-zinc-500">of sessions you&apos;ve marked</p>
            </div>
            <div className={`${cardCls} p-3.5`}>
              <p className="text-sm text-zinc-500">Booked</p>
              <p className="mt-1 text-2xl font-extrabold text-black dark:text-zinc-50">{report.totalBooked}</p>
            </div>
            <div className={`${cardCls} p-3.5`}>
              <p className="text-sm text-zinc-500">Attended</p>
              <p className="mt-1 text-2xl font-extrabold text-black dark:text-zinc-50">{report.totalAttended}</p>
            </div>
            <div className={`${cardCls} p-3.5`}>
              <p className="text-sm text-zinc-500">Not marked yet</p>
              <p className={`mt-1 text-2xl font-extrabold ${report.unmarked > 0 ? 'text-warning' : 'text-black dark:text-zinc-50'}`}>
                {report.unmarked}
              </p>
            </div>
          </div>

          {report.unmarked > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-warning/30 bg-warning/10 p-3.5">
              <p className="text-sm text-zinc-700 dark:text-zinc-300">{unmarkedText}</p>
              {onOpenAttendance && (
                <button
                  type="button"
                  onClick={onOpenAttendance}
                  className="shrink-0 rounded-full bg-accent px-4 py-1.5 text-sm font-bold text-accent-foreground"
                >
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
              <button type="button" onClick={exportNoShows} className="text-xs font-medium text-accent hover:underline">
                Export CSV
              </button>
            )}
          </div>
          <ul className="mt-2 divide-y divide-black/5 text-sm dark:divide-white/5">
            {report.noShows.map((n, i) => (
              <li key={i} className="flex items-center justify-between gap-3 py-2">
                <span>{n.clientName}</span>
                <span className="text-right text-zinc-500">
                  {n.className} · {n.date}
                </span>
              </li>
            ))}
            {report.noShows.length === 0 && (
              <li className="py-2 text-zinc-500">
                {report.unmarked > 0
                  ? 'No no-shows marked yet — mark attendance to see them here.'
                  : 'No no-shows in the last 30 days — everyone who booked turned up.'}
              </li>
            )}
          </ul>
        </div>
      )}

      {section === 'Busiest sessions' && (
        <div className={`${cardCls} p-4`}>
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Busiest sessions</h2>
            {report.classPopularity.length > 0 && (
              <button type="button" onClick={exportPopularity} className="text-xs font-medium text-accent hover:underline">
                Export CSV
              </button>
            )}
          </div>
          <ul className="mt-2 divide-y divide-black/5 text-sm dark:divide-white/5">
            {report.classPopularity.slice(0, 10).map((c) => (
              <li key={c.className} className="flex items-center justify-between gap-3 py-2">
                <span className="min-w-0 truncate">{c.className}</span>
                <span className="shrink-0 text-zinc-500">
                  {c.bookingCount} booking{c.bookingCount === 1 ? '' : 's'}
                </span>
              </li>
            ))}
            {report.classPopularity.length === 0 && <li className="py-2 text-zinc-500">No bookings in the last 30 days yet.</li>}
          </ul>
        </div>
      )}
    </div>
  );
}
