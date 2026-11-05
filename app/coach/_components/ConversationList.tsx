'use client';

import { useMemo, useState } from 'react';
import { MessageSquare } from 'lucide-react';
import { DropdownMenu } from '@/app/_components/DropdownMenu';
import { EmptyState } from '@/app/_components/EmptyState';
import { Avatar } from '@/app/_components/Avatar';
import { lastSender, needsReply } from '@/lib/inboxOverview';
import { useFitToWindow } from './useFitToWindow';
import type { ChatOverviewRow } from '@/lib/data/types';

export function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

type FilterMode = 'active' | 'reply' | 'unread' | 'all';

const FILTER_LABEL: Record<FilterMode, string> = { active: 'Active', reply: 'Needs reply', unread: 'Unread', all: 'All' };

// Said before the preview so the coach can tell at a glance whose turn it is: their own last word, a colleague's (a gym-wide broadcast
// lands in every thread), or nothing for the member's own message.
const SENDER_PREFIX = { me: 'You: ', team: 'Another coach: ' } as const;

export function ConversationList({
  overview,
  selected,
  onSelect,
  onMarkRead,
  onMarkUnread,
  currentUserId,
  fitToWindow = false,
}: {
  overview: ChatOverviewRow[];
  selected: string | null;
  onSelect: (clientId: string) => void;
  // When given, each conversation gets a menu to mark it read or unread.
  onMarkRead?: (clientId: string) => void;
  onMarkUnread?: (clientId: string) => void;
  // The coach looking at the list, so their own last message reads "You: …".
  currentUserId: string;
  // The Messages page's left column: the list scrolls inside itself and ends at the bottom of the window, level with the open thread.
  fitToWindow?: boolean;
}) {
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<FilterMode>('active');
  // 12px of the column's own padding under the list, plus the page's 40px.
  const [listRef, listHeight] = useFitToWindow({ bottomGap: 52, min: 240, enabled: fitToWindow });

  const counts = useMemo(
    () => ({ reply: overview.filter(needsReply).length, unread: overview.filter((c) => c.unread_count > 0).length }),
    [overview]
  );

  const filtered = useMemo(() => {
    let rows = overview;
    if (mode === 'active') rows = rows.filter((c) => c.last_message_at != null);
    else if (mode === 'reply') rows = rows.filter(needsReply);
    else if (mode === 'unread') rows = rows.filter((c) => c.unread_count > 0);
    const q = query.trim().toLowerCase();
    if (q) rows = rows.filter((c) => c.client_name.toLowerCase().includes(q));
    return rows;
  }, [overview, mode, query]);

  const caughtUp = (mode === 'reply' || mode === 'unread') && !query.trim() && overview.length > 0;

  return (
    <div>
      <div className="space-y-2 px-1 pb-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search clients…"
          aria-label="Search clients"
          className="w-full rounded-xl border border-black/10 bg-black/[0.03] px-3.5 py-2.5 text-base outline-none focus:border-accent sm:py-2 sm:text-sm dark:border-white/10 dark:bg-white/5"
        />
        <div role="group" aria-label="Show conversations" className="flex flex-wrap gap-1 text-xs">
          {(['active', 'reply', 'unread', 'all'] as FilterMode[]).map((m) => {
            const count = m === 'reply' ? counts.reply : m === 'unread' ? counts.unread : 0;
            return (
              <button
                key={m}
                type="button"
                aria-pressed={mode === m}
                onClick={() => setMode(m)}
                className={`min-h-10 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors sm:min-h-9 sm:px-2.5 sm:py-1 sm:text-xs ${
                  mode === m ? 'bg-accent text-accent-foreground' : 'text-zinc-500 hover:bg-black/5 dark:hover:bg-white/5'
                }`}
              >
                {FILTER_LABEL[m]}
                {count > 0 && <span className="ml-1 tabular-nums opacity-70">{count}</span>}
              </button>
            );
          })}
        </div>
      </div>

      <nav
        ref={listRef}
        aria-label="Conversations"
        className={`space-y-1 ${listHeight != null ? 'overflow-y-auto overscroll-contain' : ''}`}
        style={listHeight != null ? { maxHeight: listHeight } : undefined}
      >
        {filtered.map((c) => {
          const sender = lastSender(c, currentUserId);
          const waiting = sender === 'member';
          const preview = c.last_message ?? (c.last_message_at ? 'Attachment' : 'No messages yet');
          return (
            <div
              key={c.client_id}
              className={`flex items-center gap-1 rounded-2xl pr-1 transition-colors ${
                selected === c.client_id ? 'bg-black/[.04] dark:bg-white/[.06]' : 'hover:bg-black/5 dark:hover:bg-white/5'
              }`}
            >
              <button onClick={() => onSelect(c.client_id)} className="block min-w-0 flex-1 rounded-2xl px-3 py-2.5 text-left text-sm text-zinc-700 dark:text-zinc-300">
                <div className="flex items-center gap-2.5">
                  <Avatar name={c.client_name} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className={`truncate text-black dark:text-zinc-50 ${c.unread_count > 0 ? 'font-extrabold' : 'font-bold'}`}>{c.client_name}</span>
                      <span className="flex shrink-0 items-center gap-1.5 text-xs text-zinc-400">
                        {c.last_message_at && relativeTime(c.last_message_at)}
                        {c.unread_count > 0 && (
                          <>
                            {/* The dot is the picture; the text is what is announced (a label on a plain span is not). */}
                            <span className="sr-only">Unread</span>
                            <span aria-hidden className="h-2 w-2 rounded-full bg-accent" />
                          </>
                        )}
                      </span>
                    </div>
                    <p className={`truncate text-xs ${c.unread_count > 0 ? 'font-semibold text-zinc-700 dark:text-zinc-200' : 'text-zinc-500'}`}>
                      {sender === 'me' || sender === 'team' ? <span className="text-zinc-400">{SENDER_PREFIX[sender]}</span> : null}
                      {preview}
                    </p>
                    {waiting && c.unread_count === 0 && <p className="mt-0.5 text-[11px] font-semibold text-accent">Needs reply</p>}
                  </div>
                </div>
              </button>
              {(onMarkRead || onMarkUnread) && c.last_message_at && (
                <DropdownMenu
                  triggerLabel={`More actions for ${c.client_name}`}
                  items={
                    c.unread_count > 0
                      ? [{ label: 'Mark as read', onSelect: () => onMarkRead?.(c.client_id) }]
                      : [{ label: 'Mark as unread', onSelect: () => onMarkUnread?.(c.client_id) }]
                  }
                />
              )}
            </div>
          );
        })}
        {filtered.length === 0 && (
          <EmptyState
            compact
            icon={MessageSquare}
            title={overview.length === 0 ? 'No clients yet' : caughtUp ? 'All caught up' : 'No matches'}
            hint={
              overview.length === 0 || caughtUp
                ? undefined
                : mode === 'active'
                  ? 'No conversations yet — switch to "All" to message a client for the first time.'
                  : undefined
            }
          />
        )}
      </nav>
    </div>
  );
}
