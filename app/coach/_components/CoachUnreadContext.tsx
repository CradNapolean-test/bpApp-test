'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { getMyUnreadTotal } from '@/lib/data/chat';
import { createLatestOnly } from '@/lib/latestOnly';
import {
  NO_UNREAD_MARKS,
  firstSeenAt,
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
  // When each server-drawn figure first came on screen (lib/unreadMarks.ts firstSeenAt), so a page brought back by Back keeps its own.
  seen: WeakMap<object, number>;
  // Reads the coach's unread total from the server again.
  refreshTotal: () => void;
}

const CoachUnreadContext = createContext<CoachUnreadApi | null>(null);

// One read of the total for any number of asks in the same moment (the header and the sidebar come on screen together), and only the
// latest read's answer is kept. Server actions run one at a time in the order they are called (lib/latestOnly.ts), so a read asked for
// after a marker write is answered after that write.
function createTotalRefresher(apply: (value: number) => void): () => void {
  const guard = createLatestOnly();
  let asked = false;
  return () => {
    if (asked) return;
    asked = true;
    queueMicrotask(() => {
      asked = false;
      const ticket = guard.next();
      getMyUnreadTotal().then(
        (value) => {
          if (guard.isCurrent(ticket)) apply(value);
        },
        () => {}
      );
    });
  };
}

export function CoachUnreadProvider({ children }: { children: ReactNode }) {
  const [marks, setMarks] = useState<UnreadMarks>(NO_UNREAD_MARKS);
  const [seen] = useState(() => new WeakMap<object, number>());
  const [refreshTotal] = useState(() => createTotalRefresher((value) => setMarks((m) => withUnreadTotal(m, value))));
  const markRead = useCallback((clientId: string) => setMarks((m) => withThreadRead(m, clientId)), []);
  const markUnread = useCallback((clientId: string) => setMarks((m) => withThreadUnread(m, clientId)), []);
  const reportTotal = useCallback((value: number) => setMarks((m) => withUnreadTotal(m, value)), []);
  // After a read or an unread (once its marker write has been sent), the header and sidebar take the server's new total, so a badge on a
  // page the read did not happen on, or one brought back by Back, is right too.
  useEffect(() => {
    if (marks.readAt !== NO_UNREAD_MARKS.readAt) refreshTotal();
  }, [marks.readAt, refreshTotal]);
  const api = useMemo(
    () => ({ marks, markRead, markUnread, reportTotal, seen, refreshTotal }),
    [marks, markRead, markUnread, reportTotal, seen, refreshTotal]
  );
  return <CoachUnreadContext.Provider value={api}>{children}</CoachUnreadContext.Provider>;
}

export function useCoachUnread(): CoachUnreadApi | null {
  return useContext(CoachUnreadContext);
}

// The change number at which `drawn` (a server figure) arrived on screen in this component.
function useDrawnAt(drawn: unknown, seq: number): number {
  const [state, setState] = useState({ drawn, at: seq });
  if (state.drawn !== drawn) {
    setState({ drawn, at: seq });
    return seq;
  }
  return state.at;
}

// The coach's unread total for a badge: the server's figure, or a total counted (by an open inbox list, or read again from the server after
// a read) since it arrived. A badge that comes on screen after something was read in this tab reads the total again: its figure may be
// the one a page restored by Back was first drawn with.
export function useLiveUnreadTotal(serverTotal: number): number {
  const api = useCoachUnread();
  const marks = api?.marks ?? NO_UNREAD_MARKS;
  const since = useDrawnAt(serverTotal, marks.seq);
  const [readHere] = useState(() => marks.readAt !== NO_UNREAD_MARKS.readAt);
  const refreshTotal = api?.refreshTotal;
  useEffect(() => {
    if (readHere) refreshTotal?.();
  }, [readHere, refreshTotal]);
  return liveUnreadTotal(serverTotal, since, marks);
}

// For figures drawn by the server (an object from the page's server render, new on every one): whether a member's conversation was read
// here since they first came on screen. Keyed on the object rather than on this component, so a page brought back by Back (the same
// objects, a newly mounted component) still drops a conversation read on the page after it.
export function useReadSinceDrawn(drawn: object): (clientId: string) => boolean {
  const api = useCoachUnread();
  const marks = api?.marks ?? NO_UNREAD_MARKS;
  const since = api ? firstSeenAt(api.seen, drawn, marks.seq) : marks.seq;
  return (clientId: string) => readSince(marks, clientId, since);
}
