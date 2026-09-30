'use client';

import { useState } from 'react';
import { Gift, Star, Trash2, Users } from 'lucide-react';
import { AppShell } from '@/app/_components/AppShell';
import { ClientOnly } from '@/app/_components/ClientOnly';
import { useAction } from '@/app/_components/useAction';
import { useConfirm } from '@/app/_components/ConfirmDialog';
import { CoachNav } from '@/app/coach/_components/CoachNav';
import { CoachBottomTabBar } from '@/app/coach/_components/CoachBottomTabBar';
import { CoachBrand } from '@/app/coach/_components/CoachBrand';
import { CoachMessagesButton } from '@/app/coach/_components/CoachMessagesButton';
import { createEvent, deleteEvent, getEventAttendees } from '@/lib/data/community';
import { createReward, deleteReward, markRewardGiven } from '@/lib/data/rewards';
import type { EventWithSignup, FeedbackRow, RewardOverview } from '@/lib/data/types';

const inputCls = 'w-full rounded-lg border border-black/10 bg-transparent px-3 py-2 text-sm dark:border-white/15';
const cardCls = 'rounded-2xl border border-black/[.05] bg-card p-4 dark:border-white/10';

function NewEventForm() {
  const { run, busy } = useAction();
  const [title, setTitle] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [location, setLocation] = useState('');
  const [description, setDescription] = useState('');
  const [capacity, setCapacity] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    await run(
      () =>
        createEvent({
          title: title.trim(),
          description: description.trim() || null,
          location: location.trim() || null,
          starts_at: new Date(startsAt).toISOString(),
          capacity: capacity ? Number(capacity) : null,
        }),
      {
        success: 'Event created',
        onDone: () => {
          setTitle('');
          setStartsAt('');
          setLocation('');
          setDescription('');
          setCapacity('');
        },
      }
    );
  }

  return (
    <form onSubmit={submit} className={`${cardCls} space-y-3`}>
      <p className="text-sm font-semibold text-black dark:text-zinc-50">New event</p>
      <input required className={inputCls} placeholder="Title, e.g. Spring walk" value={title} onChange={(e) => setTitle(e.target.value)} />
      <div className="grid grid-cols-2 gap-2">
        <input required type="datetime-local" className={inputCls} value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
        <input type="number" min={1} className={inputCls} placeholder="Spots (blank = unlimited)" value={capacity} onChange={(e) => setCapacity(e.target.value)} />
      </div>
      <input className={inputCls} placeholder="Location" value={location} onChange={(e) => setLocation(e.target.value)} />
      <textarea className={inputCls} rows={2} placeholder="Details" value={description} onChange={(e) => setDescription(e.target.value)} />
      <button
        type="submit"
        disabled={busy || !title.trim() || !startsAt}
        className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground disabled:opacity-50"
      >
        {busy ? 'Saving…' : 'Create event'}
      </button>
    </form>
  );
}

function EventRow({ event }: { event: EventWithSignup }) {
  const { run } = useAction();
  const confirm = useConfirm();
  const [attendees, setAttendees] = useState<{ clientId: string; name: string }[] | null>(null);
  const start = new Date(event.starts_at);

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
        body: 'Members who signed up will no longer see it.',
        confirmLabel: 'Delete',
        destructive: true,
      }))
    )
      return;
    await run(() => deleteEvent(event.id), { success: 'Event deleted' });
  }

  return (
    <div className={cardCls}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold text-black dark:text-zinc-50">{event.title}</p>
          <p className="text-xs text-zinc-500">
            {start.toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}
            {event.location ? ` · ${event.location}` : ''}
          </p>
        </div>
        <button onClick={remove} aria-label="Delete event" className="text-zinc-400 hover:text-danger">
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
      <button onClick={toggleAttendees} className="mt-2 flex items-center gap-1 text-xs font-medium text-accent">
        <Users className="h-3.5 w-3.5" />
        {event.signups} going{event.capacity != null ? ` of ${event.capacity}` : ''} · {attendees ? 'hide' : 'view list'}
      </button>
      {attendees && (
        <ul className="mt-2 space-y-0.5 text-sm text-zinc-600 dark:text-zinc-400">
          {attendees.length === 0 ? <li className="text-xs text-zinc-500">Nobody yet.</li> : attendees.map((a) => <li key={a.clientId}>{a.name}</li>)}
        </ul>
      )}
    </div>
  );
}

function NewRewardForm() {
  const { run, busy } = useAction();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [kind, setKind] = useState<'sessions' | 'months'>('sessions');
  const [threshold, setThreshold] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    await run(
      () => createReward({ name: name.trim(), description: description.trim() || null, kind, threshold: Number(threshold) }),
      {
        success: 'Reward added',
        onDone: () => {
          setName('');
          setDescription('');
          setThreshold('');
        },
      }
    );
  }

  return (
    <form onSubmit={submit} className={`${cardCls} space-y-3`}>
      <p className="text-sm font-semibold text-black dark:text-zinc-50">New reward</p>
      <input required className={inputCls} placeholder="e.g. Loyal member water bottle" value={name} onChange={(e) => setName(e.target.value)} />
      <div className="grid grid-cols-2 gap-2">
        <select className={inputCls} value={kind} onChange={(e) => setKind(e.target.value as 'sessions' | 'months')}>
          <option value="sessions">Sessions attended</option>
          <option value="months">Months as a member</option>
        </select>
        <input required type="number" min={1} className={inputCls} placeholder={kind === 'sessions' ? 'e.g. 100' : 'e.g. 18'} value={threshold} onChange={(e) => setThreshold(e.target.value)} />
      </div>
      <input className={inputCls} placeholder="Note (optional)" value={description} onChange={(e) => setDescription(e.target.value)} />
      <button
        type="submit"
        disabled={busy || !name.trim() || !threshold}
        className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground disabled:opacity-50"
      >
        Add reward
      </button>
    </form>
  );
}

function RewardCard({ reward }: { reward: RewardOverview }) {
  const { run } = useAction();
  const confirm = useConfirm();

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

  return (
    <div className={cardCls}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold text-black dark:text-zinc-50">{reward.name}</p>
          <p className="text-xs text-zinc-500">
            {reward.kind === 'sessions' ? `${reward.threshold} sessions` : `${reward.threshold} months`} · {reward.grantedCount} given
          </p>
        </div>
        <button onClick={remove} aria-label="Delete reward" className="text-zinc-400 hover:text-danger">
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
      {reward.eligible.length > 0 ? (
        <div className="mt-2 space-y-1">
          <p className="text-[11px] font-bold uppercase tracking-wide text-accent">Ready to hand out</p>
          {reward.eligible.map((m) => (
            <div key={m.clientId} className="flex items-center justify-between text-sm">
              <span className="text-zinc-700 dark:text-zinc-300">{m.name}</span>
              <button
                onClick={() => run(() => markRewardGiven(reward.id, m.clientId), { success: `Marked given to ${m.name}` })}
                className="rounded-full bg-accent px-3 py-1 text-xs font-bold text-accent-foreground"
              >
                Mark given
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-2 text-xs text-zinc-500">Nobody is waiting on this one.</p>
      )}
    </div>
  );
}

export function CommunityShell({
  events,
  feedback,
  rewards,
  unreadCount,
}: {
  events: EventWithSignup[];
  feedback: FeedbackRow[];
  rewards: RewardOverview[];
  unreadCount: number;
}) {
  const avg = feedback.length ? feedback.reduce((s, f) => s + f.rating, 0) / feedback.length : null;

  return (
    <ClientOnly fallback={<div className="min-h-screen" />}>
    <AppShell
      title={<CoachBrand />}
      topBar={<CoachNav />}
      bottomBar={<CoachBottomTabBar />}
      headerAction={<CoachMessagesButton unreadCount={unreadCount} />}
    >
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="space-y-3">
          <h2 className="text-lg font-bold text-black dark:text-zinc-50">Events</h2>
          <NewEventForm />
          {events.length === 0 ? (
            <p className="text-sm text-zinc-500">No upcoming events yet.</p>
          ) : (
            events.map((e) => <EventRow key={e.id} event={e} />)
          )}
        </section>

        <section className="space-y-3 lg:col-span-2">
          <h2 className="flex items-center gap-2 text-lg font-bold text-black dark:text-zinc-50">
            <Gift className="h-5 w-5 text-accent" /> Rewards
          </h2>
          <div className="grid gap-3 lg:grid-cols-2">
            <NewRewardForm />
            <div className="space-y-3">
              {rewards.length === 0 ? (
                <p className="text-sm text-zinc-500">No rewards set up yet — add your first one.</p>
              ) : (
                rewards.map((r) => <RewardCard key={r.id} reward={r} />)
              )}
            </div>
          </div>
        </section>

        <section className="space-y-3">
          <div className="flex items-baseline justify-between">
            <h2 className="text-lg font-bold text-black dark:text-zinc-50">Member feedback</h2>
            {avg != null && (
              <p className="flex items-center gap-1 text-sm text-zinc-500">
                <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                {avg.toFixed(1)} avg · {feedback.length}
              </p>
            )}
          </div>
          {feedback.length === 0 ? (
            <p className="text-sm text-zinc-500">No feedback yet.</p>
          ) : (
            feedback.map((f) => (
              <div key={f.id} className={cardCls}>
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-black dark:text-zinc-50">{f.clientName}</p>
                  <p className="flex items-center gap-0.5">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <Star key={n} className={`h-3.5 w-3.5 ${n <= f.rating ? 'fill-amber-400 text-amber-400' : 'text-zinc-300 dark:text-zinc-600'}`} />
                    ))}
                  </p>
                </div>
                {f.comment && <p className="mt-1.5 text-sm text-zinc-600 dark:text-zinc-400">{f.comment}</p>}
                <p className="mt-1 text-[11px] text-zinc-400">{new Date(f.created_at).toLocaleDateString()}</p>
              </div>
            ))
          )}
        </section>
      </div>
    </AppShell>
    </ClientOnly>
  );
}
