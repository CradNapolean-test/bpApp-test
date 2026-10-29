import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { NotificationRow } from '@ballistic/shared/data/types';

import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';

function useUserId() {
  const { session } = useSession();
  const id = session?.user.id;
  if (!id) throw new Error('Signed-in screens need a session');
  return id;
}

// Postgres "undefined column": a database without migration 0086 has no cleared_at, so notifications fall back to the
// old behaviour (the unread ones only) instead of breaking, as the web does.
const NO_CLEARED_COLUMN = '42703';

// Everything the member has not cleared (seen or not), newest first.
export function useNotifications() {
  const userId = useUserId();
  return useQuery({
    queryKey: ['notifications', userId],
    queryFn: async (): Promise<NotificationRow[]> => {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('client_id', userId)
        .is('cleared_at', null)
        .order('created_at', { ascending: false })
        .limit(50);
      if (!error) return (data ?? []) as NotificationRow[];
      if (error.code !== NO_CLEARED_COLUMN) throw error;
      const legacy = await supabase.from('notifications').select('*').eq('client_id', userId).is('read_at', null).order('created_at', { ascending: false });
      if (legacy.error) throw legacy.error;
      return (legacy.data ?? []) as NotificationRow[];
    },
  });
}

// How many are unseen: the dot on the bell. Checked on every app start (the saved copy may predate new ones).
// Shown in the header on every screen; only the app layout passes `onStart` (check once when the app opens, not on
// every screen that mounts a header).
export function useUnreadNotifications(onStart = false) {
  const userId = useUserId();
  return useQuery({
    queryKey: ['notifications-unread', userId],
    staleTime: 60_000,
    refetchOnMount: onStart ? 'always' : true,
    queryFn: async (): Promise<number> => {
      const q = supabase.from('notifications').select('id', { count: 'exact', head: true }).eq('client_id', userId).is('read_at', null);
      const { count, error } = await q.is('cleared_at', null);
      if (!error) return count ?? 0;
      if (error.code !== NO_CLEARED_COLUMN) throw error;
      const legacy = await supabase.from('notifications').select('id', { count: 'exact', head: true }).eq('client_id', userId).is('read_at', null);
      if (legacy.error) throw legacy.error;
      return legacy.count ?? 0;
    },
  });
}

function useCaches() {
  const userId = useUserId();
  const qc = useQueryClient();
  const listKey = ['notifications', userId];
  const unreadKey = ['notifications-unread', userId];
  return { userId, qc, listKey, unreadKey };
}

// Opening the screen marks everything seen (the dot goes) in one update; the notifications stay until cleared.
export function useMarkNotificationsSeen() {
  const { userId, qc, listKey, unreadKey } = useCaches();
  return useMutation({
    mutationFn: async () => {
      const now = new Date().toISOString();
      const { error } = await supabase.from('notifications').update({ read_at: now }).eq('client_id', userId).is('read_at', null);
      if (error) throw error;
      return now;
    },
    onSuccess: (now) => {
      qc.setQueryData<number>(unreadKey, 0);
      qc.setQueryData<NotificationRow[]>(listKey, (p) => p?.map((n) => (n.read_at ? n : { ...n, read_at: now })));
    },
  });
}

export function useClearNotification() {
  const { qc, listKey, unreadKey } = useCaches();
  return useMutation({
    mutationFn: async (id: string) => {
      const now = new Date().toISOString();
      const { error } = await supabase.from('notifications').update({ cleared_at: now, read_at: now }).eq('id', id);
      if (error) throw error;
    },
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: listKey });
      const before = qc.getQueryData<NotificationRow[]>(listKey);
      qc.setQueryData<NotificationRow[]>(listKey, (p) => p?.filter((n) => n.id !== id));
      return { before };
    },
    onError: (_e, _id, ctx) => qc.setQueryData(listKey, ctx?.before),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: listKey });
      qc.invalidateQueries({ queryKey: unreadKey });
    },
  });
}

export function useClearAllNotifications() {
  const { userId, qc, listKey, unreadKey } = useCaches();
  return useMutation({
    mutationFn: async () => {
      const now = new Date().toISOString();
      const { error } = await supabase.from('notifications').update({ cleared_at: now, read_at: now }).eq('client_id', userId).is('cleared_at', null);
      if (error) throw error;
    },
    onMutate: async () => {
      await qc.cancelQueries({ queryKey: listKey });
      const before = qc.getQueryData<NotificationRow[]>(listKey);
      qc.setQueryData<NotificationRow[]>(listKey, []);
      qc.setQueryData<number>(unreadKey, 0);
      return { before };
    },
    onError: (_e, _v, ctx) => qc.setQueryData(listKey, ctx?.before),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: listKey });
      qc.invalidateQueries({ queryKey: unreadKey });
    },
  });
}
