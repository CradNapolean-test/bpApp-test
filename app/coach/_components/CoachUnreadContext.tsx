'use client';

import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import {
  NO_UNREAD_MARKS,
  liveUnreadTotal,
  readSince,
  withThreadRead,
  withThreadUnread,
  withUnreadTotal,
  type UnreadMarks,
} from '@/lib/unreadMarks';

// Unread messages as this tab has seen them change (lib/unreadMarks.ts), mounted once in app/coach/layout.tsx so it outlives page
// changes. Whatever writes a read marker (a chat being viewed, Mark read / Mark unread in a list) reports it here, and the inbox lists
// (the Messages page, the drawer) report their total, so every badge and list on the page updates at once instead of on the next reload.
// Outside the coach's pages (the member's own app) there is no provider and these do nothing.
interface CoachUnreadApi {
  marks: UnreadMarks;
  markRead: (clientId: string) => void;
  markUnread: (clientId: string) => void;
  reportTotal: (value: number) => void;
}

const CoachUnreadContext = createContext<CoachUnreadApi | null>(null);

export function CoachUnreadProvider({ children }: { children: ReactNode }) {
  const [marks, setMarks] = useState<UnreadMarks>(NO_UNREAD_MARKS);
  const markRead = useCallback((clientId: string) => setMarks((m) => withThreadRead(m, clientId)), []);
  const markUnread = useCallback((clientId: string) => setMarks((m) => withThreadUnread(m, clientId)), []);
  const reportTotal = useCallback((value: number) => setMarks((m) => withUnreadTotal(m, value)), []);
  const api = useMemo(() => ({ marks, markRead, markUnread, reportTotal }), [marks, markRead, markUnread, reportTotal]);
  return <CoachUnreadContext.Provider value={api}>{children}</CoachUnreadContext.Provider>;
}

export function useCoachUnread(): CoachUnreadApi | null {
  return useContext(CoachUnreadContext);
}

// The change number at which `drawn` (a server figure, or anything that is new on every server render) arrived on screen.
function useDrawnAt(drawn: unknown, seq: number): number {
  const [seen, setSeen] = useState({ drawn, at: seq });
  if (seen.drawn !== drawn) {
    setSeen({ drawn, at: seq });
    return seq;
  }
  return seen.at;
}

// The coach's unread total for a badge: the server's figure, or an open inbox list's count made since it arrived.
export function useLiveUnreadTotal(serverTotal: number): number {
  const marks = useCoachUnread()?.marks ?? NO_UNREAD_MARKS;
  const since = useDrawnAt(serverTotal, marks.seq);
  return liveUnreadTotal(serverTotal, since, marks);
}

// For figures drawn by the server (pass something new on every server render): whether a member's conversation was read here since.
export function useReadSinceDrawn(drawn: unknown): (clientId: string) => boolean {
  const marks = useCoachUnread()?.marks ?? NO_UNREAD_MARKS;
  const since = useDrawnAt(drawn, marks.seq);
  return (clientId: string) => readSince(marks, clientId, since);
}
