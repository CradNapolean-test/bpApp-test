'use client';

import { useMemo, useState } from 'react';
import { MessageSquare } from 'lucide-react';
import { DropdownMenu } from '@/app/_components/DropdownMenu';
import { EmptyState } from '@/app/_components/EmptyState';
import { Avatar } from '@/app/_components/Avatar';
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

type FilterMode = 'active' | 'unread' | 'all';

export function ConversationList({
  overview,
  selected,
  onSelect,
  onMarkRead,
  onMarkUnread,
}: {
  overview: ChatOverviewRow[];
  selected: string | null;
  onSelect: (clientId: string) => void;
  // When given, each conversation gets a menu to mark it read or unread.
  onMarkRead?: (clientId: string) => void;
  onMarkUnread?: (clientId: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<FilterMode>('active');

  const filtered = useMemo(() => {
    let rows = overview;
    if (mode === 'active') rows = rows.filter((c) => c.last_message_at != null);
    else if (mode === 'unread') rows = rows.filter((c) => c.unread_count > 0);
    const q = query.trim().toLowerCase();
    if (q) rows = rows.filter((c) => c.client_name.toLowerCase().includes(q));
    return rows;
  }, [overview, mode, query]);

  return (
    <div>
      <div className="space-y-2 px-1 pb-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search clients…"
          className="w-full rounded-xl border border-black/10 bg-black/[0.03] px-3.5 py-2.5 text-base outline-none focus:border-accent sm:py-2 sm:text-sm dark:border-white/10 dark:bg-white/5"
        />
        <div className="flex gap-1 text-xs">
          {(['active', 'unread', 'all'] as FilterMode[]).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`rounded-full px-3.5 py-1.5 text-sm font-medium capitalize transition-colors sm:px-2.5 sm:py-1 sm:text-xs ${
                mode === m
                  ? 'bg-accent text-accent-foreground'
                  : 'text-zinc-500 hover:bg-black/5 dark:hover:bg-white/5'
              }`}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      <nav className="space-y-1">
        {filtered.map((c) => (
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
                      {c.unread_count > 0 && <span className="h-2 w-2 rounded-full bg-accent" aria-label="Unread" />}
                    </span>
                  </div>
                  <p className={`truncate text-xs ${c.unread_count > 0 ? 'font-semibold text-zinc-700 dark:text-zinc-200' : 'text-zinc-500'}`}>
                    {c.last_message ?? (c.last_message_at ? 'Attachment' : 'No messages yet')}
                  </p>
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
        ))}
        {filtered.length === 0 && (
          <EmptyState
            compact
            icon={MessageSquare}
            title={overview.length === 0 ? 'No clients yet' : 'No matches'}
            hint={
              overview.length === 0
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
