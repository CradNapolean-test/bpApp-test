'use client';

import { useEffect, useRef, useState } from 'react';
import { MessageSquare } from 'lucide-react';
import { AppShell } from '@/app/_components/AppShell';
import { CoachNav } from '@/app/coach/_components/CoachNav';
import { EmptyState } from '@/app/_components/EmptyState';
import { ChatTab } from '@/app/dashboard/_components/ChatTab';
import { useCoachMessages } from '@/app/coach/_components/useCoachMessages';
import { ConversationList } from '@/app/coach/_components/ConversationList';
import { BroadcastsPane } from './BroadcastsPane';
import type { ChatOverviewRow, ClientGroupWithMembers, ScheduledCommunicationRow } from '@/lib/data/types';

type Tab = 'inbox' | 'broadcasts';

export function MessagesHubShell({
  overview,
  currentUserId,
  groups,
  communications,
}: {
  overview: ChatOverviewRow[];
  currentUserId: string;
  groups: ClientGroupWithMembers[];
  communications: ScheduledCommunicationRow[];
}) {
  const [tab, setTab] = useState<Tab>('inbox');
  const { localOverview, selected, selectClient, messages, loading, selectedClient } = useCoachMessages(
    overview,
    currentUserId
  );

  // Only run once, on mount -- selecting a different client afterwards is user-driven, via the
  // onClick handlers below, not this effect.
  const autoSelected = useRef(false);
  useEffect(() => {
    if (autoSelected.current) return;
    if (overview[0]) {
      autoSelected.current = true;
      selectClient(overview[0].client_id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overview]);

  const tabBar = (
    <div className="flex gap-1 text-sm">
      {(['inbox', 'broadcasts'] as Tab[]).map((t) => (
        <button
          key={t}
          onClick={() => setTab(t)}
          className={`rounded-full px-3 py-1.5 font-medium capitalize transition-colors ${
            tab === t ? 'bg-accent text-accent-foreground' : 'text-zinc-500 hover:bg-black/5 dark:hover:bg-white/5'
          }`}
        >
          {t}
        </button>
      ))}
    </div>
  );

  if (tab === 'broadcasts') {
    return (
      <AppShell title="Messages" topBar={<CoachNav />} banner={tabBar}>
        <BroadcastsPane overview={overview} groups={groups} communications={communications} />
      </AppShell>
    );
  }

  return (
    // No CoachMessagesButton/headerAction here on purpose -- being on this page already is
    // the messages experience; opening the MessagesDrawer on top of it double-mounts a
    // second ChatTab for the same client, which throws (verified) on the shared realtime
    // channel name ("cannot add postgres_changes callbacks ... after subscribe()").
    <AppShell
      title="Messages"
      topBar={<CoachNav />}
      banner={tabBar}
      sidebar={<ConversationList overview={localOverview} selected={selected} onSelect={selectClient} />}
    >
      {!selected ? (
        <EmptyState
          icon={MessageSquare}
          title="No conversations yet"
          hint="Once you have clients, their threads will show up here."
        />
      ) : loading ? (
        <p className="text-sm text-zinc-500">Loading messages…</p>
      ) : (
        <ChatTab
          key={selected}
          clientId={selected}
          initialMessages={messages}
          currentUserId={currentUserId}
          otherPartyName={selectedClient?.client_name ?? 'Client'}
        />
      )}
    </AppShell>
  );
}
