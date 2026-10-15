'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, X } from 'lucide-react';
import { ChatTab } from '@/app/dashboard/_components/ChatTab';
import { useCoachMessages } from './useCoachMessages';
import { ConversationList } from './ConversationList';
import { getCoachChatOverview } from '@/lib/data/chat';
import { useDialog } from '@/app/_components/useDialog';
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
  const [overviewFailed, setOverviewFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  // A real dialog (SH3): focus moves in and returns, Tab stays inside, Escape closes, the page behind is inert.
  const dialogRef = useDialog<HTMLElement>({ onClose });
  const { localOverview, selected, selectClient, clearSelection, markRead, markUnread, messages, loading, loadError, loadId, retryLoad, selectedClient } =
    useCoachMessages(overview ?? EMPTY_OVERVIEW, currentUserId);

  useEffect(() => {
    let cancelled = false;
    getCoachChatOverview()
      .then((data) => {
        if (!cancelled) setOverview(data);
      })
      .catch(() => {
        // Without this the drawer said "Loading…" for ever when the list could not be fetched (R29).
        if (!cancelled) setOverviewFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  function retryOverview() {
    setOverviewFailed(false);
    setAttempt((n) => n + 1);
  }

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <aside
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Messages"
        className="absolute inset-y-0 right-0 flex w-full max-w-sm flex-col border-l border-black/10 bg-[var(--background)] shadow-xl dark:border-white/10"
      >
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
            type="button"
            data-dialog-close
            onClick={onClose}
            aria-label="Close"
            className="flex h-10 w-10 items-center justify-center rounded-md text-zinc-500 hover:bg-black/5 dark:hover:bg-white/5"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {overviewFailed ? (
            <div className="p-4 text-sm text-zinc-500">
              <p>We could not load your conversations.</p>
              <button type="button" onClick={retryOverview} className="mt-2 rounded-full bg-accent px-4 py-1.5 text-xs font-bold text-white">
                Try again
              </button>
            </div>
          ) : overview === null ? (
            <p className="p-4 text-sm text-zinc-500">Loading…</p>
          ) : !selected ? (
            <div className="p-2">
              <Link
                href="/coach/messages?tab=broadcasts"
                onClick={onClose}
                className="mb-2 block rounded-xl bg-accent-soft px-3 py-2.5 text-sm font-bold text-accent"
              >
                Broadcasts and the full Messages page
              </Link>
              <ConversationList overview={localOverview} selected={selected} onSelect={selectClient} onMarkRead={markRead} onMarkUnread={markUnread} />
            </div>
          ) : loadError ? (
            <div className="p-4 text-sm text-zinc-500">
              <p>We could not load this conversation.</p>
              <button type="button" onClick={retryLoad} className="mt-2 rounded-full bg-accent px-4 py-1.5 text-xs font-bold text-white">
                Try again
              </button>
            </div>
          ) : loading ? (
            <p className="p-4 text-sm text-zinc-500">Loading messages…</p>
          ) : (
            <div className="p-2">
              <ChatTab
                key={`${selected}:${loadId}`}
                clientId={selected}
                initialMessages={messages}
                currentUserId={currentUserId}
                otherPartyName={selectedClient?.client_name ?? 'Client'}
                memberHref={`/coach/clients/${selected}`}
                onMarkUnread={() => markUnread(selected)}
              />
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}
