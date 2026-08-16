'use client';

import { useRouter } from 'next/navigation';
import { useAction } from '@/app/_components/useAction';
import { switchActiveGym, type MyGymRow } from '@/lib/data/gym';

// Only rendered by CoachSettingsShell when the caller belongs to more than one gym -- a
// single-gym coach's Settings page is unchanged. Switching moves profiles.gym_id/is_gym_admin
// (0056) to the chosen membership, so a full refresh is needed afterward: every server-loaded
// page (Clients, Classes, Library, this page's own admin section) depends on the active gym.
export function GymSwitcher({ gyms }: { gyms: MyGymRow[] }) {
  const router = useRouter();
  const { run, busy } = useAction();

  async function handleSwitch(gymId: string) {
    await run(() => switchActiveGym(gymId), { success: 'Switched gyms' });
    router.refresh();
  }

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Your gyms</h3>
      <div className="space-y-2">
        {gyms.map((gym) => (
          <button
            key={gym.gymId}
            type="button"
            disabled={busy || gym.isActive}
            onClick={() => handleSwitch(gym.gymId)}
            className={`flex w-full items-center justify-between gap-3 rounded-lg border p-3 text-left disabled:opacity-100 ${
              gym.isActive
                ? 'border-accent/30 bg-accent-soft'
                : 'border-black/10 hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/5'
            }`}
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-black dark:text-zinc-50">{gym.gymName}</p>
              {gym.isGymAdmin && <p className="text-xs text-zinc-500">Admin</p>}
            </div>
            {gym.isActive && <span className="shrink-0 text-xs font-medium text-accent">Active</span>}
          </button>
        ))}
      </div>
    </div>
  );
}
