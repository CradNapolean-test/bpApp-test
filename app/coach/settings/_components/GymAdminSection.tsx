'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAction } from '@/app/_components/useAction';
import { useToast } from '@/app/_components/ToastProvider';
import { useConfirm } from '@/app/_components/ConfirmDialog';
import { inputCls } from '@/app/_components/ui';
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
        className={`${inputCls} min-w-0 flex-1`}
      />
      <button
        type="submit"
        disabled={busy || !name.trim() || name.trim() === initialName}
        className="shrink-0 rounded-full bg-accent px-5 py-2.5 text-sm font-bold text-accent-foreground disabled:opacity-50"
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
  const confirm = useConfirm();
  const [tz, setTz] = useState(timezone);
  const [useBlackout, setUseBlackout] = useState(blackoutStart != null && blackoutEnd != null);
  const [start, setStart] = useState(blackoutStart?.slice(0, 5) ?? '23:00');
  const [end, setEnd] = useState(blackoutEnd?.slice(0, 5) ?? '05:00');
  const zones = TIMEZONES.includes(tz) ? TIMEZONES : [tz, ...TIMEZONES];

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (tz !== timezone) {
      const ok = await confirm({
        title: `Change the gym's timezone to ${tz}?`,
        body: 'Class times are wall-clock times at the gym, so every class, cancellation deadline, "today" and the weekly reset will follow the new timezone. Only change this if the gym moved or the timezone was wrong.',
        confirmLabel: 'Change timezone',
        destructive: true,
      });
      if (!ok) return;
    }
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
          className={inputCls}
        >
          {zones.map((z) => (
            <option key={z} value={z}>
              {z}
            </option>
          ))}
        </select>
      </div>
      <label className="flex items-center gap-2.5 py-1 text-sm">
        <input type="checkbox" className="h-4 w-4" checked={useBlackout} onChange={(e) => setUseBlackout(e.target.checked)} />
        Overnight blackout for cancellations
      </label>
      {useBlackout && (
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <label className="text-xs font-medium text-zinc-500">From</label>
            <input type="time" value={start} onChange={(e) => setStart(e.target.value)} className={inputCls} />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-zinc-500">Until</label>
            <input type="time" value={end} onChange={(e) => setEnd(e.target.value)} className={inputCls} />
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
        className="rounded-full bg-accent px-5 py-2.5 text-sm font-bold text-accent-foreground disabled:opacity-50"
      >
        Save booking rules
      </button>
    </form>
  );
}

function CoachRow({
  coach,
  currentUserId,
  isAdmin,
  adminCount,
  onChange,
}: {
  coach: GymCoachRow;
  currentUserId: string;
  isAdmin: boolean;
  adminCount: number;
  onChange: (id: string, admin: boolean) => void;
}) {
  const { run, busy } = useAction();
  const confirm = useConfirm();
  const toast = useToast();
  const label = coach.displayName ?? coach.email;
  const self = coach.id === currentUserId;

  async function handleToggle() {
    const next = !isAdmin;
    if (!next && adminCount <= 1) {
      toast.error('The gym needs at least one admin.');
      return;
    }
    const ok = await confirm({
      title: next ? `Make ${label} a gym admin?` : `Remove admin rights from ${label}?`,
      body: next
        ? 'Admins can change gym settings and booking rules, add coaches, and see the whole gym.'
        : self
          ? 'You will lose access to the gym settings, the coach list and the whole-gym views straight away.'
          : 'They will lose access to the gym settings, the coach list and the whole-gym views.',
      confirmLabel: next ? 'Make admin' : 'Remove admin',
      destructive: !next,
    });
    if (!ok) return;
    await run(() => setCoachAdmin(coach.id, next), {
      success: next ? `${label} is now a gym admin` : 'Admin rights removed',
      onDone: () => onChange(coach.id, next),
    });
  }

  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-black/10 p-3 dark:border-white/10">
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-black dark:text-zinc-50">
          {label}
          {self && <span className="ml-1.5 text-xs font-normal text-zinc-400">(you)</span>}
        </p>
        <p className="truncate text-xs text-zinc-500">{coach.email}</p>
      </div>
      <button
        onClick={handleToggle}
        disabled={busy}
        className={`shrink-0 rounded-full px-4 py-2 text-xs font-bold disabled:opacity-50 ${
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

  function copyText(text: string, done: string) {
    navigator.clipboard.writeText(text).then(
      () => toast.success(done),
      () => toast.error('Could not copy. Select the text and copy it by hand.')
    );
  }

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
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {created.password && (
            <button type="button" onClick={() => copyText(created.password!, 'Password copied')} className="rounded-full border border-emerald-700/30 px-4 py-2 text-xs font-bold text-emerald-800 dark:text-emerald-300">
              Copy password
            </button>
          )}
          <button
            type="button"
            onClick={() =>
              copyText(
                created.password
                  ? `Hi, your Ballistic login is ready.\nEmail: ${created.email}\nTemporary password: ${created.password}\nLog in at ${window.location.origin}/login and change your password.`
                  : `Hi, you have been added to our gym on Ballistic. Log in at ${window.location.origin}/login with your existing details and switch gym from Settings.`,
                'Message copied'
              )
            }
            className="rounded-full border border-emerald-700/30 px-4 py-2 text-xs font-bold text-emerald-800 dark:text-emerald-300"
          >
            Copy login message
          </button>
          <button onClick={() => setCreated(null)} className="px-2 py-2 text-sm font-semibold text-emerald-700 underline dark:text-emerald-400">
            Add another
          </button>
        </div>
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
        className={`${inputCls} min-w-0 flex-1`}
      />
      <button
        type="submit"
        disabled={submitting}
        className="shrink-0 rounded-full bg-accent px-5 py-2.5 text-sm font-bold text-accent-foreground disabled:opacity-50"
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
  const [adminIds, setAdminIds] = useState(() => new Set(roster.filter((c) => c.isGymAdmin).map((c) => c.id)));
  function setAdmin(id: string, admin: boolean) {
    setAdminIds((prev) => {
      const next = new Set(prev);
      if (admin) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  return (
    <div className="space-y-6">
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
            <CoachRow key={coach.id} coach={coach} currentUserId={currentUserId} isAdmin={adminIds.has(coach.id)} adminCount={adminIds.size} onChange={setAdmin} />
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
