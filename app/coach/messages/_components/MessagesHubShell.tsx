'use client';

import { useState } from 'react';
import { formatLongDate } from '@/lib/utils/dates';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ArrowLeft, MessageSquare } from 'lucide-react';
import { AppShell } from '@/app/_components/AppShell';
import { ClientOnly } from '@/app/_components/ClientOnly';
import { PageSkeleton } from '@/app/_components/PageSkeleton';
import { Avatar } from '@/app/_components/Avatar';
import { CoachNav } from '@/app/coach/_components/CoachNav';
import { CoachBrand } from '@/app/coach/_components/CoachBrand';
import { HubTabBar } from '@/app/coach/_components/HubTabBar';
import { writeTabToUrl } from '@/app/coach/_components/tabUrl';
import { CoachMobileBrand } from '@/app/coach/_components/CoachMobileBrand';
import { CoachBottomTabBar } from '@/app/coach/_components/CoachBottomTabBar';
import { EmptyState } from '@/app/_components/EmptyState';
import { ChatTab } from '@/app/dashboard/_components/ChatTab';
import { useCoachMessages } from '@/app/coach/_components/useCoachMessages';
import { ConversationList } from '@/app/coach/_components/ConversationList';
import { useFitToWindow } from '@/app/coach/_components/useFitToWindow';
import { BroadcastsPane } from './BroadcastsPane';
import type { ChatOverviewRow, ClientGroupWithMembers, MessageTemplateRow, ScheduledCommunicationRow } from '@/lib/data/types';
import type { EmailSkipReason } from '@/lib/emailConfig';

type Tab = 'inbox' | 'broadcasts';

const TAB_LABEL: Record<Tab, string> = { inbox: 'Conversations', broadcasts: 'Broadcasts' };

export function MessagesHubShell({
  overview,
  currentUserId,
  groups,
  communications,
  templates,
  counts,
  timezone,
  email,
  emailOff = null,
}: {
  overview: ChatOverviewRow[];
  currentUserId: string;
  groups: ClientGroupWithMembers[];
  communications: ScheduledCommunicationRow[];
  templates: MessageTemplateRow[];
  counts: { mine: number; gym: number };
  // The gym's own timezone, for scheduling and for the dates shown (R25).
  timezone: string | null;
  email: string;
  // Why the app cannot send email right now (null when it can), for Broadcasts' "Send as".
  emailOff?: EmailSkipReason | null;
}) {
  const searchParams = useSearchParams();
  const [tab, setTabState] = useState<Tab>(() => (searchParams.get('tab') === 'broadcasts' ? 'broadcasts' : 'inbox'));
  // The address says ?tab=broadcasts for Broadcasts and nothing for the inbox, so a reload opens the same tab.
  const setTab = (next: Tab) => {
    setTabState(next);
    writeTabToUrl(next === 'broadcasts' ? 'broadcasts' : null);
  };
  // Phone only: whether a conversation is open (otherwise the list shows).
  const [threadOpen, setThreadOpen] = useState(false);
  const phoneThread = tab === 'inbox' && threadOpen;
  const { localOverview, selected, selectClient, markRead, markUnread, messages, loading, loadError, loadId, retryLoad, selectedClient } =
    useCoachMessages(overview, currentUserId);
  // On a wide screen the open conversation fills the rest of the window (the page's own 40px padding under it), so the reply box is
  // always on screen and switching conversations does not change the page's height (it used to shrink to "Loading…" and jump).
  // On a phone an open conversation does the same down to the bottom tab bar (72px, with 8px to spare): its reply box used to start
  // under the tab bar, so every reply needed a page scroll (MS27).
  const [threadRef, threadHeight] = useFitToWindow({
    bottomGap: 40,
    min: 360,
    enabled: tab === 'inbox',
    phoneBottomGap: phoneThread ? 80 : undefined,
  });

  // Nothing is opened on arrival: opening a thread marks it read, so auto-selecting the newest one on a wide screen cleared its unread
  // badge without the coach ever looking at it (R29). The coach picks a conversation.

  // No CoachMessagesButton in the header here on purpose -- being on this page already is
  // the messages experience; opening the MessagesDrawer on top of it double-mounts a
  // second ChatTab for the same client, which throws (verified) on the shared realtime
  // channel name ("cannot add postgres_changes callbacks ... after subscribe()").
  function pick(clientId: string) {
    selectClient(clientId);
    setThreadOpen(true);
    // On a phone the list is swapped for the thread: start it at the top of the page, not wherever the list had been scrolled to.
    if (!window.matchMedia('(min-width: 768px)').matches) window.scrollTo(0, 0);
  }

  const todayLabel = formatLongDate(new Date());
  const headerExtras = (
    <div className="flex items-center gap-3">
      <span className="hidden text-sm text-zinc-500 sm:inline">{todayLabel}</span>
      <Link href="/coach/settings" aria-label="Account settings">
        <Avatar name={email} size="md" variant="self" />
      </Link>
    </div>
  );

  // On a phone the title and tabs step aside while a conversation is open, so the thread has the screen (MS27); "All conversations"
  // goes back to them.
  const header = (
    <div className={phoneThread ? 'hidden md:block' : undefined}>
      <h1 className="mb-4 mt-3 text-2xl font-bold text-black md:mt-0 dark:text-zinc-50">Messages</h1>
      <HubTabBar
        label="Messages sections"
        tabs={['Conversations', 'Broadcasts'] as const}
        active={TAB_LABEL[tab] as 'Conversations' | 'Broadcasts'}
        onSelect={(t) => setTab(t === 'Broadcasts' ? 'broadcasts' : 'inbox')}
      />
    </div>
  );

  return (
    <ClientOnly fallback={<PageSkeleton />}>
      <AppShell
        title={<CoachBrand />}
        topBar={<CoachNav />}
        bottomBar={<CoachBottomTabBar />}
        headerAction={headerExtras}
        banner={header}
        mobileHeader={<CoachMobileBrand />}
        wideSidebar
        sidebar={
          tab === 'inbox' ? (
            <ConversationList
              overview={localOverview}
              selected={selected}
              onSelect={pick}
              onMarkRead={markRead}
              onMarkUnread={markUnread}
              currentUserId={currentUserId}
              fitToWindow
            />
          ) : undefined
        }
      >
        {tab === 'broadcasts' ? (
          <BroadcastsPane groups={groups} communications={communications} templates={templates} counts={counts} timezone={timezone} emailOff={emailOff} />
        ) : (
          <>
            {/* Phone: a conversation list first, then the thread with a back arrow. The sidebar
                list is desktop-only, so the list is repeated here for small screens. */}
            <div className={threadOpen ? 'hidden' : 'md:hidden'}>
              <ConversationList
                overview={localOverview}
                selected={selected}
                onSelect={pick}
                onMarkRead={markRead}
                onMarkUnread={markUnread}
                currentUserId={currentUserId}
              />
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
              {/* Measured below the back link, so on a phone the thread (not the link with it) is what fits above the tab bar. */}
              <div ref={threadRef} style={threadHeight != null ? { height: threadHeight } : undefined}>
              {!selected ? (
                localOverview.length > 0 ? (
                  <EmptyState icon={MessageSquare} title="Choose a conversation" hint="Pick a member from the list to read and reply." />
                ) : (
                  <EmptyState
                    icon={MessageSquare}
                    title="No conversations yet"
                    hint="Once you have clients, their threads will show up here."
                  />
                )
              ) : loadError ? (
                <div className="text-sm text-zinc-500">
                  <p>We could not load this conversation.</p>
                  <button type="button" onClick={retryLoad} className="mt-2 rounded-full bg-accent px-4 py-1.5 text-xs font-bold text-white">
                    Try again
                  </button>
                </div>
              ) : loading ? (
                <p className="text-sm text-zinc-500">Loading messages…</p>
              ) : (
                <ChatTab
                  key={`${selected}:${loadId}`}
                  clientId={selected}
                  initialMessages={messages}
                  currentUserId={currentUserId}
                  otherPartyName={selectedClient?.client_name ?? 'Client'}
                  fill={threadHeight != null}
                  // The same key as the chat on the member's page, so a half-written reply follows the coach between the two.
                  draftKey={`coach-${selected}`}
                  memberHref={`/coach/clients/${selected}`}
                  onMarkUnread={() => {
                    markUnread(selected);
                    setThreadOpen(false);
                  }}
                />
              )}
              </div>
            </div>
          </>
        )}
      </AppShell>
    </ClientOnly>
  );
}
