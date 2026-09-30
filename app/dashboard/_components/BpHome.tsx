import type { LucideIcon } from 'lucide-react';
import { Award, CalendarDays, Gift, HelpCircle, MessagesSquare, Package, PlayCircle, Shirt, Star, Trophy, Users } from 'lucide-react';
import type { BookingRow, ClientMembershipRow, ClientProfileRow, RewardRow } from '@/lib/data/types';
import type { Category, Screen } from './categories';

// Home tile grid from the owner's BP app mockup (01-dashboard). Tiles for features that
// aren't built yet render as disabled "Soon" tiles rather than being omitted, so the layout
// matches the mockup and each tile lights up as its feature ships.

const CLUB_STEP = 100;

function monthsSince(isoDate: string): number {
  const start = new Date(isoDate + 'T00:00:00Z');
  const now = new Date();
  return Math.max(0, (now.getUTCFullYear() - start.getUTCFullYear()) * 12 + (now.getUTCMonth() - start.getUTCMonth()));
}

type TileProps = {
  icon: LucideIcon;
  title: string;
  subtitle: string;
  highlight?: boolean;
  soon?: boolean;
  onClick?: () => void;
};

function Tile({ icon: Icon, title, subtitle, highlight, soon, onClick }: TileProps) {
  const disabled = soon || !onClick;
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`relative overflow-hidden rounded-2xl border p-3.5 text-left transition-colors ${
        highlight
          ? 'border-accent/30 bg-accent-soft'
          : 'border-black/[.06] bg-[var(--background)] dark:border-white/10'
      } ${disabled ? 'cursor-default opacity-50' : 'hover:bg-black/[.03] dark:hover:bg-white/[.04]'}`}
    >
      <span
        className={`mb-2.5 flex h-8 w-8 items-center justify-center rounded-lg ${
          highlight ? 'bg-accent/15 text-accent' : 'bg-black/5 text-zinc-500 dark:bg-white/10 dark:text-zinc-400'
        }`}
      >
        <Icon className="h-4 w-4" />
      </span>
      <p className="text-xs font-extrabold text-black dark:text-zinc-50">{title}</p>
      <p className="mt-0.5 text-[10px] text-zinc-500">{subtitle}</p>
      {soon && (
        <span className="absolute right-2 top-2 rounded-full bg-black/10 px-1.5 py-0.5 text-[8px] font-bold uppercase text-zinc-500 dark:bg-white/10">
          Soon
        </span>
      )}
    </button>
  );
}

function SectionLabel({ children }: { children: string }) {
  return <p className="px-1 pb-1.5 pt-1 text-[9px] font-extrabold uppercase tracking-[2px] text-zinc-500">{children}</p>;
}

export function BpHome({
  profile,
  bookings,
  membership,
  rewards = [],
  onNavigate,
  onNavigateClasses,
}: {
  profile: ClientProfileRow | null;
  bookings: BookingRow[];
  membership: ClientMembershipRow | null;
  rewards?: RewardRow[];
  onNavigate: (category: Category, screen?: Screen) => void;
  onNavigateClasses?: () => void;
}) {
  const firstName = profile?.name?.trim().split(/\s+/)[0] ?? 'there';
  const greetingHour = new Date().getHours();
  const greeting = greetingHour < 12 ? 'Good morning' : greetingHour < 18 ? 'Good afternoon' : 'Good evening';

  // Attendance is marked by the coach after each session, so this counts sessions actually
  // attended rather than merely booked.
  const sessionsDone = bookings.filter((b) => b.attended).length;
  const nextClub = (Math.floor(sessionsDone / CLUB_STEP) + 1) * CLUB_STEP;
  const clubPct = Math.round(((sessionsDone % CLUB_STEP) / CLUB_STEP) * 100);

  const clubsEarned = Math.floor(sessionsDone / CLUB_STEP);
  // The nearest not-yet-reached sessions reward (e.g. "Hoodie" at 100), shown on the club bar.
  const nextReward = rewards
    .filter((r) => r.kind === 'sessions' && r.threshold > sessionsDone)
    .sort((a, b) => a.threshold - b.threshold)[0];

  const memberMonths = membership ? monthsSince(membership.started_at) : null;
  const membershipName = membership?.package?.name ?? null;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between rounded-2xl border border-accent/30 bg-accent-soft px-4 py-3.5">
        <div className="min-w-0">
          <p className="text-[11px] text-zinc-500">{greeting}</p>
          <p className="truncate text-[17px] font-extrabold text-black dark:text-zinc-50">{profile?.name ?? firstName}</p>
        </div>
        {membershipName && (
          <span className="ml-3 shrink-0 rounded-full border border-accent/30 bg-accent/10 px-2.5 py-1 text-[9px] font-extrabold uppercase tracking-wider text-accent">
            {membershipName}
          </span>
        )}
      </div>

      <div>
        <SectionLabel>Train &amp; coach</SectionLabel>
        <div className="grid grid-cols-2 gap-2">
          <Tile icon={CalendarDays} title="My sessions" subtitle="Book group PT" highlight onClick={onNavigateClasses} />
          <Tile icon={MessagesSquare} title="My coaching" subtitle="Chat & nutrition" highlight onClick={() => onNavigate('Coach')} />
          <Tile icon={PlayCircle} title="Resources" subtitle="Video education" onClick={() => onNavigate('Accountability', 'Education')} />
          <Tile icon={Trophy} title="Events" subtitle="Book gym events" onClick={() => onNavigate('Community', 'Events')} />
        </div>
      </div>

      <div>
        <SectionLabel>Engagement &amp; community</SectionLabel>
        <div className="grid grid-cols-2 gap-2">
          <Tile icon={Users} title="Refer a friend" subtitle="Share discount link" onClick={() => onNavigate('Community', 'Refer a Friend')} />
          <Tile icon={Star} title="Feedback" subtitle="Submit member feedback" onClick={() => onNavigate('Community', 'Feedback')} />
          <Tile icon={HelpCircle} title="FAQ & T&Cs" subtitle="Policies & help docs" onClick={() => onNavigate('Community', 'FAQs')} />
        </div>
      </div>

      <div>
        <SectionLabel>Your progress</SectionLabel>
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-2xl border border-black/[.06] bg-[var(--background)] p-3 text-center dark:border-white/10">
            <p className="text-[26px] font-black leading-none text-accent">{sessionsDone}</p>
            <p className="mt-1 text-[9px] uppercase tracking-wider text-zinc-500">Sessions done</p>
          </div>
          <div className="rounded-2xl border border-black/[.06] bg-[var(--background)] p-3 text-center dark:border-white/10">
            <p className="text-[26px] font-black leading-none text-accent">
              {memberMonths ?? '—'}
              {memberMonths != null && <span className="ml-0.5 text-[13px] font-bold text-zinc-400">mo</span>}
            </p>
            <p className="mt-1 text-[9px] uppercase tracking-wider text-zinc-500">Member since</p>
          </div>
        </div>
        <div className="mt-2 rounded-2xl border border-accent/30 bg-[var(--background)] px-3.5 py-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[11px] font-bold text-black dark:text-zinc-50">
              {nextClub} club — {nextClub - sessionsDone} {nextClub - sessionsDone === 1 ? 'session' : 'sessions'} to go
            </span>
            {nextReward && <span className="text-[10px] text-accent">{nextReward.name}</span>}
          </div>
          <div className="h-[5px] overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
            <div className="h-full rounded-full bg-accent" style={{ width: `${clubPct}%` }} />
          </div>
          {clubsEarned > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {Array.from({ length: clubsEarned }, (_, k) => (k + 1) * CLUB_STEP).map((n) => (
                <span key={n} className="flex items-center gap-1 rounded-full bg-accent/15 px-2.5 py-0.5 text-[10px] font-extrabold text-accent">
                  <Award className="h-3 w-3" /> {n} club
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <Tile icon={Gift} title="Rewards" subtitle="Loyalty gifts, hoodies, bottles" onClick={() => onNavigate('Community', 'Rewards')} />
        </div>
      </div>

      <div>
        <SectionLabel>Coming soon</SectionLabel>
        <div className="grid grid-cols-2 gap-2">
          <Tile icon={Package} title="Order supplements" subtitle="Coming soon" soon />
          <Tile icon={Shirt} title="Order merch" subtitle="Partner discounts" soon />
        </div>
      </div>
    </div>
  );
}
