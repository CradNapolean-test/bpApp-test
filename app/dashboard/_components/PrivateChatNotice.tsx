'use client';

import { Lock, X } from 'lucide-react';
import { Avatar } from '@/app/_components/Avatar';
import { EmptyState } from '@/app/_components/EmptyState';
import { PRIVATE_CHAT_HINT, privateChatTitle } from '@/lib/privateChat';

// Shown in the chat panel on a colleague's member's page (MS22): the conversation is private to the member's own coach (D3, 0153), so an
// empty read-only chat ("No messages yet") said the wrong thing.
export function PrivateChatNotice({ memberName, coachName, onClose }: { memberName: string; coachName: string | null; onClose: () => void }) {
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-[20px] border border-black/[.08] bg-card dark:border-white/10">
      <div className="flex items-center gap-3 border-b border-black/[.05] px-4 py-3 dark:border-white/10">
        <Avatar name={memberName} size="md" />
        <p className="min-w-0 flex-1 truncate text-sm font-extrabold text-black dark:text-zinc-50">{memberName}</p>
        <button
          type="button"
          onClick={onClose}
          aria-label="Hide chat"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-zinc-500 hover:bg-black/5 dark:hover:bg-white/10"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="flex flex-1 items-center justify-center px-4 py-6">
        <EmptyState icon={Lock} title={privateChatTitle(coachName)} hint={PRIVATE_CHAT_HINT} />
      </div>
    </div>
  );
}
