'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAction } from '@/app/_components/useAction';
import { useToast } from '@/app/_components/ToastProvider';
import { renameGym, setCoachAdmin, updateGymBookingSettings, type GymCoachRow } from '@/lib/data/gym';

function GymNameForm({ initialName }: { initialName: string }) {
  const { run, busy } = useAction();
  const [name, setName] = useState(initialName);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || name.trim() === initialName) return;
    await run(() => renameGym(name.trim()), { success: 'Gym name saved' });
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-2">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="w-full min-w-0 flex-1 rounded-md border border-black/10 bg-transparent px-2.5 py-1.5 text-sm dark:border-white/10"
      />
      <button
        type="submit"
        disabled={busy || !name.trim() || name.trim() === initialName}
        className="shrink-0 rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-accent-foreground disabled:opacity-50"
      >
        Save
      </button>
    </form>
  );
}

const TIMEZONES = [
  'Europe/London',
  'Europe/Dublin',
  'Europe/Paris',
  'America/New_York',
  'America/Los_Angeles',
  'Australia/Sydney',
  'Pacific/Auckland',
  'UTC',
];

// Timezone + cancellation blackout window. Class start times are wall-clock times at the gym, so
// the timezone decides when a cancellation deadline actually falls; the blackout (default
// 11pm-5am) is the overnight stretch a deadline can't land inside.
function BookingRulesForm({
  timezone,
  blackoutStart,
  blackoutEnd,
}: {
  timezone: string;
  blackoutStart: string | null;
  blackoutEnd: string | null;
}) {
  const { run, busy } = useAction();
  const [tz, setTz] = useState(timezone);
  const [useBlackout, setUseBlackout] = useState(blackoutStart != null && blackoutEnd != null);
  const [start, setStart] = useState(blackoutStart?.slice(0, 5) ?? '23:00');
  const [end, setEnd] = useState(blackoutEnd?.slice(0, 5) ?? '05:00');
  const zones = TIMEZONES.includes(tz) ? TIMEZONES : [tz, ...TIMEZONES];

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await run(() => updateGymBookingSettings(tz, useBlackout ? start : null, useBlackout ? end : null), {
      success: 'Booking rules saved',
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="space-y-1">
        <label className="text-xs font-medium text-zinc-500">Timezone</label>
        <select
          value={tz}
          onChange={(e) => setTz(e.target.value)}
          className="w-full rounded-md border border-black/10 bg-transparent px-2.5 py-1.5 text-sm dark:border-white/10"
        >
          {zones.map((z) => (
            <option key={z} value={z}>
              {z}
            </option>
          ))}
        </select>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={useBlackout} onChange={(e) => setUseBlackout(e.target.checked)} />
        Overnight blackout for cancellations
      </label>
      {useBlackout && (
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <label className="text-xs font-medium text-zinc-500">From</label>
            <input type="time" value={start} onChange={(e) => setStart(e.target.value)} className="w-full rounded-md border border-black/10 bg-transparent px-2.5 py-1.5 text-sm dark:border-white/10" />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-zinc-500">Until</label>
            <input type="time" value={end} onChange={(e) => setEnd(e.target.value)} className="w-full rounded-md border border-black/10 bg-transparent px-2.5 py-1.5 text-sm dark:border-white/10" />
          </div>
        </div>
      )}
      <p className="text-xs text-zinc-500">
        A cancellation deadline that would fall inside the blackout moves back to its start, so an early-morning class
        must be cancelled the evening before.
      </p>
      <button
        type="submit"
        disabled={busy}
        className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-accent-foreground disabled:opacity-50"
      >
        Save booking rules
      </button>
    </form>
  );
}

function CoachRow({ coach, currentUserId }: { coach: GymCoachRow; currentUserId: string }) {
  const { run, busy } = useAction();
  const [isAdmin, setIsAdmin] = useState(coach.isGymAdmin);

  async function handleToggle() {
    const next = !isAdmin;
    setIsAdmin(next);
    await run(() => setCoachAdmin(coach.id, next), {
      success: next ? `${coach.displayName ?? coach.email} is now a gym admin` : `Admin rights removed`,
    });
  }

  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-black/10 p-3 dark:border-white/10">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-black dark:text-zinc-50">
          {coach.displayName ?? coach.email}
          {coach.id === currentUserId && <span className="ml-1.5 text-xs font-normal text-zinc-400">(you)</span>}
        </p>
        <p className="truncate text-xs text-zinc-500">{coach.email}</p>
      </div>
      <button
        onClick={handleToggle}
        disabled={busy}
        className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium disabled:opacity-50 ${
          isAdmin
            ? 'bg-accent-soft text-accent'
            : 'border border-black/10 text-zinc-500 hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/5'
        }`}
      >
        {isAdmin ? 'Admin' : 'Make admin'}
      </button>
    </div>
  );
}

function AddCoachForm() {
  const router = useRouter();
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // password is only set for a brand-new account (existingAccount: false) -- an email that
  // already belongs to a coach just gets added as a member of this gym, no new credentials.
  const [created, setCreated] = useState<{ email: string; password: string | null } | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch('/api/gym/create-coach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const body = await res.json();

      if (!res.ok) {
        const message = body.error ?? 'Failed to create coach';
        setError(message);
        toast.error(message);
        return;
      }

      setCreated({ email: body.email, password: body.existingAccount ? null : body.password });
      setEmail('');
      toast.success(body.existingAccount ? 'Existing coach added to this gym' : 'Coach account created');
      router.refresh();
    } catch {
      const message = 'Could not reach the server. Check your connection and try again.';
      setError(message);
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  }

  if (created) {
    return (
      <div className="rounded-md border border-emerald-600/30 bg-emerald-50 p-4 text-sm dark:bg-emerald-950/30">
        <p className="font-medium text-emerald-800 dark:text-emerald-300">
          {created.password ? 'Coach account created' : 'Coach added to this gym'}
        </p>
        <p className="mt-1 text-zinc-700 dark:text-zinc-300">
          Email: <span className="font-mono">{created.email}</span>
          {created.password && (
            <>
              <br />
              Temp password: <span className="font-mono">{created.password}</span>
            </>
          )}
        </p>
        <p className="mt-1 text-xs text-zinc-500">
          {created.password
            ? "This password is shown once — pass it to the coach now; it can't be retrieved later."
            : 'They already had an account and can switch to this gym from their own Settings page.'}
        </p>
        <button
          onClick={() => setCreated(null)}
          className="mt-3 text-sm font-medium text-emerald-700 underline dark:text-emerald-400"
        >
          Add another
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-2">
      <input
        type="email"
        required
        placeholder="new-coach@example.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="w-full min-w-0 flex-1 rounded-md border border-black/10 bg-transparent px-2.5 py-1.5 text-sm dark:border-white/10"
      />
      <button
        type="submit"
        disabled={submitting}
        className="shrink-0 rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-accent-foreground disabled:opacity-50"
      >
        {submitting ? 'Adding…' : 'Add coach'}
      </button>
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
    </form>
  );
}

// Gated on is_gym_admin in the parent (CoachSettingsShell) -- every write here is also
// independently enforced server-side (set_gym_name/set_gym_admin RPCs check is_gym_admin
// themselves, and /api/gym/create-coach re-checks it), so this component isn't the security
// boundary, just where the affordance lives.
export function GymAdminSection({
  gymName,
  timezone,
  blackoutStart,
  blackoutEnd,
  roster,
  currentUserId,
}: {
  gymName: string;
  timezone: string;
  blackoutStart: string | null;
  blackoutEnd: string | null;
  roster: GymCoachRow[];
  currentUserId: string;
}) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Gym name</h3>
        <GymNameForm initialName={gymName} />
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Booking rules</h3>
        <BookingRulesForm timezone={timezone} blackoutStart={blackoutStart} blackoutEnd={blackoutEnd} />
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Coaches at this gym</h3>
        <div className="space-y-2">
          {roster.map((coach) => (
            <CoachRow key={coach.id} coach={coach} currentUserId={currentUserId} />
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Add a coach</h3>
        <AddCoachForm />
      </div>
    </div>
  );
}
