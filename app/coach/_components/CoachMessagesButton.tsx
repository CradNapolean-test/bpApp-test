'use client';

import { MessageSquare } from 'lucide-react';
import { useMessagesDrawer } from './MessagesDrawerContext';

// Messages isn't one of the coach's 4 primary tabs, so it lives as a header icon instead --
// mirrors DashboardShell's client-facing header icon, except this one shows at every screen
// width (not md:hidden). Opens the shared MessagesDrawer overlay (mounted once in
// app/coach/layout.tsx) instead of navigating to /coach/messages, matching PT Distinction's
// overlay-from-anywhere pattern -- the full page still exists at /coach/messages if wanted.
export function CoachMessagesButton({ unreadCount = 0 }: { unreadCount?: number }) {
  const { open } = useMessagesDrawer();
  return (
    <button
      onClick={open}
      aria-label="Messages"
      className="relative rounded-xl bg-black/5 p-2 text-zinc-600 hover:bg-black/10 dark:bg-white/10 dark:text-zinc-300 dark:hover:bg-white/15"
    >
      <MessageSquare className="h-5 w-5" />
      {unreadCount > 0 && (
        <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-semibold text-white">
          {unreadCount > 99 ? '99+' : unreadCount}
        </span>
      )}
    </button>
  );
}
