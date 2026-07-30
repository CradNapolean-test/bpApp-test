import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getCoachReport } from '@/lib/data/reports';
import { getCoachChatOverview } from '@/lib/data/chat';
import { AppShell } from '@/app/_components/AppShell';
import { CoachNav } from '@/app/coach/_components/CoachNav';

export default async function CoachReportsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();
  if (profile?.role !== 'coach') redirect('/dashboard');

  const [report, chatOverview] = await Promise.all([getCoachReport(), getCoachChatOverview()]);
  const unreadCount = chatOverview.reduce((sum, c) => sum + c.unread_count, 0);

  return (
    <AppShell
      title="Reports"
      subtitle="Last 30 days, across all your classes."
      topBar={<CoachNav unreadCount={unreadCount} />}
      sidebar={
        <nav className="space-y-1 text-sm">
          <a href="#attendance" className="block rounded-md px-3 py-1.5 text-zinc-500 hover:bg-black/5 hover:text-black dark:hover:bg-white/5 dark:hover:text-zinc-300">
            Attendance
          </a>
          <a href="#no-shows" className="block rounded-md px-3 py-1.5 text-zinc-500 hover:bg-black/5 hover:text-black dark:hover:bg-white/5 dark:hover:text-zinc-300">
            No-shows
          </a>
          <a href="#popularity" className="block rounded-md px-3 py-1.5 text-zinc-500 hover:bg-black/5 hover:text-black dark:hover:bg-white/5 dark:hover:text-zinc-300">
            Class popularity
          </a>
        </nav>
      }
    >
      <div id="attendance" className="rounded-lg border border-black/10 p-4 dark:border-white/10">
        <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Attendance</h2>
        {report.attendanceRate == null ? (
          <p className="mt-2 text-sm text-zinc-500">No completed bookings in this window yet.</p>
        ) : (
          <p className="mt-1 text-2xl font-semibold text-black dark:text-zinc-50">
            {report.attendanceRate}%
            <span className="ml-2 text-sm font-normal text-zinc-500">
              ({report.totalAttended}/{report.totalBooked} attended)
            </span>
          </p>
        )}
      </div>

      <div id="no-shows" className="mt-4 rounded-lg border border-black/10 p-4 dark:border-white/10">
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

      <div id="popularity" className="mt-4 rounded-lg border border-black/10 p-4 dark:border-white/10">
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
    </AppShell>
  );
}
