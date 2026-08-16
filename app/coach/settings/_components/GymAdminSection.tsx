'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAction } from '@/app/_components/useAction';
import { useToast } from '@/app/_components/ToastProvider';
import { renameGym, setCoachAdmin, type GymCoachRow } from '@/lib/data/gym';

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
  const [created, setCreated] = useState<{ email: string; password: string } | null>(null);

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

      setCreated({ email: body.email, password: body.password });
      setEmail('');
      toast.success('Coach account created');
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
        <p className="font-medium text-emerald-800 dark:text-emerald-300">Coach account created</p>
        <p className="mt-1 text-zinc-700 dark:text-zinc-300">
          Email: <span className="font-mono">{created.email}</span>
          <br />
          Temp password: <span className="font-mono">{created.password}</span>
        </p>
        <p className="mt-1 text-xs text-zinc-500">
          This password is shown once — pass it to the coach now; it can&apos;t be retrieved later.
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
  roster,
  currentUserId,
}: {
  gymName: string;
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
