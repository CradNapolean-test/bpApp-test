import type { CoachReport } from '@/lib/data/types';

// Folded in from the old standalone reports/page.tsx. The anchor-link sidebar it used to
// have has no slot anymore (Classes' sidebar slot is now the dropdown switcher) -- replaced
// with an inline chip row using the same fragment links; native same-page anchor jump needs
// no JS.
export function ReportsPane({ report }: { report: CoachReport }) {
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

      <div id="attendance" className="grid grid-cols-2 gap-2.5">
        <div className="rounded-2xl border border-black/[.05] p-3.5 text-center dark:border-white/10">
          <p className="text-xl font-extrabold text-black dark:text-zinc-50">
            {report.attendanceRate == null ? '—' : `${report.attendanceRate}%`}
          </p>
          <p className="mt-0.5 text-[11px] font-medium text-zinc-500">attendance rate</p>
        </div>
        <div className="rounded-2xl border border-black/[.05] p-3.5 text-center dark:border-white/10">
          <p className="text-xl font-extrabold text-black dark:text-zinc-50">{report.totalBooked}</p>
          <p className="mt-0.5 text-[11px] font-medium text-zinc-500">total booked</p>
        </div>
        <div className="rounded-2xl border border-black/[.05] p-3.5 text-center dark:border-white/10">
          <p className="text-xl font-extrabold text-danger">{report.noShows.length}</p>
          <p className="mt-0.5 text-[11px] font-medium text-zinc-500">no-shows</p>
        </div>
        <div className="rounded-2xl border border-black/[.05] p-3.5 text-center dark:border-white/10">
          <p className="truncate text-xl font-extrabold text-black dark:text-zinc-50">
            {report.classPopularity[0]?.className ?? '—'}
          </p>
          <p className="mt-0.5 text-[11px] font-medium text-zinc-500">most popular</p>
        </div>
      </div>

      <div id="no-shows" className="mt-4 rounded-2xl border border-black/[.05] p-4 dark:border-white/10">
        <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">No-shows</h2>
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
        <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Class popularity</h2>
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
