'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAction } from '@/app/_components/useAction';
import { useToast } from '@/app/_components/ToastProvider';
import { useConfirm } from '@/app/_components/ConfirmDialog';
import { DropdownMenu } from '@/app/_components/DropdownMenu';
import { inputCls } from '@/app/_components/ui';
import { SetPasswordLinkCard } from '@/app/coach/_components/SetPasswordLinkCard';
import { useActiveGymId } from '@/app/coach/_components/CoachGymsContext';
import {
  reassignClients,
  removeCoachFromGym,
  renameGym,
  setCoachAdmin,
  setGymReferralUrl,
  updateGymBookingSettings,
  type GymCoachRow,
} from '@/lib/data/gym';
import {
  ownerReassignClients,
  ownerRemoveCoachFromGym,
  ownerRenameGym,
  ownerSetBookingSettings,
  ownerSetGymAdmin,
  ownerSetReferralUrl,
} from '@/lib/data/owner';
import { isValidEmail, normaliseEmail } from '@/lib/accountCreation';
import { fail, ok } from '@/lib/data/result';
import { blackoutProblem, referralUrlProblem, timezoneChangeBody } from '@/lib/gymSettings';
import { prettyName } from '@/lib/gymNames';

// The gym's settings and team, used in two places: a gym admin's own Settings page, and the owner's page for any gym in the organisation
// (R37). `scope` says which: the same forms call the gym admin's functions or the owner's, and every one of them is checked again by the
// database, so this component is where the controls live, not the security boundary.
export type GymScope = { kind: 'admin' } | { kind: 'owner'; gymId: string };

export interface TeamMember {
  id: string;
  email: string;
  displayName: string | null;
  isAdmin: boolean;
  // Members assigned to this coach at this gym.
  members: number;
}

export const teamFromRoster = (roster: GymCoachRow[]): TeamMember[] =>
  roster.map((c) => ({ id: c.id, email: c.email, displayName: c.displayName, isAdmin: c.isGymAdmin, members: c.members }));

// The name to show for a coach: their display name, or a readable form of their address when they have none. The address is the second
// line, so it is never printed twice.
const nameOf = (coach: Pick<TeamMember, 'displayName' | 'email'>): string => coach.displayName?.trim() || prettyName(coach.email);

// The gym the forms act on: the one the page was drawn for (a gym admin's active gym) or the one the owner is managing.
function useScopeGymId(scope: GymScope): string | null {
  const active = useActiveGymId();
  return scope.kind === 'owner' ? scope.gymId : active;
}

export function GymNameForm({ initialName, scope = { kind: 'admin' } }: { initialName: string; scope?: GymScope }) {
  const { run, busy } = useAction();
  const activeGymId = useActiveGymId();
  const [name, setName] = useState(initialName);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || name.trim() === initialName) return;
    await run(() => (scope.kind === 'owner' ? ownerRenameGym(scope.gymId, name.trim()) : renameGym(name.trim(), activeGymId)), { success: 'Gym name saved' });
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-2">
      <input
        aria-label="Gym name"
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
export function BookingRulesForm({
  timezone,
  blackoutStart,
  blackoutEnd,
  scope = { kind: 'admin' },
}: {
  timezone: string;
  blackoutStart: string | null;
  blackoutEnd: string | null;
  scope?: GymScope;
}) {
  const { run, busy } = useAction();
  const activeGymId = useActiveGymId();
  const confirm = useConfirm();
  const [tz, setTz] = useState(timezone);
  const [useBlackout, setUseBlackout] = useState(blackoutStart != null && blackoutEnd != null);
  const [start, setStart] = useState(blackoutStart?.slice(0, 5) ?? '23:00');
  const [end, setEnd] = useState(blackoutEnd?.slice(0, 5) ?? '05:00');
  const zones = TIMEZONES.includes(tz) ? TIMEZONES : [tz, ...TIMEZONES];
  const problem = blackoutProblem(useBlackout, start, end);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (problem) return;
    if (tz !== timezone) {
      const okToChange = await confirm({
        title: `Change the gym's timezone to ${tz}?`,
        body: timezoneChangeBody(timezone, tz),
        confirmLabel: 'Change timezone',
        destructive: true,
      });
      if (!okToChange) return;
    }
    const from = useBlackout ? start : null;
    const until = useBlackout ? end : null;
    await run(() => (scope.kind === 'owner' ? ownerSetBookingSettings(scope.gymId, tz, from, until) : updateGymBookingSettings(tz, from, until, activeGymId)), {
      success: 'Booking rules saved',
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="space-y-1">
        <label htmlFor="gym-timezone" className="text-xs font-medium text-zinc-500">
          Timezone
        </label>
        <select id="gym-timezone" value={tz} onChange={(e) => setTz(e.target.value)} className={inputCls}>
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
            <label htmlFor="blackout-from" className="text-xs font-medium text-zinc-500">
              From
            </label>
            <input id="blackout-from" type="time" value={start} onChange={(e) => setStart(e.target.value)} className={inputCls} />
          </div>
          <div className="space-y-1">
            <label htmlFor="blackout-until" className="text-xs font-medium text-zinc-500">
              Until
            </label>
            <input id="blackout-until" type="time" value={end} onChange={(e) => setEnd(e.target.value)} className={inputCls} />
          </div>
        </div>
      )}
      {problem && (
        <p className="text-xs text-danger" role="alert">
          {problem}
        </p>
      )}
      <p className="text-xs text-zinc-500">
        A cancellation deadline that would fall inside the blackout moves back to its start, so an early-morning class
        must be cancelled the evening before.
      </p>
      <button
        type="submit"
        disabled={busy || !!problem}
        className="rounded-full bg-accent px-5 py-2.5 text-sm font-bold text-accent-foreground disabled:opacity-50"
      >
        Save booking rules
      </button>
    </form>
  );
}

// The page members share to refer a friend (R16). Empty means the Refer a friend screen is hidden for this gym's members.
export function ReferralLinkForm({ initialUrl, scope = { kind: 'admin' } }: { initialUrl: string | null; scope?: GymScope }) {
  const { run, busy } = useAction();
  const activeGymId = useActiveGymId();
  const [url, setUrl] = useState(initialUrl ?? '');
  const problem = referralUrlProblem(url);
  const unchanged = url.trim() === (initialUrl ?? '');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (problem || unchanged) return;
    await run(() => (scope.kind === 'owner' ? ownerSetReferralUrl(scope.gymId, url) : setGymReferralUrl(url, activeGymId)), {
      success: url.trim() ? 'Referral link saved' : 'Referral link removed',
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      <div className="flex items-center gap-2">
        <input
          type="url"
          inputMode="url"
          aria-label="Referral link"
          placeholder="https://example.com/refer"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          maxLength={500}
          className={`${inputCls} min-w-0 flex-1`}
        />
        <button
          type="submit"
          disabled={busy || !!problem || unchanged}
          className="shrink-0 rounded-full bg-accent px-5 py-2.5 text-sm font-bold text-accent-foreground disabled:opacity-50"
        >
          Save
        </button>
      </div>
      {problem && url.trim() && (
        <p className="text-xs text-danger" role="alert">
          {problem}
        </p>
      )}
      <p className="text-xs text-zinc-500">The page members share with a friend. Leave it empty to hide the Refer a friend screen for this gym.</p>
    </form>
  );
}

// Calls /api/gym/deactivate-coach: a coach with no gym left should not be able to sign in. Returns a result useAction understands.
async function switchOffLogin(gymId: string | null, coachId: string) {
  if (!gymId) return fail({ message: 'They were removed, but their login could not be switched off here. Ask the owner to switch it off.' });
  try {
    const res = await fetch('/api/gym/deactivate-coach', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gymId, coachId, action: 'deactivate' }),
    });
    if (res.ok) return ok();
    const body = await res.json().catch(() => ({}));
    return fail({ message: `They were removed from the gym, but their login is still on: ${body.error ?? 'please ask the owner to switch it off.'}` });
  } catch {
    return fail({ message: 'They were removed from the gym, but their login is still on (no connection). Ask the owner to switch it off.' });
  }
}

function CoachRow({
  coach,
  others,
  currentUserId,
  isAdmin,
  adminCount,
  onChange,
  scope,
}: {
  coach: TeamMember;
  others: TeamMember[];
  currentUserId: string;
  isAdmin: boolean;
  adminCount: number;
  onChange: (id: string, admin: boolean) => void;
  scope: GymScope;
}) {
  const { run, busy } = useAction();
  const gymId = useScopeGymId(scope);
  const activeGymId = useActiveGymId();
  const confirm = useConfirm();
  const toast = useToast();
  const label = nameOf(coach);
  const self = coach.id === currentUserId;
  const [moving, setMoving] = useState(false);
  const [receiver, setReceiver] = useState('');
  const receiving = others.find((o) => o.id === receiver);

  async function handleToggle() {
    const next = !isAdmin;
    if (!next && adminCount <= 1) {
      toast.error('The gym needs at least one admin.');
      return;
    }
    const okToChange = await confirm({
      title: next ? `Make ${label} a gym admin?` : `Remove admin rights from ${label}?`,
      body: next
        ? 'Admins can change gym settings and booking rules, add coaches, and see the whole gym.'
        : self
          ? 'You will lose access to the gym settings, the coach list and the whole-gym views straight away.'
          : 'They will lose access to the gym settings, the coach list and the whole-gym views.',
      confirmLabel: next ? 'Make admin' : 'Remove admin',
      destructive: !next,
    });
    if (!okToChange) return;
    // The database refuses to remove the last admin and says so; that sentence is shown as it comes back (GA1).
    await run(() => (scope.kind === 'owner' ? ownerSetGymAdmin(scope.gymId, coach.id, next) : setCoachAdmin(coach.id, next, activeGymId)), {
      success: next ? `${label} is now a gym admin` : 'Admin rights removed',
      onDone: () => onChange(coach.id, next),
    });
  }

  async function handleMove() {
    if (!receiving) return;
    const count = coach.members;
    const okToMove = await confirm({
      title: `Move ${count} member${count === 1 ? '' : 's'} from ${label} to ${nameOf(receiving)}?`,
      body: `${nameOf(receiving)} becomes their coach straight away and gets their chat, check-ins and programmes; ${label} loses them. Open red flags move too. The members are not told automatically, so message them if you want them to know.`,
      confirmLabel: 'Move members',
      destructive: true,
    });
    if (!okToMove) return;
    await run(
      async () => {
        const res = scope.kind === 'owner' ? await ownerReassignClients(scope.gymId, coach.id, receiving.id) : await reassignClients(coach.id, receiving.id, activeGymId);
        if (!res.ok) return res;
        toast.success(`Moved ${res.moved} member${res.moved === 1 ? '' : 's'} to ${nameOf(receiving)}`);
        return ok();
      },
      { onDone: () => setMoving(false) }
    );
  }

  async function handleRemove() {
    if (self) {
      toast.error('You cannot remove yourself from the gym.');
      return;
    }
    if (coach.members > 0) {
      toast.error(`${label} still has ${coach.members} member${coach.members === 1 ? '' : 's'}. Move them to another coach first.`);
      setMoving(true);
      return;
    }
    const okToRemove = await confirm({
      title: `Remove ${label} from this gym?`,
      body: 'They lose access to this gym straight away. If it is the only gym they work at, their login is switched off as well.',
      confirmLabel: 'Remove from gym',
      destructive: true,
    });
    if (!okToRemove) return;
    await run(
      async () => {
        const res = scope.kind === 'owner' ? await ownerRemoveCoachFromGym(scope.gymId, coach.id) : await removeCoachFromGym(coach.id, activeGymId);
        if (!res.ok) return res;
        if (res.deactivated) return switchOffLogin(gymId, coach.id);
        return ok();
      },
      { success: `${label} was removed from the gym` }
    );
  }

  return (
    <div className="rounded-xl border border-black/10 p-3 dark:border-white/10">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-black dark:text-zinc-50">
            {label}
            {self && <span className="ml-1.5 text-xs font-normal text-zinc-400">(you)</span>}
          </p>
          <p className="truncate text-xs text-zinc-500">{coach.email}</p>
          <p className="text-xs text-zinc-400">
            {coach.members} member{coach.members === 1 ? '' : 's'}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            onClick={handleToggle}
            disabled={busy}
            className={`rounded-full px-4 py-2 text-xs font-bold disabled:opacity-50 ${
              isAdmin
                ? 'bg-accent-soft text-accent'
                : 'border border-black/10 text-zinc-500 hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/5'
            }`}
          >
            {isAdmin ? 'Admin' : 'Make admin'}
          </button>
          <DropdownMenu
            triggerLabel={`Actions for ${label}`}
            items={[
              { label: 'Move members…', onSelect: () => setMoving((v) => !v), disabled: busy || coach.members === 0 || others.length === 0 },
              { label: 'Remove from gym', onSelect: () => void handleRemove(), destructive: true, disabled: busy || self },
            ]}
          />
        </div>
      </div>
      {moving && (
        <div className="mt-3 space-y-2 border-t border-black/[.06] pt-3 dark:border-white/10">
          <label htmlFor={`move-${coach.id}`} className="text-xs font-medium text-zinc-500">
            Move {coach.members} member{coach.members === 1 ? '' : 's'} to
          </label>
          <select id={`move-${coach.id}`} value={receiver} onChange={(e) => setReceiver(e.target.value)} className={inputCls}>
            <option value="">Choose a coach…</option>
            {others.map((o) => (
              <option key={o.id} value={o.id}>
                {nameOf(o)} ({o.members} member{o.members === 1 ? '' : 's'})
              </option>
            ))}
          </select>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy || !receiving}
              onClick={() => void handleMove()}
              className="rounded-full bg-accent px-4 py-2 text-xs font-bold text-accent-foreground disabled:opacity-50"
            >
              Move members
            </button>
            <button type="button" onClick={() => setMoving(false)} className="px-2 py-2 text-xs font-semibold text-zinc-500 underline">
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// The coaches at the gym with their admin switch, members, and the move and remove actions.
export function TeamList({ team, currentUserId, scope = { kind: 'admin' } }: { team: TeamMember[]; currentUserId: string; scope?: GymScope }) {
  const [adminIds, setAdminIds] = useState(() => new Set(team.filter((c) => c.isAdmin).map((c) => c.id)));
  function setAdmin(id: string, admin: boolean) {
    setAdminIds((prev) => {
      const next = new Set(prev);
      if (admin) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  return (
    <div className="space-y-2">
      {team.map((coach) => (
        <CoachRow
          key={coach.id}
          coach={coach}
          others={team.filter((c) => c.id !== coach.id)}
          currentUserId={currentUserId}
          isAdmin={adminIds.has(coach.id)}
          adminCount={adminIds.size}
          onChange={setAdmin}
          scope={scope}
        />
      ))}
    </div>
  );
}

// Adds a coach by email. A new address gets a login and a one-time link to choose a password; an address that already belongs to a coach is
// added to this gym and the answer says who, so nobody is attached silently (CM2). No password is shown anywhere.
export function AddCoachForm({ scope = { kind: 'admin' } }: { scope?: GymScope }) {
  const router = useRouter();
  const toast = useToast();
  const activeGymId = useActiveGymId();
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ email: string; name: string; existingAccount: boolean; link: string | null; warning: string | null } | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const clean = normaliseEmail(email);
    if (!isValidEmail(clean)) {
      setError('Enter a valid email address.');
      return;
    }
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch('/api/gym/create-coach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(scope.kind === 'owner' ? { email: clean, gymId: scope.gymId } : { email: clean, expectedGymId: activeGymId }),
      });
      const body = await res.json();

      if (!res.ok) {
        const message = body.error ?? 'Failed to add the coach';
        setError(message);
        toast.error(message);
        return;
      }

      setCreated({ email: body.email, name: body.name ?? prettyName(body.email), existingAccount: body.existingAccount === true, link: body.link ?? null, warning: body.warning ?? null });
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
      <SetPasswordLinkCard
        who="coach"
        title={created.existingAccount ? `${created.name} added to this gym` : 'Coach account created'}
        email={created.email}
        existingAccount={created.existingAccount}
        note={created.existingAccount ? 'They already had a login, so no new account was made. They can switch to this gym from their own Settings page.' : undefined}
        link={created.link}
        warning={created.warning}
        onAnother={() => setCreated(null)}
      />
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      <div className="flex items-center gap-2">
        <input
          type="email"
          required
          aria-label="New coach email"
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
      </div>
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      <p className="text-xs text-zinc-500">If the address already belongs to a coach, they are added to this gym with their existing login.</p>
    </form>
  );
}

// Gated on is_gym_admin in the parent (CoachSettingsShell) -- every write here is also
// independently enforced server-side (the gym functions check is_gym_admin themselves, and
// /api/gym/create-coach re-checks it), so this component isn't the security boundary, just
// where the affordance lives.
export function GymAdminSection({
  gymName,
  timezone,
  blackoutStart,
  blackoutEnd,
  referralUrl = null,
  roster,
  currentUserId,
}: {
  gymName: string;
  timezone: string;
  blackoutStart: string | null;
  blackoutEnd: string | null;
  referralUrl?: string | null;
  roster: GymCoachRow[];
  currentUserId: string;
}) {
  const team = teamFromRoster(roster);
  // The list remembers who is an admin while it is open; a new roster from the server (after a move or a removal) starts it afresh.
  const teamKey = team.map((c) => `${c.id}:${c.isAdmin ? 1 : 0}:${c.members}`).join('|');

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
        <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Referral link</h3>
        <ReferralLinkForm initialUrl={referralUrl} />
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Coaches at this gym</h3>
        <TeamList key={teamKey} team={team} currentUserId={currentUserId} />
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Add a coach</h3>
        <AddCoachForm />
      </div>
    </div>
  );
}
