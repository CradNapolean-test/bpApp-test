'use client';

import { useMemo, useRef, useState } from 'react';
import { Repeat, Trash2 } from 'lucide-react';
import { BottomSheet } from '@/app/_components/BottomSheet';
import { useAction } from '@/app/_components/useAction';
import { useConfirm } from '@/app/_components/ConfirmDialog';
import { EmptyState } from '@/app/_components/EmptyState';
import { Segmented } from '@/app/_components/ui';
import { composeCommunication, deleteCommunication } from '@/lib/data/communications';
import { deleteMessageTemplate, saveMessageTemplate } from '@/lib/data/messageTemplates';
import { FIRST_NAME_TOKEN, STARTER_MESSAGES } from '@/lib/broadcastMessages';
import type { ClientGroupWithMembers, MessageTemplateRow, ScheduledCommunicationRow } from '@/lib/data/types';

type Target = 'my_clients' | 'gym' | 'group';
type Channel = 'message' | 'email' | 'both';

const field = 'w-full rounded-xl border border-black/10 bg-transparent px-3.5 py-2.5 text-base dark:border-white/10';

const when = (iso: string) =>
  new Date(iso).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

function TemplatesSheet({
  templates,
  currentMessage,
  onUse,
  onClose,
}: {
  templates: MessageTemplateRow[];
  currentMessage: string;
  onUse: (body: string) => void;
  onClose: () => void;
}) {
  const { run, busy } = useAction();
  const confirm = useConfirm();
  const [title, setTitle] = useState('');
  const canSave = currentMessage.trim().length > 0;
  const row = 'rounded-xl border border-black/[.06] p-3 dark:border-white/10';

  return (
    <BottomSheet title="Message templates" onClose={onClose}>
      <div className="space-y-5">
        {canSave && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!title.trim()) return;
              run(() => saveMessageTemplate(title.trim(), currentMessage.trim()), { success: 'Template saved', onDone: () => setTitle('') });
            }}
            className="space-y-2"
          >
            <p className="text-xs font-medium text-zinc-500">Save what you&apos;ve written as a template</p>
            <div className="flex gap-2">
              <input className={field} placeholder="Template name" value={title} onChange={(e) => setTitle(e.target.value)} />
              <button type="submit" disabled={busy || !title.trim()} className="shrink-0 rounded-full bg-accent px-4 text-sm font-bold text-accent-foreground disabled:opacity-50">
                Save
              </button>
            </div>
          </form>
        )}

        <div className="space-y-2">
          <p className="text-xs font-medium text-zinc-500">Your gym&apos;s templates</p>
          {templates.length === 0 && <p className="text-sm text-zinc-500">None yet. Write a message and save it above, or start from one below.</p>}
          {templates.map((t) => (
            <div key={t.id} className={row}>
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-bold text-black dark:text-zinc-50">{t.title}</p>
                <div className="flex shrink-0 items-center gap-1">
                  <button type="button" onClick={() => onUse(t.body)} className="rounded-full px-2.5 py-1 text-sm font-semibold text-accent hover:bg-accent/10">
                    Use
                  </button>
                  <button
                    type="button"
                    aria-label={`Delete ${t.title}`}
                    onClick={async () => {
                      if (await confirm({ title: `Delete “${t.title}”?`, destructive: true })) run(() => deleteMessageTemplate(t.id), { success: 'Deleted' });
                    }}
                    className="rounded-md p-1 text-zinc-400 hover:text-danger"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <p className="mt-1 line-clamp-2 text-xs text-zinc-500">{t.body}</p>
            </div>
          ))}
        </div>

        <div className="space-y-2">
          <p className="text-xs font-medium text-zinc-500">Starting points</p>
          {STARTER_MESSAGES.map((m) => (
            <div key={m.title} className={row}>
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-bold text-black dark:text-zinc-50">{m.title}</p>
                <button type="button" onClick={() => onUse(m.body)} className="shrink-0 rounded-full px-2.5 py-1 text-sm font-semibold text-accent hover:bg-accent/10">
                  Use
                </button>
              </div>
              <p className="mt-1 line-clamp-2 text-xs text-zinc-500">{m.body}</p>
            </div>
          ))}
        </div>
      </div>
    </BottomSheet>
  );
}

export function BroadcastsPane({
  groups,
  communications,
  templates,
  counts,
}: {
  groups: ClientGroupWithMembers[];
  communications: ScheduledCommunicationRow[];
  templates: MessageTemplateRow[];
  counts: { mine: number; gym: number };
}) {
  const { run, busy } = useAction();
  const confirm = useConfirm();
  const textRef = useRef<HTMLTextAreaElement>(null);

  const [message, setMessage] = useState('');
  const [target, setTarget] = useState<Target>('my_clients');
  const [groupId, setGroupId] = useState<string>(groups[0]?.id ?? '');
  const [timing, setTiming] = useState<'now' | 'later'>('now');
  const [scheduleAt, setScheduleAt] = useState('');
  const [repeat, setRepeat] = useState(false);
  const [channel, setChannel] = useState<Channel>('message');
  const [showTemplates, setShowTemplates] = useState(false);

  const audienceCount = target === 'my_clients' ? counts.mine : target === 'gym' ? counts.gym : (groups.find((g) => g.id === groupId)?.memberIds.length ?? 0);
  const weekday = scheduleAt ? new Date(scheduleAt).toLocaleDateString('en-GB', { weekday: 'long' }) : null;

  const canSubmit =
    message.trim().length > 0 && (target !== 'group' || groupId) && (timing === 'now' || scheduleAt) && !busy;

  function insertFirstName() {
    const el = textRef.current;
    if (!el) {
      setMessage((m) => `${m}${FIRST_NAME_TOKEN}`);
      return;
    }
    const start = el.selectionStart ?? message.length;
    const end = el.selectionEnd ?? message.length;
    const next = message.slice(0, start) + FIRST_NAME_TOKEN + message.slice(end);
    setMessage(next);
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + FIRST_NAME_TOKEN.length;
      el.setSelectionRange(pos, pos);
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    if (timing === 'now' && target === 'gym') {
      const ok = await confirm({
        title: `Send to the whole gym?`,
        body: `This goes to all ${counts.gym} client${counts.gym === 1 ? '' : 's'} at the gym, including other coaches' clients.`,
      });
      if (!ok) return;
    }
    const sendAt = timing === 'now' ? new Date().toISOString() : new Date(scheduleAt).toISOString();
    const isRepeat = timing === 'later' && repeat;
    await run(
      () => composeCommunication({ message: message.trim(), target, groupId, sendAt, channel, repeat: isRepeat ? 'weekly' : 'none' }),
      {
        success: isRepeat ? `Repeating every ${weekday}` : timing === 'now' ? `Sent to ${audienceCount} client${audienceCount === 1 ? '' : 's'}` : 'Scheduled',
        onDone: () => {
          setMessage('');
          setRepeat(false);
        },
      }
    );
  }

  async function handleDelete(c: ScheduledCommunicationRow) {
    const series = c.repeat === 'weekly';
    const ok = await confirm({
      title: series ? 'Stop this repeating message?' : 'Delete this broadcast?',
      body: series ? 'Nothing more will be sent. Messages already sent stay in the history.' : undefined,
      destructive: true,
      confirmLabel: series ? 'Stop' : 'Delete',
    });
    if (ok) run(() => deleteCommunication(c.id));
  }

  const series = communications.filter((c) => c.repeat === 'weekly' && c.sent_at == null);
  const history = communications.filter((c) => !(c.repeat === 'weekly' && c.sent_at == null));
  const targetLabel = (c: ScheduledCommunicationRow) =>
    c.target_type === 'my_clients'
      ? 'Their own clients'
      : c.target_type === 'group'
        ? (groups.find((g) => g.id === c.target_group_id)?.name ?? 'Group')
        : 'Whole gym';
  const channelLabel = useMemo(() => ({ message: 'Message', email: 'Email', both: 'Message and email' }), []);

  return (
    <div className="space-y-6">
      <form onSubmit={handleSubmit} className="space-y-4 rounded-2xl border border-black/[.05] bg-card p-4 shadow-[0_1px_2px_rgba(0,0,0,.02)] dark:border-white/10">
        <h2 className="text-sm font-bold text-black dark:text-zinc-50">New broadcast</h2>

        <div className="space-y-2">
          <textarea
            ref={textRef}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Write a message to send to your clients, a group or the whole gym…"
            rows={5}
            className={`${field} resize-none`}
          />
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={insertFirstName} className="rounded-full border border-black/10 px-3 py-1.5 text-xs font-bold text-zinc-700 dark:border-white/15 dark:text-zinc-200">
              + First name
            </button>
            <button type="button" onClick={() => setShowTemplates(true)} className="rounded-full border border-black/10 px-3 py-1.5 text-xs font-bold text-zinc-700 dark:border-white/15 dark:text-zinc-200">
              Templates
            </button>
          </div>
          {message.includes(FIRST_NAME_TOKEN) && (
            <p className="text-xs text-zinc-500">“{FIRST_NAME_TOKEN}” becomes each person&apos;s own first name when it is sent.</p>
          )}
        </div>

        <div className="space-y-1.5">
          <p className="text-xs font-medium text-zinc-500">To</p>
          <div className="flex flex-wrap items-center gap-2">
            <Segmented
              size="md"
              label="Audience"
              value={target}
              onChange={setTarget}
              options={[
                { value: 'my_clients', label: 'My clients' },
                { value: 'gym', label: 'Whole gym' },
                { value: 'group', label: 'A group', disabled: groups.length === 0 },
              ]}
            />
            {target === 'group' && (
              <select value={groupId} onChange={(e) => setGroupId(e.target.value)} className={`${field} w-auto`}>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name} ({g.memberIds.length})
                  </option>
                ))}
              </select>
            )}
          </div>
          {target === 'gym' && <p className="text-xs text-zinc-500">Includes other coaches&apos; clients, handy when a coach is away.</p>}
        </div>

        <div className="space-y-1.5">
          <p className="text-xs font-medium text-zinc-500">Send as</p>
          <Segmented
              size="md"
            label="Channel"
            value={channel}
            onChange={setChannel}
            options={[
              { value: 'message', label: 'Message' },
              { value: 'email', label: 'Email' },
              { value: 'both', label: 'Both' },
            ]}
          />
        </div>

        <div className="space-y-1.5">
          <p className="text-xs font-medium text-zinc-500">When</p>
          <div className="flex flex-wrap items-center gap-2">
            <Segmented
              size="md"
              label="Timing"
              value={timing}
              onChange={(v) => {
                setTiming(v);
                if (v === 'now') setRepeat(false);
              }}
              options={[
                { value: 'now', label: 'Send now' },
                { value: 'later', label: 'Schedule' },
              ]}
            />
            {timing === 'later' && (
              <input type="datetime-local" value={scheduleAt} onChange={(e) => setScheduleAt(e.target.value)} className={`${field} w-auto`} />
            )}
          </div>
          {timing === 'later' && (
            <label className="flex items-center gap-2.5 pt-1 text-sm text-zinc-700 dark:text-zinc-300">
              <input type="checkbox" checked={repeat} onChange={(e) => setRepeat(e.target.checked)} />
              {weekday ? `Repeat every ${weekday} at this time` : 'Repeat every week at this time'}
            </label>
          )}
        </div>

        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-zinc-500">
            {repeat ? 'Goes to ' : 'This will message '}
            {audienceCount} client{audienceCount === 1 ? '' : 's'}
            {repeat ? ' each week.' : '.'}
          </p>
          <button type="submit" disabled={!canSubmit} className="rounded-full bg-accent px-5 py-2.5 text-sm font-bold text-accent-foreground disabled:opacity-50">
            {timing === 'now' ? 'Send now' : repeat ? 'Start repeating' : 'Schedule'}
          </button>
        </div>
      </form>

      {series.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-bold text-black dark:text-zinc-50">Repeating</h3>
          {series.map((c) => (
            <div key={c.id} className="flex items-start justify-between gap-3 rounded-2xl border border-accent/30 bg-accent-soft p-3.5 text-sm">
              <div className="min-w-0 flex-1">
                <p className="line-clamp-2 text-zinc-900 dark:text-zinc-100">{c.message}</p>
                <p className="mt-1 flex items-center gap-1.5 text-xs font-semibold text-accent">
                  <Repeat className="h-3 w-3" /> Every {new Date(c.send_at).toLocaleDateString('en-GB', { weekday: 'long' })} · next {when(c.send_at)}
                </p>
                <p className="text-xs text-zinc-500">
                  {targetLabel(c)} · {channelLabel[c.channel]}
                </p>
              </div>
              <button onClick={() => handleDelete(c)} className="shrink-0 rounded-full px-3 py-1 text-xs font-bold text-danger hover:bg-danger/10">
                Stop
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="space-y-2">
        <h3 className="text-sm font-bold text-black dark:text-zinc-50">Scheduled &amp; sent</h3>
        {history.length === 0 && <EmptyState compact title="No broadcasts yet." />}
        {history.map((c) => {
          const isSent = c.sent_at != null;
          const showsEmail = c.channel === 'email' || c.channel === 'both';
          return (
            <div key={c.id} className="flex items-start justify-between gap-3 rounded-2xl border border-black/[.05] bg-card p-3.5 text-sm shadow-[0_1px_2px_rgba(0,0,0,.02)] dark:border-white/10">
              <div className="min-w-0 flex-1">
                <p className="line-clamp-3 whitespace-pre-wrap text-zinc-900 dark:text-zinc-100">{c.message}</p>
                <p className="mt-1 text-xs text-zinc-500">
                  {targetLabel(c)} · {channelLabel[c.channel]} · {isSent ? 'Sent' : 'Scheduled for'} {when(isSent ? (c.sent_at as string) : c.send_at)}
                  {c.series_id && ' · weekly'}
                  {showsEmail && isSent && <span className={c.email_sent_at ? ' text-accent' : ''}>{c.email_sent_at ? ' · email sent' : ' · email waiting'}</span>}
                </p>
              </div>
              {!isSent && (
                <button onClick={() => handleDelete(c)} aria-label="Delete broadcast" className="shrink-0 rounded-md p-1.5 text-zinc-400 hover:bg-black/5 hover:text-danger dark:hover:bg-white/5">
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          );
        })}
      </div>

      {showTemplates && (
        <TemplatesSheet
          templates={templates}
          currentMessage={message}
          onUse={(body) => {
            setMessage(body);
            setShowTemplates(false);
          }}
          onClose={() => setShowTemplates(false)}
        />
      )}
    </div>
  );
}
