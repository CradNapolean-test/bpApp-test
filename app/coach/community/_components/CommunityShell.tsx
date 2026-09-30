'use client';

import { useState } from 'react';
import { Star, Trash2, Users } from 'lucide-react';
import { AppShell } from '@/app/_components/AppShell';
import { useAction } from '@/app/_components/useAction';
import { useConfirm } from '@/app/_components/ConfirmDialog';
import { CoachNav } from '@/app/coach/_components/CoachNav';
import { CoachBottomTabBar } from '@/app/coach/_components/CoachBottomTabBar';
import { CoachBrand } from '@/app/coach/_components/CoachBrand';
import { CoachMessagesButton } from '@/app/coach/_components/CoachMessagesButton';
import { createEvent, deleteEvent, getEventAttendees } from '@/lib/data/community';
import type { EventWithSignup, FeedbackRow } from '@/lib/data/types';

const inputCls = 'w-full rounded-lg border border-black/10 bg-transparent px-3 py-2 text-sm dark:border-white/15';
const cardCls = 'rounded-2xl border border-black/[.05] p-4 dark:border-white/10';

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

export function CommunityShell({
  events,
  feedback,
  unreadCount,
}: {
  events: EventWithSignup[];
  feedback: FeedbackRow[];
  unreadCount: number;
}) {
  const avg = feedback.length ? feedback.reduce((s, f) => s + f.rating, 0) / feedback.length : null;

  return (
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
  );
}
