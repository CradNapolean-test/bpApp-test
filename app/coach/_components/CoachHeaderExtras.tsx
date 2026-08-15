import Link from 'next/link';
import { Avatar } from '@/app/_components/Avatar';
import { CoachMessagesButton } from './CoachMessagesButton';

// Date + message icon + self-avatar, shown next to Sign out in every coach desktop page's
// header. AppShell pairs this with the title/nav rows differently than the design mockup
// (title+nav share a row there; here title and this group share AppShell's single header
// row instead) -- a deliberate trade-off against reworking AppShell's shared row layout for
// every other page that uses it, not an oversight.
export function CoachHeaderExtras({ unreadCount, email }: { unreadCount: number; email: string }) {
  const todayLabel = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });

  return (
    <div className="flex items-center gap-3">
      <span className="hidden text-sm text-zinc-500 sm:inline">{todayLabel}</span>
      <CoachMessagesButton unreadCount={unreadCount} />
      <Link href="/coach/settings" aria-label="Account settings">
        <Avatar name={email} size="md" variant="self" />
      </Link>
    </div>
  );
}
