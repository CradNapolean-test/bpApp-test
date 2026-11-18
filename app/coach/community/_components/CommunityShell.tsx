'use client';

import { useRef, useState } from 'react';
import ClickSpark, { type ClickSparkHandle } from '@/app/_components/motion/ClickSpark';
import { foldAway } from '@/app/_components/motion/gsap';
import { formatDateTime } from '@/lib/utils/dates';
import Link from 'next/link';
import { EmptyState } from '@/app/_components/EmptyState';
import { CalendarDays, Gift, MessageSquare, Pencil, Plus, Star, Trash2, Users } from 'lucide-react';
import { useAction } from '@/app/_components/useAction';
import { useConfirm } from '@/app/_components/ConfirmDialog';
import { useActiveGymId } from '@/app/coach/_components/CoachGymsContext';
import { createEvent, deleteEvent, getEventAttendees, updateEvent } from '@/lib/data/community';
import { createReward, deleteReward, markRewardGiven, unmarkRewardGiven } from '@/lib/data/rewards';
import { getScoresExport, setShirtGiven } from '@/lib/data/bigDog';
import { gridCsv, scoresCsv } from '@/lib/bigDogExport';
import { toCsv } from '@/lib/csv';
import type { ShirtRow } from '@/lib/data/bigDog';
import { TIER_TITLE } from '@/lib/bigDog';
import type { EventWithSignup, FeedbackRow, RewardOverview } from '@/lib/data/types';
import { inputCls } from '@/app/_components/ui';
import { Avatar } from '@/app/_components/Avatar';
import { CoachSection, CoachStatStrip, coachRow } from '@/app/coach/_components/CoachUi';

const cardCls = 'rounded-[20px] border border-black/[.08] bg-card p-5 dark:border-white/10';
const primaryBtn = 'inline-flex h-11 items-center rounded-xl bg-accent px-5 text-sm font-extrabold text-accent-foreground disabled:opacity-50';
const ghostBtn = 'inline-flex h-11 items-center rounded-xl border-[1.5px] border-black/20 px-5 text-sm font-bold text-black dark:border-white/25 dark:text-zinc-50';
const softBtn = 'inline-flex h-11 shrink-0 items-center rounded-xl bg-accent-soft px-4 text-sm font-bold text-accent disabled:opacity-50';
const iconBtn = 'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-zinc-500 hover:bg-black/5 dark:hover:bg-white/10';
// The board's filter pills: black when on, an outline when off.
const pill = (on: boolean) =>
  `h-11 shrink-0 rounded-full px-4 text-sm font-bold ${
    on ? 'bg-[#1d1d1b] text-white dark:bg-zinc-100 dark:text-[#1d1d1b]' : 'border border-black/[.14] bg-card text-black hover:bg-black/[.03] dark:border-white/15 dark:text-zinc-50'
  }`;

// An ISO timestamp as the "YYYY-MM-DDTHH:mm" a datetime-local input wants, in the device's own time.
function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Create a new event, or change an existing one.
function EventForm({ event, onDone }: { event?: EventWithSignup; onDone: () => void }) {
  const { run, busy } = useAction();
  const gymId = useActiveGymId();
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
    await run(() => (event ? updateEvent(event.id, fields, gymId) : createEvent(fields, gymId)), {
      success: event ? 'Event saved' : 'Event created',
      onDone,
    });
  }

  return (
    <form onSubmit={submit} className={`${cardCls} space-y-3`}>
      <p className="text-lg font-extrabold text-black dark:text-zinc-50">{event ? 'Edit event' : 'New event'}</p>
      <input required autoFocus className={inputCls} placeholder="Title, e.g. Spring walk" value={title} onChange={(e) => setTitle(e.target.value)} />
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <input
          required
          type="datetime-local"
          // A new event can't start in the past (the database function refuses too).
          min={event ? undefined : toLocalInput(new Date().toISOString())}
          className={inputCls}
          value={startsAt}
          onChange={(e) => setStartsAt(e.target.value)}
        />
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
  const gymId = useActiveGymId();
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
        body: event.signups > 0 ? `${event.signups} ${event.signups === 1 ? 'person has' : 'people have'} signed up. They will be told it is cancelled.` : 'Members will no longer see it.',
        confirmLabel: 'Delete',
        destructive: true,
      }))
    )
      return;
    await run(() => deleteEvent(event.id, gymId), { success: 'Event deleted' });
  }

  if (editing) return <EventForm event={event} onDone={() => setEditing(false)} />;

  return (
    <div className={`${coachRow} py-3 ${past ? 'opacity-80' : ''}`}>
      <div className="flex items-center gap-4">
        <span
          aria-hidden
          className={`flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-2xl ${
            past ? 'bg-black/[.06] text-zinc-600 dark:bg-white/10 dark:text-zinc-300' : 'bg-[#1d1d1b] text-white dark:bg-zinc-100 dark:text-[#1d1d1b]'
          }`}
        >
          <span className={`text-[11px] font-extrabold uppercase ${past ? '' : 'text-[#5fd6d6] dark:text-[#0e6266]'}`}>{start.toLocaleDateString('en-GB', { month: 'short' })}</span>
          <span className="text-xl font-black leading-none">{start.getDate()}</span>
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-bold text-black dark:text-zinc-50">{event.title}</p>
          <p className="text-[13px] text-zinc-500 dark:text-zinc-400">
            {formatDateTime(start)}
            {event.location ? ` · ${event.location}` : ''}
          </p>
          <button onClick={toggleAttendees} className="mt-0.5 flex min-h-9 items-center gap-1.5 text-[13px] font-bold text-accent">
            <Users className="h-4 w-4" />
            {event.signups}
            {event.capacity != null ? ` of ${event.capacity}` : ''} {past ? 'went' : 'in'} · {attendees ? 'hide' : 'who is in'}
          </button>
        </div>
        {full && !past && (
          <span className="hidden h-6 shrink-0 items-center rounded-full bg-amber-100 px-2.5 text-xs font-extrabold text-amber-800 sm:inline-flex dark:bg-amber-400/15 dark:text-amber-300">Full</span>
        )}
        <div className="flex shrink-0 items-center">
          {!past && (
            <button onClick={() => setEditing(true)} aria-label={`Edit ${event.title}`} className={iconBtn}>
              <Pencil className="h-4 w-4" />
            </button>
          )}
          <button onClick={remove} aria-label={`Delete ${event.title}`} className={`${iconBtn} hover:text-danger`}>
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>
      {event.description && <p className="ml-[72px] mt-1 text-sm text-zinc-600 dark:text-zinc-400">{event.description}</p>}
      {attendees && (
        <ul className="ml-[72px] mt-2 flex flex-wrap gap-1.5">
          {attendees.length === 0 ? (
            <li className="text-sm text-zinc-500">Nobody yet.</li>
          ) : (
            attendees.map((a) => (
              <li key={a.clientId}>
                <Link
                  href={`/coach/clients/${a.clientId}`}
                  className="inline-flex h-9 items-center gap-2 rounded-full border border-black/[.1] bg-card pl-1 pr-3 text-sm font-semibold text-black hover:bg-black/[.03] dark:border-white/15 dark:text-zinc-50"
                >
                  <Avatar name={a.name} size="sm" />
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
  const gymId = useActiveGymId();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [kind, setKind] = useState<'sessions' | 'months'>('sessions');
  const [threshold, setThreshold] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    await run(
      () => createReward({ name: name.trim(), description: description.trim() || null, kind, threshold: Number(threshold) }, gymId),
      { success: 'Reward added', onDone }
    );
  }

  return (
    <form onSubmit={submit} className={`${cardCls} space-y-3`}>
      <p className="text-lg font-extrabold text-black dark:text-zinc-50">New reward</p>
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

function RewardCard({ reward, canEdit, handOut }: { reward: RewardOverview; canEdit: boolean; handOut: boolean }) {
  const { run } = useAction();
  const gymId = useActiveGymId();
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
    await run(() => deleteReward(reward.id, gymId), { success: 'Reward deleted' });
  }

  async function undo(clientId: string, name: string) {
    if (!(await confirm({ title: `Undo for ${name}?`, body: `${name} goes back on the "ready to hand out" list.`, confirmLabel: 'Undo' }))) return;
    await run(() => unmarkRewardGiven(reward.id, clientId), { success: 'Undone' });
  }

  return (
    <div className={cardCls}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[15px] font-bold text-black dark:text-zinc-50">{reward.name}</p>
          <p className="text-[13px] text-zinc-500 dark:text-zinc-400">
            {reward.threshold} {unit}
            {handOut && ` · ${reward.grantedCount} given`}
          </p>
          {reward.description && <p className="mt-0.5 text-xs text-zinc-500">{reward.description}</p>}
        </div>
        {canEdit && (
          <button onClick={remove} aria-label={`Delete ${reward.name}`} className={`${iconBtn} hover:text-danger`}>
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>
      {/* Who is waiting is listed once, at the top of the page ("To hand out"). */}
      {handOut && (
        <p className={`mt-2 text-[13px] font-semibold ${reward.eligible.length > 0 ? 'text-accent' : 'text-zinc-500'}`}>
          {reward.eligible.length > 0 ? `${reward.eligible.length} to hand out` : 'All handed out'}
        </p>
      )}
      {handOut && reward.given.length > 0 && (
        <div className="mt-2">
          <button type="button" onClick={() => setShowGiven((v) => !v)} className="min-h-9 text-[13px] font-bold text-accent">
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
    <section className="max-w-3xl space-y-6">
      {adding ? (
        <EventForm onDone={() => setAdding(false)} />
      ) : (
        <div className="flex justify-end">
          <button type="button" onClick={() => setAdding(true)} className={`${primaryBtn} gap-1.5`}>
            <Plus className="h-4 w-4" strokeWidth={2.6} /> New event
          </button>
        </div>
      )}
      <CoachSection title="Coming up" count={events.length > 0 ? events.length : undefined}>
        {events.length === 0 ? (
          <div className={coachRow}>
            <EmptyState icon={CalendarDays} title="No upcoming events" hint="Create one and members can sign up from their app." compact />
          </div>
        ) : (
          events.map((e) => <EventRow key={e.id} event={e} />)
        )}
      </CoachSection>
      {past.length > 0 && (
        <CoachSection title="Past events" count={past.length}>
          {past.map((e) => (
            <EventRow key={e.id} event={e} past />
          ))}
        </CoachSection>
      )}
    </section>
  );
}

function ScoresExportCard() {
  const { run, busy } = useAction();
  const save = (name: string, text: string) => {
    const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  };
  const download = (layout: 'scores' | 'grid') =>
    run(async () => {
      const { raw, members } = await getScoresExport();
      const map = new Map(Object.entries(members));
      const stamp = new Date().toISOString().slice(0, 10);
      if (raw.length === 0) save(`peak-week-${layout}-${stamp}.csv`, toCsv(['Member'], []));
      else save(`peak-week-${layout}-${stamp}.csv`, layout === 'scores' ? scoresCsv(raw, map) : gridCsv(raw, map));
    });
  return (
    <div className={cardCls}>
      <p className="text-[15px] font-bold text-black dark:text-zinc-50">Peak Week scores</p>
      <p className="text-[13px] text-zinc-500 dark:text-zinc-400">
        Download every verified score for your sheet. Opens in Excel or Google Sheets. A newer score a member logged themselves is listed with Verified = No.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" disabled={busy} onClick={() => download('scores')} className={softBtn}>
          One row per score (CSV)
        </button>
        <button type="button" disabled={busy} onClick={() => download('grid')} className={`${ghostBtn} disabled:opacity-50`}>
          One row per member (CSV)
        </button>
      </div>
    </div>
  );
}

// Everyone waiting for something, in one list (the board's "To hand out"): club rewards they have reached and Big Dog shirts they have earned.
function ToHandOut({ rewards, shirts }: { rewards: RewardOverview[]; shirts: ShirtRow[] }) {
  const { run, busy } = useAction();
  const rows = [
    ...rewards.flatMap((r) =>
      r.eligible.map((m) => ({
        key: `r-${r.id}-${m.clientId}`,
        clientId: m.clientId,
        name: m.name,
        what: `reached ${r.name}`,
        line: `${r.threshold} ${r.kind === 'sessions' ? 'sessions' : 'months as a member'}`,
        give: () => run(() => markRewardGiven(r.id, m.clientId), { success: `Marked given to ${m.name}` }),
      }))
    ),
    ...shirts
      .filter((s) => !s.givenAt)
      .map((s) => ({
        key: `s-${s.clientId}-${s.tier}`,
        clientId: s.clientId,
        name: s.name,
        what: `earned the ${TIER_TITLE[s.tier].replace(' Big Dog', '')} shirt`,
        line: 'Big Dog T-shirt',
        give: () => run(() => setShirtGiven(s.clientId, s.tier, true), { success: `Marked given to ${s.name}` }),
      })),
  ];
  if (rows.length === 0) return null;
  return (
    <CoachSection title="To hand out" count={rows.length}>
      {rows.map((r) => (
        <HandOutRow key={r.key} row={r} busy={busy} />
      ))}
    </CoachSection>
  );
}

// One person waiting for a reward or a shirt. "Mark as given" throws a few sparks (React Bits ClickSpark) and the row folds away while it
// saves; it opens again if the save fails.
function HandOutRow({
  row,
  busy,
}: {
  row: { name: string; what: string; line: string; clientId: string; give: () => Promise<boolean> };
  busy: boolean;
}) {
  const el = useRef<HTMLDivElement>(null);
  const sparks = useRef<ClickSparkHandle>(null);
  return (
    <div ref={el} className={`${coachRow} flex min-h-[64px] items-center gap-3 py-2.5`}>
      <Avatar name={row.name} size="md" />
      <Link href={`/coach/clients/${row.clientId}`} className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-bold text-black hover:underline dark:text-zinc-50">
          {row.name} {row.what}
        </span>
        <span className="block truncate text-[13px] text-zinc-500 dark:text-zinc-400">{row.line}</span>
      </Link>
      <div className="shrink-0">
        <ClickSpark ref={sparks} clickToSpark={false} sparkColor={['#19adb1', '#5fd6d6', '#f59e0b']} sparkCount={12} sparkRadius={36} sparkSize={10} shape="star" duration={650}>
          <button
            type="button"
            disabled={busy}
            onClick={(e) => {
              const box = e.currentTarget.getBoundingClientRect();
              sparks.current?.spark(box.width / 2, box.height / 2);
              void foldAway(el.current, row.give);
            }}
            className={softBtn}
          >
            Mark as given
          </button>
        </ClickSpark>
      </div>
    </div>
  );
}

function ShirtsCard({ shirts }: { shirts: ShirtRow[] }) {
  const { run } = useAction();
  const owed = shirts.filter((s) => !s.givenAt);
  const given = shirts.filter((s) => s.givenAt);
  const [showGiven, setShowGiven] = useState(false);
  if (shirts.length === 0) return null;
  return (
    <div className={cardCls}>
      <p className="text-[15px] font-bold text-black dark:text-zinc-50">Big Dog T-shirts</p>
      <p className="text-[13px] text-zinc-500 dark:text-zinc-400">
        Added automatically when a verified result takes a member into a new tier.
        {owed.length > 0 ? ` ${owed.length} to hand out, listed above.` : ' None waiting to be handed out.'}
      </p>
      {given.length > 0 && (
        <div className="mt-3">
          <button type="button" onClick={() => setShowGiven(!showGiven)} className="min-h-9 text-[13px] font-bold text-accent">
            {showGiven ? 'Hide' : 'Show'} given ({given.length})
          </button>
          {showGiven &&
            given.map((s) => (
              <div key={`${s.clientId}-${s.tier}`} className="mt-1.5 flex items-center justify-between gap-2 text-sm text-zinc-500">
                <span className="truncate">{s.name} · {TIER_TITLE[s.tier].replace(' Big Dog', '')}</span>
                <button type="button" onClick={() => run(() => setShirtGiven(s.clientId, s.tier, false), { success: 'Undone' })} className="shrink-0 text-xs font-bold underline">
                  Undo
                </button>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}

export function RewardsPane({
  rewards,
  shirts = [],
  canEdit = true,
  handOut = true,
}: {
  rewards: RewardOverview[];
  shirts?: ShirtRow[];
  // Setting rewards up is for gym admins and the owner (D3, migration 0161); handing them out is for every coach at the gym.
  canEdit?: boolean;
  // false on the owner's gym page: the rewards themselves, without the shirts, the scores export and who is waiting for what.
  handOut?: boolean;
}) {
  const [adding, setAdding] = useState(false);
  return (
    <section className="max-w-3xl space-y-4">
      {handOut && <ToHandOut rewards={rewards} shirts={shirts} />}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
        <h2 className="text-lg font-extrabold text-black dark:text-zinc-50">Rewards</h2>
        {canEdit && !adding && (
          <button type="button" onClick={() => setAdding(true)} className={`${primaryBtn} gap-1.5`}>
            <Plus className="h-4 w-4" strokeWidth={2.6} /> New reward
          </button>
        )}
      </div>
      {canEdit && adding && <NewRewardForm onDone={() => setAdding(false)} />}
      {rewards.length === 0 ? (
        <EmptyState
          icon={Gift}
          title="No rewards yet"
          hint="Add loyalty gifts (a bottle at 18 months, a hoodie at 100 sessions) and hand them out when members earn them."
          compact
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {rewards.map((r) => (
            <RewardCard key={r.id} reward={r} canEdit={canEdit} handOut={handOut} />
          ))}
        </div>
      )}
      {handOut && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <ShirtsCard shirts={shirts} />
          <ScoresExportCard />
        </div>
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
    <section className="max-w-4xl space-y-4">
      {avg != null && (
        <CoachStatStrip
          label="Feedback at a glance"
          stats={[
            { label: 'Responses', value: feedback.length },
            { label: 'Average rating', value: avg.toFixed(1), sub: 'Out of 5', tone: avg >= 4 ? 'teal' : undefined },
            { label: 'Low ratings', value: low, sub: low > 0 ? '2 stars or fewer' : 'None', tone: low > 0 ? 'amber' : undefined },
          ]}
        />
      )}
      {feedback.length > 0 && (
        <div className="flex gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {([
            ['all', 'All'],
            ['low', 'Low ratings'],
            ['comments', 'With a comment'],
          ] as const).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key)}
              aria-pressed={filter === key}
              className={pill(filter === key)}
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
        <div className="overflow-hidden rounded-[20px] border border-black/[.08] bg-card dark:border-white/10">
          {shown.map((f, i) => (
            <div key={f.id} className={`flex gap-3 px-5 py-4 sm:px-6 ${i > 0 ? 'border-t border-black/[.07] dark:border-white/10' : ''}`}>
              <Avatar name={f.clientName} size="md" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <Link href={`/coach/clients/${f.client_id}`} className="text-[15px] font-bold text-black hover:underline dark:text-zinc-50">
                    {f.clientName}
                  </Link>
                  <span className="flex items-center gap-0.5" role="img" aria-label={`${f.rating} of 5 stars`}>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <Star key={n} className={`h-3.5 w-3.5 ${n <= f.rating ? 'fill-amber-400 text-amber-400' : 'text-zinc-300 dark:text-zinc-600'}`} />
                    ))}
                  </span>
                  {f.rating <= 2 && (
                    <span className="inline-flex h-5 items-center rounded-full bg-red-100 px-2 text-[11px] font-extrabold text-red-800 dark:bg-red-500/15 dark:text-red-300">Low</span>
                  )}
                  <span className="text-[13px] text-zinc-500">{new Date(f.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                </div>
                {f.comment && <p className="mt-1 text-[15px] leading-snug text-zinc-700 dark:text-zinc-300">{f.comment}</p>}
              </div>
              <Link href={`/coach/clients/${f.client_id}?open=messages`} className={`${softBtn} gap-1.5 self-start`}>
                <MessageSquare className="h-4 w-4" /> {f.rating <= 2 ? 'Reply' : 'Message'}
              </Link>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
