'use client';

import { useMemo, useState } from 'react';
import { MessageSquare } from 'lucide-react';
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
}: {
  overview: ChatOverviewRow[];
  selected: string | null;
  onSelect: (clientId: string) => void;
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
          className="w-full rounded-xl border border-black/10 bg-black/[0.03] px-3 py-1.5 text-sm outline-none focus:border-accent dark:border-white/10 dark:bg-white/5"
        />
        <div className="flex gap-1 text-xs">
          {(['active', 'unread', 'all'] as FilterMode[]).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`rounded-full px-2.5 py-1 font-medium capitalize transition-colors ${
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
          <button
            key={c.client_id}
            onClick={() => onSelect(c.client_id)}
            className={`block w-full rounded-2xl px-3 py-2.5 text-left text-sm transition-colors ${
              selected === c.client_id
                ? 'bg-black/[.04] dark:bg-white/[.06]'
                : 'text-zinc-700 hover:bg-black/5 dark:text-zinc-300 dark:hover:bg-white/5'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <Avatar name={c.client_name} size="sm" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-bold text-black dark:text-zinc-50">{c.client_name}</span>
                  <span className="flex shrink-0 items-center gap-1.5 text-xs text-zinc-400">
                    {c.last_message_at && relativeTime(c.last_message_at)}
                    {c.unread_count > 0 && <span className="h-2 w-2 rounded-full bg-[#19adb1]" aria-label="Unread" />}
                  </span>
                </div>
                <p className="truncate text-xs text-zinc-500">{c.last_message ?? 'No messages yet'}</p>
              </div>
            </div>
          </button>
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
