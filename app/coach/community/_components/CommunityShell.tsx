'use client';

import { useState } from 'react';
import Link from 'next/link';
import { EmptyState } from '@/app/_components/EmptyState';
import { CalendarDays, Gift, MessageSquare, Pencil, Plus, Star, Trash2, Users } from 'lucide-react';
import { useAction } from '@/app/_components/useAction';
import { useConfirm } from '@/app/_components/ConfirmDialog';
import { createEvent, deleteEvent, getEventAttendees, updateEvent } from '@/lib/data/community';
import { createReward, deleteReward, markRewardGiven, unmarkRewardGiven } from '@/lib/data/rewards';
import type { EventWithSignup, FeedbackRow, RewardOverview } from '@/lib/data/types';
import { inputCls } from '@/app/_components/ui';

const cardCls = 'rounded-2xl border border-black/[.05] bg-card p-4 dark:border-white/10';
const primaryBtn = 'rounded-full bg-accent px-5 py-2.5 text-sm font-bold text-accent-foreground disabled:opacity-50';
const ghostBtn = 'rounded-full border border-black/10 px-5 py-2.5 text-sm font-bold text-zinc-600 dark:border-white/15 dark:text-zinc-300';

// An ISO timestamp as the "YYYY-MM-DDTHH:mm" a datetime-local input wants, in the device's own time.
function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Create a new event, or change an existing one.
function EventForm({ event, onDone }: { event?: EventWithSignup; onDone: () => void }) {
  const { run, busy } = useAction();
  const [title, setTitle] = useState(event?.title ?? '');
  const [startsAt, setStartsAt] = useState(event ? toLocalInput(event.starts_at) : '');
  const [location, setLocation] = useState(event?.location ?? '');
  const [description, setDescription] = useState(event?.description ?? '');
  const [capacity, setCapacity] = useState(event?.capacity != null ? String(event.capacity) : '');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const fields = {
      title: title.trim(),
      description: description.trim() || null,
      location: location.trim() || null,
      starts_at: new Date(startsAt).toISOString(),
      capacity: capacity ? Number(capacity) : null,
    };
    await run(() => (event ? updateEvent(event.id, fields) : createEvent(fields)), {
      success: event ? 'Event saved' : 'Event created',
      onDone,
    });
  }

  return (
    <form onSubmit={submit} className={`${cardCls} space-y-3`}>
      <p className="text-sm font-semibold text-black dark:text-zinc-50">{event ? 'Edit event' : 'New event'}</p>
      <input required autoFocus className={inputCls} placeholder="Title, e.g. Spring walk" value={title} onChange={(e) => setTitle(e.target.value)} />
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <input required type="datetime-local" className={inputCls} value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
        <input type="number" min={1} className={inputCls} placeholder="Spots (blank = unlimited)" value={capacity} onChange={(e) => setCapacity(e.target.value)} />
      </div>
      <input className={inputCls} placeholder="Location" value={location} onChange={(e) => setLocation(e.target.value)} />
      <textarea className={inputCls} rows={2} placeholder="Details" value={description} onChange={(e) => setDescription(e.target.value)} />
      <div className="flex gap-2">
        <button type="submit" disabled={busy || !title.trim() || !startsAt} className={primaryBtn}>
          {busy ? 'Saving…' : event ? 'Save event' : 'Create event'}
        </button>
        <button type="button" onClick={onDone} className={ghostBtn}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function EventRow({ event, past = false }: { event: EventWithSignup; past?: boolean }) {
  const { run } = useAction();
  const confirm = useConfirm();
  const [attendees, setAttendees] = useState<{ clientId: string; name: string }[] | null>(null);
  const [editing, setEditing] = useState(false);
  const start = new Date(event.starts_at);
  const full = event.capacity != null && event.signups >= event.capacity;

  async function toggleAttendees() {
    if (attendees) {
      setAttendees(null);
      return;
    }
    setAttendees(await getEventAttendees(event.id));
  }

  async function remove() {
    if (
      !(await confirm({
        title: `Delete "${event.title}"?`,
        body: event.signups > 0 ? `${event.signups} ${event.signups === 1 ? 'person has' : 'people have'} signed up. They will no longer see it.` : 'Members will no longer see it.',
        confirmLabel: 'Delete',
        destructive: true,
      }))
    )
      return;
    await run(() => deleteEvent(event.id), { success: 'Event deleted' });
  }

  if (editing) return <EventForm event={event} onDone={() => setEditing(false)} />;

  return (
    <div className={`${cardCls} ${past ? 'opacity-80' : ''}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold text-black dark:text-zinc-50">{event.title}</p>
          <p className="text-xs text-zinc-500">
            {start.toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}
            {event.location ? ` · ${event.location}` : ''}
          </p>
          {event.description && <p className="mt-1 text-xs text-zinc-500">{event.description}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {!past && (
            <button onClick={() => setEditing(true)} aria-label="Edit event" className="rounded-full p-2 text-zinc-400 hover:text-accent">
              <Pencil className="h-4 w-4" />
            </button>
          )}
          <button onClick={remove} aria-label="Delete event" className="rounded-full p-2 text-zinc-400 hover:text-danger">
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button onClick={toggleAttendees} className="flex items-center gap-1 py-1 text-xs font-medium text-accent">
          <Users className="h-3.5 w-3.5" />
          {event.signups} {past ? 'went' : 'going'}
          {event.capacity != null ? ` of ${event.capacity}` : ''} · {attendees ? 'hide' : 'view list'}
        </button>
        {full && !past && <span className="rounded-full bg-warning/15 px-2 py-0.5 text-[11px] font-bold text-warning">Full</span>}
      </div>
      {attendees && (
        <ul className="mt-2 space-y-0.5 text-sm text-zinc-600 dark:text-zinc-400">
          {attendees.length === 0 ? (
            <li className="text-xs text-zinc-500">Nobody yet.</li>
          ) : (
            attendees.map((a) => (
              <li key={a.clientId}>
                <Link href={`/coach/clients/${a.clientId}`} className="hover:underline">
                  {a.name}
                </Link>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}

function NewRewardForm({ onDone }: { onDone: () => void }) {
  const { run, busy } = useAction();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [kind, setKind] = useState<'sessions' | 'months'>('sessions');
  const [threshold, setThreshold] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    await run(
      () => createReward({ name: name.trim(), description: description.trim() || null, kind, threshold: Number(threshold) }),
      { success: 'Reward added', onDone }
    );
  }

  return (
    <form onSubmit={submit} className={`${cardCls} space-y-3`}>
      <p className="text-sm font-semibold text-black dark:text-zinc-50">New reward</p>
      <input required autoFocus className={inputCls} placeholder="e.g. Loyal member water bottle" value={name} onChange={(e) => setName(e.target.value)} />
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <select className={inputCls} value={kind} onChange={(e) => setKind(e.target.value as 'sessions' | 'months')}>
          <option value="sessions">Sessions attended</option>
          <option value="months">Months as a member</option>
        </select>
        <input required type="number" min={1} className={inputCls} placeholder={kind === 'sessions' ? 'e.g. 100' : 'e.g. 18'} value={threshold} onChange={(e) => setThreshold(e.target.value)} />
      </div>
      <input className={inputCls} placeholder="Note (optional)" value={description} onChange={(e) => setDescription(e.target.value)} />
      <div className="flex gap-2">
        <button type="submit" disabled={busy || !name.trim() || !threshold} className={primaryBtn}>
          {busy ? 'Saving…' : 'Add reward'}
        </button>
        <button type="button" onClick={onDone} className={ghostBtn}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function RewardCard({ reward }: { reward: RewardOverview }) {
  const { run } = useAction();
  const confirm = useConfirm();
  const [showGiven, setShowGiven] = useState(false);
  const unit = reward.kind === 'sessions' ? (reward.threshold === 1 ? 'session' : 'sessions') : reward.threshold === 1 ? 'month' : 'months';

  async function remove() {
    if (
      !(await confirm({
        title: `Delete "${reward.name}"?`,
        body: 'Members will no longer see it, and the record of who received it is deleted too.',
        confirmLabel: 'Delete',
        destructive: true,
      }))
    )
      return;
    await run(() => deleteReward(reward.id), { success: 'Reward deleted' });
  }

  async function give(clientId: string, name: string) {
    await run(() => markRewardGiven(reward.id, clientId), { success: `Marked given to ${name}` });
  }

  async function undo(clientId: string, name: string) {
    if (!(await confirm({ title: `Undo for ${name}?`, body: `${name} goes back on the "ready to hand out" list.`, confirmLabel: 'Undo' }))) return;
    await run(() => unmarkRewardGiven(reward.id, clientId), { success: 'Undone' });
  }

  return (
    <div className={cardCls}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold text-black dark:text-zinc-50">{reward.name}</p>
          <p className="text-xs text-zinc-500">
            {reward.threshold} {unit} · {reward.grantedCount} given
          </p>
          {reward.description && <p className="mt-0.5 text-xs text-zinc-500">{reward.description}</p>}
        </div>
        <button onClick={remove} aria-label="Delete reward" className="rounded-full p-2 text-zinc-400 hover:text-danger">
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
      {reward.eligible.length > 0 ? (
        <div className="mt-2 space-y-1">
          <p className="text-[11px] font-bold uppercase tracking-wide text-accent">Ready to hand out · {reward.eligible.length}</p>
          {reward.eligible.map((m) => (
            <div key={m.clientId} className="flex items-center justify-between gap-2 py-0.5 text-sm">
              <Link href={`/coach/clients/${m.clientId}`} className="min-w-0 truncate text-zinc-700 hover:underline dark:text-zinc-300">
                {m.name}
              </Link>
              <button onClick={() => give(m.clientId, m.name)} className="shrink-0 rounded-full bg-accent px-4 py-1.5 text-xs font-bold text-accent-foreground">
                Mark given
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-2 text-xs text-zinc-500">Nobody is waiting on this one.</p>
      )}
      {reward.given.length > 0 && (
        <div className="mt-2">
          <button type="button" onClick={() => setShowGiven((v) => !v)} className="py-1 text-xs font-medium text-accent">
            {showGiven ? 'Hide' : 'Show'} who has it ({reward.given.length})
          </button>
          {showGiven && (
            <ul className="mt-1 space-y-1">
              {reward.given.map((g) => (
                <li key={g.clientId} className="flex items-center justify-between gap-2 text-sm text-zinc-600 dark:text-zinc-400">
                  <span className="min-w-0 truncate">
                    {g.name} <span className="text-xs text-zinc-400">· {new Date(g.grantedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                  </span>
                  <button onClick={() => undo(g.clientId, g.name)} className="shrink-0 px-2 py-1 text-xs font-semibold text-zinc-500 hover:text-danger">
                    Undo
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

export function EventsPane({ events, past = [] }: { events: EventWithSignup[]; past?: EventWithSignup[] }) {
  const [adding, setAdding] = useState(false);
  return (
    <section className="max-w-2xl space-y-3">
      {adding ? (
        <EventForm onDone={() => setAdding(false)} />
      ) : (
        <button type="button" onClick={() => setAdding(true)} className={`${primaryBtn} flex items-center gap-1.5`}>
          <Plus className="h-4 w-4" /> New event
        </button>
      )}
      {events.length === 0 ? (
        <EmptyState icon={CalendarDays} title="No upcoming events" hint="Create one and members can sign up from their app." compact />
      ) : (
        events.map((e) => <EventRow key={e.id} event={e} />)
      )}
      {past.length > 0 && (
        <details className="group">
          <summary className="cursor-pointer list-none py-2 text-sm font-bold text-zinc-500">
            Past events ({past.length}) <span className="text-xs font-medium group-open:hidden">· show</span>
          </summary>
          <div className="space-y-3">
            {past.map((e) => (
              <EventRow key={e.id} event={e} past />
            ))}
          </div>
        </details>
      )}
    </section>
  );
}

export function RewardsPane({ rewards }: { rewards: RewardOverview[] }) {
  const [adding, setAdding] = useState(false);
  return (
    <section className="max-w-2xl space-y-3">
      {adding ? (
        <NewRewardForm onDone={() => setAdding(false)} />
      ) : (
        <button type="button" onClick={() => setAdding(true)} className={`${primaryBtn} flex items-center gap-1.5`}>
          <Plus className="h-4 w-4" /> New reward
        </button>
      )}
      {rewards.length === 0 ? (
        <EmptyState
          icon={Gift}
          title="No rewards yet"
          hint="Add loyalty gifts (a bottle at 18 months, a hoodie at 100 sessions) and hand them out when members earn them."
          compact
        />
      ) : (
        rewards.map((r) => <RewardCard key={r.id} reward={r} />)
      )}
    </section>
  );
}

export function FeedbackPane({ feedback }: { feedback: FeedbackRow[] }) {
  const [filter, setFilter] = useState<'all' | 'low' | 'comments'>('all');
  const avg = feedback.length ? feedback.reduce((s, f) => s + f.rating, 0) / feedback.length : null;
  const low = feedback.filter((f) => f.rating <= 2).length;
  const shown = feedback.filter((f) => (filter === 'low' ? f.rating <= 2 : filter === 'comments' ? !!f.comment : true));
  return (
    <section className="max-w-2xl space-y-3">
      {avg != null && (
        <p className="flex items-center gap-1 text-sm text-zinc-500">
          <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
          {avg.toFixed(1)} average from {feedback.length} {feedback.length === 1 ? 'response' : 'responses'}
          {low > 0 && <span className="ml-1 font-bold text-danger">· {low} low</span>}
        </p>
      )}
      {feedback.length > 0 && (
        <div className="flex gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {([
            ['all', 'All'],
            ['low', 'Low ratings'],
            ['comments', 'With a comment'],
          ] as const).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key)}
              className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-bold ${filter === key ? 'bg-accent text-accent-foreground' : 'bg-black/5 text-zinc-600 dark:bg-white/10 dark:text-zinc-300'}`}
            >
              {label}
            </button>
          ))}
        </div>
      )}
      {feedback.length === 0 ? (
        <EmptyState icon={Star} title="No feedback yet" hint="Ratings and comments members send from the app will appear here." compact />
      ) : shown.length === 0 ? (
        <p className="py-4 text-center text-sm text-zinc-500">Nothing matches that filter.</p>
      ) : (
        shown.map((f) => (
          <div key={f.id} className={`${cardCls} ${f.rating <= 2 ? 'border-danger/30' : ''}`}>
            <div className="flex items-center justify-between">
              <Link href={`/coach/clients/${f.client_id}`} className="text-sm font-semibold text-black hover:underline dark:text-zinc-50">
                {f.clientName}
              </Link>
              <p className="flex items-center gap-0.5">
                {[1, 2, 3, 4, 5].map((n) => (
                  <Star key={n} className={`h-3.5 w-3.5 ${n <= f.rating ? 'fill-amber-400 text-amber-400' : 'text-zinc-300 dark:text-zinc-600'}`} />
                ))}
              </p>
            </div>
            {f.comment && <p className="mt-1.5 text-sm text-zinc-600 dark:text-zinc-400">{f.comment}</p>}
            <div className="mt-1.5 flex items-center justify-between gap-2">
              <p className="text-xs text-zinc-400">{new Date(f.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
              <Link
                href={`/coach/clients/${f.client_id}?open=messages`}
                className={`flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-bold ${f.rating <= 2 ? 'bg-danger/10 text-danger' : 'bg-accent/10 text-accent'}`}
              >
                <MessageSquare className="h-3.5 w-3.5" /> {f.rating <= 2 ? 'Reply' : 'Message'}
              </Link>
            </div>
          </div>
        ))
      )}
    </section>
  );
}
