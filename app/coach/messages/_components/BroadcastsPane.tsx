'use client';

import { useMemo, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { useAction } from '@/app/_components/useAction';
import { useConfirm } from '@/app/_components/ConfirmDialog';
import { EmptyState } from '@/app/_components/EmptyState';
import { composeCommunication, deleteCommunication } from '@/lib/data/communications';
import type { ChatOverviewRow, ClientGroupWithMembers, ScheduledCommunicationRow } from '@/lib/data/types';

type Target = 'all_clients' | 'group';
type Channel = 'message' | 'email' | 'both';

export function BroadcastsPane({
  overview,
  groups,
  communications,
}: {
  overview: ChatOverviewRow[];
  groups: ClientGroupWithMembers[];
  communications: ScheduledCommunicationRow[];
}) {
  const { run, busy } = useAction();
  const confirm = useConfirm();

  const [message, setMessage] = useState('');
  const [target, setTarget] = useState<Target>('all_clients');
  const [groupId, setGroupId] = useState<string>(groups[0]?.id ?? '');
  const [timing, setTiming] = useState<'now' | 'later'>('now');
  const [scheduleAt, setScheduleAt] = useState('');
  const [channel, setChannel] = useState<Channel>('message');

  const audience = useMemo(() => {
    if (target === 'all_clients') return overview.map((c) => c.client_id);
    return groups.find((g) => g.id === groupId)?.memberIds ?? [];
  }, [target, groupId, overview, groups]);

  const canSubmit =
    message.trim().length > 0 &&
    (target === 'all_clients' || groupId) &&
    (timing === 'now' || scheduleAt) &&
    !busy;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    const sendAt = timing === 'now' ? new Date().toISOString() : new Date(scheduleAt).toISOString();
    const targetArg = target === 'all_clients' ? { type: 'all_clients' as const } : { type: 'group' as const, groupId };
    await run(() => composeCommunication(message.trim(), targetArg, sendAt, audience, channel), {
      success: timing === 'now' ? `Sent to ${audience.length} client${audience.length === 1 ? '' : 's'}` : 'Scheduled',
      onDone: () => setMessage(''),
    });
  }

  async function handleDelete(id: string) {
    if (!(await confirm({ title: 'Delete this broadcast?', destructive: true }))) return;
    await run(() => deleteCommunication(id));
  }

  return (
    <div className="space-y-6">
      <form onSubmit={handleSubmit} className="space-y-3 rounded-2xl border border-black/10 p-4 dark:border-white/10">
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Write a message to send to a group or your whole roster…"
          rows={3}
          className="w-full resize-none rounded-xl border border-black/10 bg-black/[0.03] px-3 py-2 text-sm outline-none focus:border-accent dark:border-white/10 dark:bg-white/5"
        />

        <div className="flex flex-wrap items-center gap-4 text-sm">
          <label className="flex items-center gap-1.5">
            <input type="radio" checked={target === 'all_clients'} onChange={() => setTarget('all_clients')} />
            All clients
          </label>
          <label className="flex items-center gap-1.5">
            <input
              type="radio"
              checked={target === 'group'}
              onChange={() => setTarget('group')}
              disabled={groups.length === 0}
            />
            Group
          </label>
          {target === 'group' && (
            <select
              value={groupId}
              onChange={(e) => setGroupId(e.target.value)}
              className="rounded-md border border-black/10 bg-transparent px-2 py-1 text-sm dark:border-white/10"
            >
              {groups.length === 0 && <option value="">No groups yet</option>}
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name} ({g.memberIds.length})
                </option>
              ))}
            </select>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-4 text-sm">
          <span className="text-xs font-medium text-zinc-500">Channel:</span>
          <label className="flex items-center gap-1.5">
            <input type="radio" checked={channel === 'message'} onChange={() => setChannel('message')} />
            Message
          </label>
          <label className="flex items-center gap-1.5">
            <input type="radio" checked={channel === 'email'} onChange={() => setChannel('email')} />
            Email
          </label>
          <label className="flex items-center gap-1.5">
            <input type="radio" checked={channel === 'both'} onChange={() => setChannel('both')} />
            Both
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-4 text-sm">
          <label className="flex items-center gap-1.5">
            <input type="radio" checked={timing === 'now'} onChange={() => setTiming('now')} />
            Send now
          </label>
          <label className="flex items-center gap-1.5">
            <input type="radio" checked={timing === 'later'} onChange={() => setTiming('later')} />
            Schedule
          </label>
          {timing === 'later' && (
            <input
              type="datetime-local"
              value={scheduleAt}
              onChange={(e) => setScheduleAt(e.target.value)}
              className="rounded-md border border-black/10 bg-transparent px-2 py-1 text-sm dark:border-white/10"
            />
          )}
        </div>

        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-zinc-500">
            This will message {audience.length} client{audience.length === 1 ? '' : 's'}.
          </p>
          <button
            type="submit"
            disabled={!canSubmit}
            className="rounded-md bg-accent px-4 py-1.5 text-sm font-medium text-accent-foreground disabled:opacity-50"
          >
            {timing === 'now' ? 'Send' : 'Schedule'}
          </button>
        </div>
      </form>

      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-black dark:text-zinc-50">History</h3>
        {communications.length === 0 && <EmptyState compact title="No broadcasts yet." />}
        {communications.map((c) => {
          const group = c.target_group_id ? groups.find((g) => g.id === c.target_group_id) : null;
          const targetLabel = c.target_type === 'all_clients' ? 'All clients' : (group?.name ?? 'Group');
          const isSent = c.sent_at != null;
          const showsMessage = c.channel === 'message' || c.channel === 'both';
          const showsEmail = c.channel === 'email' || c.channel === 'both';
          const isEmailSent = c.email_sent_at != null;
          return (
            <div
              key={c.id}
              className="flex items-start justify-between gap-3 rounded-xl border border-black/10 p-3 text-sm dark:border-white/10"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-zinc-900 dark:text-zinc-100">{c.message}</p>
                <p className="mt-0.5 text-xs text-zinc-500">
                  {targetLabel} · {new Date(c.send_at).toLocaleString()}
                  {showsMessage && (
                    <>
                      {' · Message: '}
                      <span className={isSent ? 'text-accent' : 'text-zinc-500'}>{isSent ? 'Sent' : 'Scheduled'}</span>
                    </>
                  )}
                  {showsEmail && (
                    <>
                      {' · Email: '}
                      <span className={isEmailSent ? 'text-accent' : 'text-zinc-500'}>{isEmailSent ? 'Sent' : 'Scheduled'}</span>
                    </>
                  )}
                </p>
              </div>
              {!isSent && (
                <button
                  onClick={() => handleDelete(c.id)}
                  aria-label="Delete broadcast"
                  className="shrink-0 rounded-md p-1 text-zinc-400 hover:bg-black/5 hover:text-danger dark:hover:bg-white/5"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
