'use client';

import { useMemo, useState } from 'react';
import { MessageSquare } from 'lucide-react';
import { EmptyState } from '@/app/_components/EmptyState';
import { Avatar } from '@/app/_components/Avatar';
import type { ChatOverviewRow } from '@/lib/data/types';

export function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
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
                ? 'bg-accent text-accent-foreground shadow-sm'
                : 'text-zinc-700 hover:bg-black/5 dark:text-zinc-300 dark:hover:bg-white/5'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <Avatar name={c.client_name} size="sm" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-medium">{c.client_name}</span>
                  {c.unread_count > 0 && (
                    <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-danger px-1.5 text-[10px] font-semibold text-white">
                      {c.unread_count > 99 ? '99+' : c.unread_count}
                    </span>
                  )}
                </div>
                {c.last_message ? (
                  <p className={`truncate text-xs ${selected === c.client_id ? 'opacity-80' : 'text-zinc-500'}`}>
                    {c.last_message}
                    {c.last_message_at && ` · ${relativeTime(c.last_message_at)}`}
                  </p>
                ) : (
                  <p className={`text-xs ${selected === c.client_id ? 'opacity-80' : 'text-zinc-500'}`}>No messages yet</p>
                )}
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
