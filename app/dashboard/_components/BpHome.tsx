import type { LucideIcon } from 'lucide-react';
import { Award, Gift, HelpCircle, MessagesSquare, PlayCircle, Star, Trophy, Users } from 'lucide-react';
import type { BookingRow, ClientMembershipRow, ClientProfileRow, RewardRow } from '@/lib/data/types';
import { clubProgress } from '@/lib/clubs';
import { ClubBar } from './ClubBar';
import { Card, IconChip, SectionLabel } from '@/app/_components/ui';
import type { Category, Screen } from './categories';

// Member Home, from the owner's BP mockup (01-dashboard) and app flow chart. Split in two so the
// day-to-day cards (next class, streak, forms) can sit between the greeting and the tile
// sections -- what you need today comes first, the menu of areas after it.


function monthsSince(isoDate: string): number {
  const start = new Date(isoDate + 'T00:00:00Z');
  const now = new Date();
  return Math.max(0, (now.getUTCFullYear() - start.getUTCFullYear()) * 12 + (now.getUTCMonth() - start.getUTCMonth()));
}

export function Tile({
  icon,
  title,
  subtitle,
  highlight,
  soon,
  onClick,
}: {
  icon: LucideIcon;
  title: string;
  subtitle: string;
  highlight?: boolean;
  soon?: boolean;
  onClick?: () => void;
}) {
  const disabled = soon || !onClick;
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`relative flex w-full min-w-0 items-center gap-3 rounded-2xl border p-3 text-left transition-colors ${
        highlight ? 'border-accent/30 bg-accent-soft' : 'border-black/[.06] bg-card dark:border-white/10'
      } ${disabled ? 'cursor-default opacity-50' : 'hover:bg-black/[.03] dark:hover:bg-white/[.04]'}`}
    >
      <IconChip icon={icon} tone={highlight ? 'accent' : 'muted'} />
      <span className="min-w-0">
        <span className="block truncate text-sm font-bold text-black dark:text-zinc-50">{title}</span>
        <span className="block truncate text-xs text-zinc-500">{subtitle}</span>
      </span>
    </button>
  );
}

// The second door into the app, full width under the next-session tile (bookings live inside that tile).
export function BpMainTiles({ onNavigate }: { onNavigate: (category: Category, screen?: Screen) => void }) {
  return <Tile icon={MessagesSquare} title="My coaching" subtitle="Chat & nutrition" highlight onClick={() => onNavigate('Coach')} />;
}

export function BpHomeHero({ profile }: { profile: ClientProfileRow | null }) {
  const greetingHour = new Date().getHours();
  const greeting = greetingHour < 12 ? 'Good morning' : greetingHour < 18 ? 'Good afternoon' : 'Good evening';
  const firstName = profile?.name?.trim().split(/\s+/)[0] ?? 'there';
  return (
    <div className="px-1 pt-1">
      <p className="text-sm text-zinc-500">{greeting}</p>
      <p className="truncate text-2xl font-black text-black dark:text-zinc-50">{firstName}</p>
    </div>
  );
}

export function BpHomeProgress({
  bookings,
  membership,
  rewards = [],
}: {
  bookings: BookingRow[];
  membership: ClientMembershipRow | null;
  rewards?: RewardRow[];
}) {
  // Attendance is marked by the coach after each session, so this counts sessions actually
  // attended rather than merely booked.
  const sessionsDone = bookings.filter((b) => b.attended).length;
  const club = clubProgress(sessionsDone);
  // The nearest not-yet-reached sessions reward (e.g. "Hoodie" at 100), shown on the club bar.
  const nextReward = rewards
    .filter((r) => r.kind === 'sessions' && r.threshold > sessionsDone)
    .sort((a, b) => a.threshold - b.threshold)[0];
  const memberMonths = membership ? monthsSince(membership.started_at) : null;

  return (
    <div className="space-y-5">
      <div>
        <SectionLabel>Your progress</SectionLabel>
        <div className="grid grid-cols-2 gap-2">
          <Card className="text-center !p-3">
            <p className="text-3xl font-black leading-none text-accent">{sessionsDone}</p>
            <p className="mt-1.5 text-[11px] uppercase tracking-wider text-zinc-500">Sessions done</p>
          </Card>
          <Card className="text-center !p-3">
            <p className="text-3xl font-black leading-none text-accent">
              {memberMonths ?? '—'}
              {memberMonths != null && <span className="ml-0.5 text-sm font-bold text-zinc-400">mo</span>}
            </p>
            <p className="mt-1.5 text-[11px] uppercase tracking-wider text-zinc-500">Member for</p>
          </Card>
        </div>
        <Card className="mt-2 !px-3.5 !py-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="text-xs font-bold text-black dark:text-zinc-50">
              {club.next} club — {club.toGo} {club.toGo === 1 ? 'session' : 'sessions'} to go
            </span>
            {nextReward && <span className="truncate text-xs text-accent">{nextReward.name}</span>}
          </div>
          <ClubBar progress={club} />
          {club.earned.length > 0 && (
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {club.earned.map((n) => (
                <span key={n} className="flex items-center gap-1 rounded-full bg-accent/15 px-2.5 py-0.5 text-[11px] font-extrabold text-accent">
                  <Award className="h-3 w-3" /> {n} club
                </span>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

export function BpHomeExplore({ onNavigate }: { onNavigate: (category: Category, screen?: Screen) => void }) {
  return (
    <div>
      <SectionLabel>Explore</SectionLabel>
      <div className="grid grid-cols-2 gap-2">
        <Tile icon={PlayCircle} title="Resources" subtitle="Video library" onClick={() => onNavigate('Learn', 'Education')} />
        <Tile icon={Trophy} title="Events" subtitle="Gym events" onClick={() => onNavigate('Community', 'Events')} />
        <Tile icon={Gift} title="Rewards" subtitle="Gifts & clubs" onClick={() => onNavigate('Community', 'Rewards')} />
        <Tile icon={Users} title="Refer a friend" subtitle="Share your link" onClick={() => onNavigate('Community', 'Refer a Friend')} />
        <Tile icon={Star} title="Feedback" subtitle="Rate your experience" onClick={() => onNavigate('Community', 'Feedback')} />
        <Tile icon={HelpCircle} title="FAQ & T&Cs" subtitle="Help & policies" onClick={() => onNavigate('Community', 'FAQs')} />
      </div>
    </div>
  );
}
