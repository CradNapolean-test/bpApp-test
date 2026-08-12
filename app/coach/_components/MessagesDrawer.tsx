'use client';

import { useEffect, useState } from 'react';
import { ArrowLeft, X } from 'lucide-react';
import { ChatTab } from '@/app/dashboard/_components/ChatTab';
import { useCoachMessages } from './useCoachMessages';
import { ConversationList } from './ConversationList';
import { getCoachChatOverview } from '@/lib/data/chat';
import type { ChatOverviewRow } from '@/lib/data/types';

// Stable reference for the "not fetched yet" case -- `overview ?? []` would create a new
// array literal every render, which looped forever against useCoachMessages' effect that
// re-syncs localOverview whenever its initialOverview argument's reference changes.
const EMPTY_OVERVIEW: ChatOverviewRow[] = [];

// Overlay-from-anywhere version of MessagesHubShell -- single column (list, or a selected
// thread with a back button) rather than the full page's sidebar+content split, since this
// renders in a narrow slide-over instead of the whole viewport.
export function MessagesDrawer({ currentUserId, onClose }: { currentUserId: string; onClose: () => void }) {
  const [overview, setOverview] = useState<ChatOverviewRow[] | null>(null);
  const { localOverview, selected, selectClient, clearSelection, messages, loading, selectedClient } = useCoachMessages(
    overview ?? EMPTY_OVERVIEW,
    currentUserId
  );

  useEffect(() => {
    let cancelled = false;
    getCoachChatOverview().then((data) => {
      if (!cancelled) setOverview(data);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <aside className="absolute inset-y-0 right-0 flex w-full max-w-sm flex-col border-l border-black/10 bg-[var(--background)] shadow-xl dark:border-white/10">
        <div className="flex items-center justify-between gap-2 border-b border-black/10 p-4 dark:border-white/10">
          {selected ? (
            <button
              onClick={clearSelection}
              className="flex items-center gap-1 text-sm font-medium text-zinc-600 hover:text-black dark:text-zinc-400 dark:hover:text-zinc-100"
            >
              <ArrowLeft className="h-4 w-4" />
              {selectedClient?.client_name ?? 'Back'}
            </button>
          ) : (
            <h2 className="text-base font-semibold text-black dark:text-zinc-50">Messages</h2>
          )}
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-1.5 text-zinc-500 hover:bg-black/5 dark:hover:bg-white/5"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {overview === null ? (
            <p className="p-4 text-sm text-zinc-500">Loading…</p>
          ) : !selected ? (
            <div className="p-2">
              <ConversationList overview={localOverview} selected={selected} onSelect={selectClient} />
            </div>
          ) : loading ? (
            <p className="p-4 text-sm text-zinc-500">Loading messages…</p>
          ) : (
            <div className="p-2">
              <ChatTab
                key={selected}
                clientId={selected}
                initialMessages={messages}
                currentUserId={currentUserId}
                otherPartyName={selectedClient?.client_name ?? 'Client'}
              />
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}
