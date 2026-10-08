'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ArrowLeft, MessageSquare } from 'lucide-react';
import { AppShell } from '@/app/_components/AppShell';
import { ClientOnly } from '@/app/_components/ClientOnly';
import { Avatar } from '@/app/_components/Avatar';
import { CoachNav } from '@/app/coach/_components/CoachNav';
import { CoachBrand } from '@/app/coach/_components/CoachBrand';
import { HubTabBar } from '@/app/coach/_components/HubTabBar';
import { CoachMobileBrand } from '@/app/coach/_components/CoachMobileBrand';
import { CoachBottomTabBar } from '@/app/coach/_components/CoachBottomTabBar';
import { EmptyState } from '@/app/_components/EmptyState';
import { ChatTab } from '@/app/dashboard/_components/ChatTab';
import { useCoachMessages } from '@/app/coach/_components/useCoachMessages';
import { ConversationList } from '@/app/coach/_components/ConversationList';
import { BroadcastsPane } from './BroadcastsPane';
import type { ChatOverviewRow, ClientGroupWithMembers, MessageTemplateRow, ScheduledCommunicationRow } from '@/lib/data/types';

type Tab = 'inbox' | 'broadcasts';

const TAB_LABEL: Record<Tab, string> = { inbox: 'Conversations', broadcasts: 'Broadcasts' };

export function MessagesHubShell({
  overview,
  currentUserId,
  groups,
  communications,
  templates,
  counts,
  email,
}: {
  overview: ChatOverviewRow[];
  currentUserId: string;
  groups: ClientGroupWithMembers[];
  communications: ScheduledCommunicationRow[];
  templates: MessageTemplateRow[];
  counts: { mine: number; gym: number };
  email: string;
}) {
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<Tab>(() => (searchParams.get('tab') === 'broadcasts' ? 'broadcasts' : 'inbox'));
  // Phone only: whether a conversation is open (otherwise the list shows).
  const [threadOpen, setThreadOpen] = useState(false);
  const { localOverview, selected, selectClient, messages, loading, selectedClient } = useCoachMessages(
    overview,
    currentUserId
  );

  // Only run once, on mount -- selecting a different client afterwards is user-driven, via the
  // onClick handlers below, not this effect.
  const autoSelected = useRef(false);
  useEffect(() => {
    if (autoSelected.current) return;
    if (overview[0] && window.matchMedia('(min-width: 768px)').matches) {
      autoSelected.current = true;
      selectClient(overview[0].client_id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overview]);

  // No CoachMessagesButton in the header here on purpose -- being on this page already is
  // the messages experience; opening the MessagesDrawer on top of it double-mounts a
  // second ChatTab for the same client, which throws (verified) on the shared realtime
  // channel name ("cannot add postgres_changes callbacks ... after subscribe()").
  function pick(clientId: string) {
    selectClient(clientId);
    setThreadOpen(true);
  }

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
      <h1 className="mb-4 mt-3 text-2xl font-bold text-black md:mt-0 dark:text-zinc-50">Messages</h1>
      <HubTabBar
        tabs={['Conversations', 'Broadcasts'] as const}
        active={TAB_LABEL[tab] as 'Conversations' | 'Broadcasts'}
        onSelect={(t) => setTab(t === 'Broadcasts' ? 'broadcasts' : 'inbox')}
      />
    </>
  );

  return (
    <ClientOnly fallback={<div className="min-h-screen" />}>
      <AppShell
        title={<CoachBrand />}
        topBar={<CoachNav />}
        bottomBar={<CoachBottomTabBar />}
        headerAction={headerExtras}
        banner={header}
        mobileHeader={<CoachMobileBrand />}
        sidebar={tab === 'inbox' ? <ConversationList overview={localOverview} selected={selected} onSelect={pick} /> : undefined}
      >
        {tab === 'broadcasts' ? (
          <BroadcastsPane groups={groups} communications={communications} templates={templates} counts={counts} />
        ) : (
          <>
            {/* Phone: a conversation list first, then the thread with a back arrow. The sidebar
                list is desktop-only, so the list is repeated here for small screens. */}
            <div className={threadOpen ? 'hidden' : 'md:hidden'}>
              <ConversationList overview={localOverview} selected={selected} onSelect={pick} />
            </div>
            <div className={threadOpen ? '' : 'hidden md:block'}>
              {selected && (
                <button
                  type="button"
                  onClick={() => setThreadOpen(false)}
                  className="mb-3 flex items-center gap-1.5 text-sm font-medium text-zinc-500 md:hidden"
                >
                  <ArrowLeft className="h-4 w-4" /> All conversations
                </button>
              )}
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
            </div>
          </>
        )}
      </AppShell>
    </ClientOnly>
  );
}
