import type { ReactNode } from 'react';
import { Bell, MessageSquare } from 'lucide-react';

// The black header at the top of the member's four tabs (Home, Book, Coach, Profile). On a phone it runs edge to edge and up under the
// status bar, and the page's own header row is left out (AppShell hideMobileHeader); from a tablet up it is a card in the page.

// Messages from the coach and the notifications bell, top right. Left out from a tablet up, where the page header already has them.
export interface HeaderActions {
  unreadMessages: number;
  onOpenMessages?: () => void;
  unreadNotifications: boolean;
  onOpenNotifications?: () => void;
}

// On the teal message bubble the icon is near-black in both themes: white on this teal is too faint to read.
const onTeal = 'text-[#041f1f]';

export function MemberHeader({
  eyebrow,
  title,
  subtitle,
  lead,
  actions,
  large = false,
  children,
}: {
  // The small line above the title (the date, the programme week) and the one under it (an email address).
  eyebrow?: ReactNode;
  title: string;
  subtitle?: ReactNode;
  // Something to the left of the title (the member's avatar on Profile).
  lead?: ReactNode;
  actions?: HeaderActions;
  // Home's greeting is a size up from a screen title.
  large?: boolean;
  // What else the header holds: the week strip, a tile, a switch.
  children?: ReactNode;
}) {
  return (
    <div className="-mx-4 -mt-[max(1.5rem,env(safe-area-inset-top))] space-y-4 rounded-b-[28px] bg-[#1d1d1b] px-5 pb-5 pt-[max(1.5rem,env(safe-area-inset-top))] text-zinc-100 sm:-mx-6 sm:-mt-10 sm:px-6 sm:pt-10 md:mx-0 md:mt-0 md:rounded-[28px] md:p-6 dark:border-b dark:border-white/10 md:dark:border">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          {lead}
          <div className="min-w-0">
            {eyebrow && <p className="truncate text-[13px] text-zinc-400">{eyebrow}</p>}
            <p className={`truncate font-extrabold leading-tight tracking-tight ${large ? 'text-[28px]' : 'text-2xl'}`}>{title}</p>
            {subtitle && <p className="truncate text-[13px] text-zinc-400">{subtitle}</p>}
          </div>
        </div>
        {actions && (
          <div className="flex shrink-0 items-center gap-2 md:hidden">
            {actions.onOpenMessages && (
              <button
                type="button"
                onClick={actions.onOpenMessages}
                aria-label={actions.unreadMessages > 0 ? `Messages, ${actions.unreadMessages} unread` : 'Messages'}
                className={`relative flex h-11 w-11 items-center justify-center rounded-full ${
                  actions.unreadMessages > 0 ? `bg-accent ${onTeal}` : 'border border-white/15 text-zinc-100 hover:bg-white/10'
                }`}
              >
                <MessageSquare className="h-5 w-5" />
                {actions.unreadMessages > 0 && (
                  <span className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full border-2 border-[#1d1d1b] bg-danger px-1 text-[10px] font-extrabold leading-none text-white">
                    {actions.unreadMessages > 9 ? '9+' : actions.unreadMessages}
                  </span>
                )}
              </button>
            )}
            {actions.onOpenNotifications && (
              <button
                type="button"
                onClick={actions.onOpenNotifications}
                aria-label={actions.unreadNotifications ? 'Notifications, some unread' : 'Notifications'}
                className="relative flex h-11 w-11 items-center justify-center rounded-full border border-white/15 text-zinc-100 hover:bg-white/10"
              >
                <Bell className="h-5 w-5" />
                {actions.unreadNotifications && <span className="absolute right-2.5 top-2.5 h-2.5 w-2.5 rounded-full border-2 border-[#1d1d1b] bg-warning" />}
              </button>
            )}
          </div>
        )}
      </div>
      {children}
    </div>
  );
}
