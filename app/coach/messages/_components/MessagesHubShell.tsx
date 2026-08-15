'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { MessageSquare } from 'lucide-react';
import { AppShell } from '@/app/_components/AppShell';
import { Avatar } from '@/app/_components/Avatar';
import { Logo } from '@/app/_components/Logo';
import { CoachNav } from '@/app/coach/_components/CoachNav';
import { CoachBrand } from '@/app/coach/_components/CoachBrand';
import { EmptyState } from '@/app/_components/EmptyState';
import { ChatTab } from '@/app/dashboard/_components/ChatTab';
import { useCoachMessages } from '@/app/coach/_components/useCoachMessages';
import { ConversationList } from '@/app/coach/_components/ConversationList';
import { BroadcastsPane } from './BroadcastsPane';
import type { ChatOverviewRow, ClientGroupWithMembers, ScheduledCommunicationRow } from '@/lib/data/types';

type Tab = 'inbox' | 'broadcasts';

const TAB_LABEL: Record<Tab, string> = { inbox: 'Conversations', broadcasts: 'Broadcasts' };

export function MessagesHubShell({
  overview,
  currentUserId,
  groups,
  communications,
  email,
}: {
  overview: ChatOverviewRow[];
  currentUserId: string;
  groups: ClientGroupWithMembers[];
  communications: ScheduledCommunicationRow[];
  email: string;
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

  // No CoachMessagesButton in the header here on purpose -- being on this page already is
  // the messages experience; opening the MessagesDrawer on top of it double-mounts a
  // second ChatTab for the same client, which throws (verified) on the shared realtime
  // channel name ("cannot add postgres_changes callbacks ... after subscribe()").
  const todayLabel = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
  const headerExtras = (
    <div className="flex items-center gap-3">
      <span className="hidden text-sm text-zinc-500 sm:inline">{todayLabel}</span>
      <Link href="/coach/settings" aria-label="Account settings">
        <Avatar name={email} size="md" variant="self" />
      </Link>
    </div>
  );

  const header = (
    <>
      <h1 className="mb-4 text-2xl font-bold text-black dark:text-zinc-50">Messages</h1>
      <div className="mb-4 flex w-max gap-1 rounded-2xl bg-black/[.02] p-1.5 dark:bg-white/[.03]">
        {(['inbox', 'broadcasts'] as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`rounded-xl px-3.5 py-2 text-sm font-medium transition-colors ${
              tab === t
                ? 'bg-[#141414] text-white shadow-sm'
                : 'text-zinc-500 hover:bg-black/5 hover:text-black dark:hover:bg-white/5 dark:hover:text-zinc-300'
            }`}
          >
            {TAB_LABEL[t]}
          </button>
        ))}
      </div>
    </>
  );

  if (tab === 'broadcasts') {
    return (
      <AppShell
        title={<CoachBrand />}
        topBar={<CoachNav />}
        headerAction={headerExtras}
        banner={header}
        mobileHeader={<Logo size={28} />}
      >
        <BroadcastsPane overview={overview} groups={groups} communications={communications} />
      </AppShell>
    );
  }

  return (
    <AppShell
      title={<CoachBrand />}
      topBar={<CoachNav />}
      headerAction={headerExtras}
      banner={header}
      mobileHeader={<Logo size={28} />}
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
