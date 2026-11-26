'use client';

import { Download } from 'lucide-react';
import { useOnDemand } from '@/app/_components/useOnDemand';
import { toCsv } from '@/lib/csv';
import { downloadTextFile } from '@/lib/utils/csv';
import { getOwnerClassReport, getOwnerRetentionReport } from '@/lib/data/owner';
import { settle, type Loaded } from '@/lib/ownerReport';
import { attendanceByWeek, attendanceCsv, classFill, classFillCsv, waitlistCsv, waitlistDemand, type ClassReportRaw } from '@/lib/ownerClassReport';
import { retentionCsv, retentionRows, retentionTotals, type RetentionReportRaw } from '@/lib/ownerRetention';
import { READ_NEEDS_0176 } from '@/lib/followThrough';

// RO10: the owner's class and retention reports, each its own section with a CSV, for the gym picked above (null = every gym). In the order
// the review asked for: class fill against capacity, attendance by week, retention by join month, then waitlist demand. Read through
// owner-only functions (migration 0176); no member is named.

const card = 'rounded-[20px] border border-black/[.08] bg-card p-4 dark:border-white/10';
const shortDate = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const saveCsv = (filename: string, csv: { headers: string[]; rows: (string | number | null)[][] }) =>
  downloadTextFile(filename, toCsv(csv.headers, csv.rows), 'text/csv;charset=utf-8');
const pctText = (n: number | null) => (n === null ? '–' : `${n}%`);

function Heading({ title, hint, onCsv }: { title: string; hint?: string; onCsv?: () => void }) {
  return (
    <div className="mb-3 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h3 className="text-base font-extrabold text-black dark:text-zinc-50">{title}</h3>
        {hint && <p className="text-xs text-zinc-500">{hint}</p>}
      </div>
      {onCsv && (
        <button
          type="button"
          onClick={onCsv}
          className="inline-flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-xl border-[1.5px] border-black/20 px-3.5 text-[13px] font-bold text-black dark:border-white/25 dark:text-zinc-50"
        >
          <Download className="h-3.5 w-3.5" /> CSV
        </button>
      )}
    </div>
  );
}

function Problem({ title, message, onRetry }: { title: string; message: string; onRetry: () => void }) {
  return (
    <section className={card} role="alert">
      <h3 className="text-base font-extrabold text-black dark:text-zinc-50">{title}</h3>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">{message}</p>
      {message !== READ_NEEDS_0176 && (
        <button type="button" onClick={onRetry} className="mt-3 inline-flex h-11 items-center rounded-xl bg-accent px-4 text-sm font-extrabold text-accent-foreground">
          Try again
        </button>
      )}
    </section>
  );
}

function useReport<T>(load: () => Promise<Loaded<T>>, key: string) {
  const { data, reload } = useOnDemand(() => settle(load), key);
  return { answer: data, reload };
}

export function MoreReports({ gymId }: { gymId: string | null }) {
  const classes = useReport(() => getOwnerClassReport(gymId, 12), `classes|${gymId ?? 'all'}`);
  const retention = useReport(() => getOwnerRetentionReport(gymId, 12), `retention|${gymId ?? 'all'}`);

  return (
    <>
      {classes.answer == null ? (
        <section className={card}>
          <p className="text-sm text-zinc-500">Loading class reports…</p>
        </section>
      ) : classes.answer.ok ? (
        <>
          <ClassFillSection raw={classes.answer.data} />
          <AttendanceSection raw={classes.answer.data} />
        </>
      ) : (
        <Problem title="Class reports" message={classes.answer.error} onRetry={classes.reload} />
      )}

      {retention.answer == null ? (
        <section className={card}>
          <p className="text-sm text-zinc-500">Loading retention…</p>
        </section>
      ) : retention.answer.ok ? (
        <RetentionSection raw={retention.answer.data} />
      ) : (
        <Problem title="Retention by join month" message={retention.answer.error} onRetry={retention.reload} />
      )}

      {classes.answer?.ok && <WaitlistSection raw={classes.answer.data} />}
    </>
  );
}

export function ClassFillSection({ raw }: { raw: ClassReportRaw }) {
  const fill = classFill(raw, 28);
  return (
    <section className={card}>
      <Heading
        title="Class fill against capacity"
        hint={`Places taken out of places offered (capacity × sessions that ran), ${shortDate(fill.from)} to ${shortDate(fill.to)}. Cancelled dates don't count.`}
        onCsv={fill.rows.length > 0 ? () => saveCsv('class-fill.csv', classFillCsv(fill)) : undefined}
      />
      {fill.rows.length === 0 ? (
        <p className="text-sm text-zinc-500">No sessions ran in the last 28 days.</p>
      ) : (
        <>
          <p className="mb-3 text-sm text-zinc-600 dark:text-zinc-300">
            Overall <b className="text-black dark:text-zinc-50">{pctText(fill.totals.fillPct)}</b> full: {fill.totals.taken} of {fill.totals.places} places over{' '}
            {fill.totals.sessions} session{fill.totals.sessions === 1 ? '' : 's'}.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[26rem] text-left text-sm">
              <thead>
                <tr className="text-[11px] uppercase tracking-wide text-zinc-500">
                  <th className="py-1.5 pr-2 font-bold">Class</th>
                  <th className="px-2 py-1.5 text-right font-bold">Sessions</th>
                  <th className="px-2 py-1.5 text-right font-bold">Places taken</th>
                  <th className="px-2 py-1.5 text-right font-bold">Full</th>
                  <th className="py-1.5 pl-2 text-right font-bold">Came</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/[.05] dark:divide-white/10">
                {fill.rows.map((r) => (
                  <tr key={r.slot}>
                    <td className="max-w-[14rem] py-2 pr-2 font-semibold text-black dark:text-zinc-50">
                      <span className="block truncate">{r.slot}</span>
                    </td>
                    <td className="px-2 py-2 text-right">{r.sessions}</td>
                    <td className="px-2 py-2 text-right">
                      {r.taken} of {r.places}
                    </td>
                    <td className={`px-2 py-2 text-right font-semibold ${r.fillPct >= 90 ? 'text-accent' : r.fillPct < 40 ? 'text-warning' : ''}`}>{r.fillPct}%</td>
                    <td className="py-2 pl-2 text-right" title={r.marked > 0 ? `${r.attended} of ${r.marked} marked` : 'None marked yet'}>
                      {pctText(r.camePct)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-[11px] text-zinc-400">&ldquo;Came&rdquo; is out of the bookings a coach marked attended or no-show.</p>
        </>
      )}
    </section>
  );
}

export function AttendanceSection({ raw }: { raw: ClassReportRaw }) {
  const weeks = attendanceByWeek(raw);
  const max = Math.max(1, ...weeks.map((w) => w.attended));
  return (
    <section className={card}>
      <Heading
        title="Attendance by week"
        hint={`Sessions that ran each week (to yesterday for this week), members who came, and how full the classes were. Last ${weeks.length} weeks.`}
        onCsv={() => saveCsv('attendance-by-week.csv', attendanceCsv(weeks))}
      />
      <div className="flex h-28 items-end gap-1" role="img" aria-label="Attended per week">
        {weeks.map((w) => (
          <div key={w.weekStart} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end" title={`Week of ${shortDate(w.weekStart)}: ${w.attended} attended`}>
            <div className="w-full rounded-t bg-accent/70" style={{ height: `${Math.max(w.attended > 0 ? 3 : 0, (w.attended / max) * 100)}%` }} />
          </div>
        ))}
      </div>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[28rem] text-left text-sm">
          <thead>
            <tr className="text-[11px] uppercase tracking-wide text-zinc-500">
              <th className="py-1.5 pr-2 font-bold">Week of</th>
              <th className="px-2 py-1.5 text-right font-bold">Sessions</th>
              <th className="px-2 py-1.5 text-right font-bold">Attended</th>
              <th className="px-2 py-1.5 text-right font-bold">Members</th>
              <th className="px-2 py-1.5 text-right font-bold">No-shows</th>
              <th className="py-1.5 pl-2 text-right font-bold">Full</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-black/[.05] dark:divide-white/10">
            {[...weeks].reverse().map((w) => (
              <tr key={w.weekStart}>
                <td className="py-2 pr-2 text-zinc-600 dark:text-zinc-300">
                  {shortDate(w.weekStart)}
                  {w.current ? ' (so far)' : ''}
                </td>
                <td className="px-2 py-2 text-right">{w.sessions}</td>
                <td className="px-2 py-2 text-right font-semibold">{w.attended}</td>
                <td className="px-2 py-2 text-right">{w.members}</td>
                <td className="px-2 py-2 text-right">{w.noShows}</td>
                <td className="py-2 pl-2 text-right">{pctText(w.fillPct)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {weeks.some((w) => w.unmarked > 0) && (
        <p className="mt-2 text-[11px] text-zinc-400">
          {weeks.reduce((n, w) => n + w.unmarked, 0)} past booking(s) in these weeks are not marked attended or no-show yet, so they are in neither column.
        </p>
      )}
    </section>
  );
}

export function RetentionSection({ raw }: { raw: RetentionReportRaw }) {
  const rows = retentionRows(raw.cohorts);
  const totals = retentionTotals(raw.cohorts);
  const cell = (pct: number | null, kept: number, eligible: number) =>
    eligible === 0 ? <span className="text-zinc-400">not yet</span> : <span title={`${Math.min(kept, eligible)} of ${eligible}`}>{pct}%</span>;
  return (
    <section className={card}>
      <Heading
        title="Retention by join month"
        hint="Members by the month they joined: how many started a plan, are on one now, and were on one 1, 3 and 6 months after joining. A share shows once the month's members have been with you that long."
        onCsv={totals.joined > 0 ? () => saveCsv('retention-by-join-month.csv', retentionCsv(raw.cohorts)) : undefined}
      />
      {totals.joined === 0 ? (
        <p className="text-sm text-zinc-500">Nobody joined in the last {raw.months} months.</p>
      ) : (
        <>
          <p className="mb-3 text-sm text-zinc-600 dark:text-zinc-300">
            {totals.joined} joined in the last {raw.months} months; <b className="text-black dark:text-zinc-50">{pctText(totals.nowPct)}</b> are on a plan now
            {totals.pct3 !== null ? `, ${totals.pct3}% were on one 3 months in` : ''}.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[28rem] text-left text-sm">
              <thead>
                <tr className="text-[11px] uppercase tracking-wide text-zinc-500">
                  <th className="py-1.5 pr-2 font-bold">Joined</th>
                  <th className="px-2 py-1.5 text-right font-bold">Members</th>
                  <th className="px-2 py-1.5 text-right font-bold">On a plan now</th>
                  <th className="px-2 py-1.5 text-right font-bold">1 month</th>
                  <th className="px-2 py-1.5 text-right font-bold">3 months</th>
                  <th className="py-1.5 pl-2 text-right font-bold">6 months</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/[.05] dark:divide-white/10">
                {rows.map((r) => (
                  <tr key={r.month}>
                    <td className="py-2 pr-2 text-zinc-600 dark:text-zinc-300">{r.label}</td>
                    <td className="px-2 py-2 text-right">{r.joined}</td>
                    <td className="px-2 py-2 text-right font-semibold">{r.joined === 0 ? '–' : `${r.onPlanNow} (${r.nowPct}%)`}</td>
                    <td className="px-2 py-2 text-right">{r.joined === 0 ? '–' : cell(r.pct1, r.kept1, r.eligible1)}</td>
                    <td className="px-2 py-2 text-right">{r.joined === 0 ? '–' : cell(r.pct3, r.kept3, r.eligible3)}</td>
                    <td className="py-2 pl-2 text-right">{r.joined === 0 ? '–' : cell(r.pct6, r.kept6, r.eligible6)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-[11px] text-zinc-400">A member who never started a plan counts as not kept. A deleted account is not counted.</p>
        </>
      )}
    </section>
  );
}

export function WaitlistSection({ raw }: { raw: ClassReportRaw }) {
  const rows = waitlistDemand(raw, 28);
  return (
    <section className={card}>
      <Heading
        title="Waitlist demand"
        hint="Classes members waited for in the last 28 days: who got a place when one came up and who didn't get in, and who is waiting for the next 14 days."
        onCsv={rows.length > 0 ? () => saveCsv('waitlist-demand.csv', waitlistCsv(rows)) : undefined}
      />
      {rows.length === 0 ? (
        <p className="text-sm text-zinc-500">No waitlists in the last 28 days or the next 14.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[26rem] text-left text-sm">
            <thead>
              <tr className="text-[11px] uppercase tracking-wide text-zinc-500">
                <th className="py-1.5 pr-2 font-bold">Class</th>
                <th className="px-2 py-1.5 text-right font-bold">Waited</th>
                <th className="px-2 py-1.5 text-right font-bold">Got a place</th>
                <th className="px-2 py-1.5 text-right font-bold">Didn&apos;t get in</th>
                <th className="py-1.5 pl-2 text-right font-bold">Waiting now</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/[.05] dark:divide-white/10">
              {rows.map((r) => (
                <tr key={r.slot}>
                  <td className="max-w-[14rem] py-2 pr-2 font-semibold text-black dark:text-zinc-50">
                    <span className="block truncate">{r.slot}</span>
                  </td>
                  <td className="px-2 py-2 text-right" title={`${r.sessionsWithWaitlist} session(s) with a waitlist`}>
                    {r.waited}
                  </td>
                  <td className="px-2 py-2 text-right">{r.gotPlace}</td>
                  <td className={`px-2 py-2 text-right ${r.missedOut > 0 ? 'font-semibold text-warning' : ''}`}>{r.missedOut}</td>
                  <td className="py-2 pl-2 text-right">{r.waitingNow}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
