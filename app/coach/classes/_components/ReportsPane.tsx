'use client';

import type { CoachReport } from '@/lib/data/types';

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

// Folded in from the old standalone reports/page.tsx. The anchor-link sidebar it used to
// have has no slot anymore (Classes' sidebar slot is now the dropdown switcher) -- replaced
// with an inline chip row using the same fragment links; native same-page anchor jump needs
// no JS.
export function ReportsPane({ report }: { report: CoachReport }) {
  function exportNoShows() {
    downloadCsv('no-shows.csv', [
      ['Client', 'Class', 'Date'],
      ...report.noShows.map((n) => [n.clientName, n.className, n.date]),
    ]);
  }

  function exportPopularity() {
    downloadCsv('class-popularity.csv', [
      ['Class', 'Bookings (30d)'],
      ...report.classPopularity.map((c) => [c.className, c.bookingCount]),
    ]);
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-2">
        <a href="#attendance" className="rounded-full bg-black/[.04] px-3 py-1.5 text-sm font-medium dark:bg-white/[.06]">
          Attendance
        </a>
        <a href="#no-shows" className="rounded-full bg-black/[.04] px-3 py-1.5 text-sm font-medium dark:bg-white/[.06]">
          No-shows
        </a>
        <a href="#popularity" className="rounded-full bg-black/[.04] px-3 py-1.5 text-sm font-medium dark:bg-white/[.06]">
          Class popularity
        </a>
      </div>

      <p className="mb-4 text-sm text-zinc-500">Last 30 days, across all your classes.</p>

      <div id="attendance" className="grid grid-cols-3 gap-2.5">
        <div className="rounded-2xl border border-black/[.05] p-3.5 dark:border-white/10">
          <p className="text-sm text-zinc-500">Attendance rate (30d)</p>
          <p className="mt-1 text-2xl font-extrabold text-black dark:text-zinc-50">
            {report.attendanceRate == null ? '—' : `${report.attendanceRate}%`}
          </p>
        </div>
        <div className="rounded-2xl border border-black/[.05] p-3.5 dark:border-white/10">
          <p className="text-sm text-zinc-500">Booked</p>
          <p className="mt-1 text-2xl font-extrabold text-black dark:text-zinc-50">{report.totalBooked}</p>
        </div>
        <div className="rounded-2xl border border-black/[.05] p-3.5 dark:border-white/10">
          <p className="text-sm text-zinc-500">Attended</p>
          <p className="mt-1 text-2xl font-extrabold text-black dark:text-zinc-50">{report.totalAttended}</p>
        </div>
      </div>

      <div id="no-shows" className="mt-4 rounded-2xl border border-black/[.05] p-4 dark:border-white/10">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">No-shows</h2>
          {report.noShows.length > 0 && (
            <button type="button" onClick={exportNoShows} className="text-xs font-medium text-accent hover:underline">
              Export CSV
            </button>
          )}
        </div>
        <ul className="mt-2 divide-y divide-black/5 text-sm dark:divide-white/5">
          {report.noShows.map((n, i) => (
            <li key={i} className="flex items-center justify-between py-2">
              <span>{n.clientName}</span>
              <span className="text-zinc-500">
                {n.className} · {n.date}
              </span>
            </li>
          ))}
          {report.noShows.length === 0 && (
            <li className="py-2 text-zinc-500">No no-shows in the last 30 days — everyone who booked turned up.</li>
          )}
        </ul>
      </div>

      <div id="popularity" className="mt-4 rounded-2xl border border-black/[.05] p-4 dark:border-white/10">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Class popularity</h2>
          {report.classPopularity.length > 0 && (
            <button type="button" onClick={exportPopularity} className="text-xs font-medium text-accent hover:underline">
              Export CSV
            </button>
          )}
        </div>
        <ul className="mt-2 divide-y divide-black/5 text-sm dark:divide-white/5">
          {report.classPopularity.map((c) => (
            <li key={c.className} className="flex items-center justify-between py-2">
              <span>{c.className}</span>
              <span className="text-zinc-500">{c.bookingCount} bookings</span>
            </li>
          ))}
          {report.classPopularity.length === 0 && (
            <li className="py-2 text-zinc-500">No bookings in the last 30 days yet.</li>
          )}
        </ul>
      </div>
    </div>
  );
}
