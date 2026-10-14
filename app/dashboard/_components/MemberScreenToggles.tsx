'use client';

import { useAction } from '@/app/_components/useAction';
import { setMemberMetricEnabled, setMemberScreenEnabled } from '@/lib/data/clientScreenSettings';
import { CHECKIN_METRICS, toDisabledMetricSet } from '@/lib/checkinMetrics';
import { DISABLEABLE_SCREENS, toDisabledScreenSet, toEffectiveDisabledScreenSet } from './categories';

// Coach: switch individual screens off for one member. The member's plan sets the ceiling (a screen the
// plan leaves out shows as "not in plan" and cannot be switched on here); this can only take away more.
export function MemberScreenToggles({
  clientId,
  disabledScreens,
  planIncludedScreens,
  planName,
}: {
  clientId: string;
  disabledScreens: string[];
  planIncludedScreens: string[] | null;
  planName: string | null;
}) {
  const { run, busy } = useAction();
  const off = toDisabledScreenSet(disabledScreens);
  const offByPlan = toEffectiveDisabledScreenSet([], planIncludedScreens);

  return (
    <div className="rounded-2xl border border-black/[.05] bg-card p-4 dark:border-white/10">
      <p className="text-sm font-extrabold text-black dark:text-zinc-50">Screens for this member</p>
      <p className="mt-0.5 text-xs text-zinc-500">
        Untick to hide a screen from them{planName ? `. Their plan (${planName}) already hides some` : ''}. You always see everything.
      </p>
      <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5">
        {DISABLEABLE_SCREENS.map((screen) => {
          const blocked = offByPlan.has(screen) && !off.has(screen);
          return (
            <label key={screen} className={`flex items-center gap-2 text-sm ${blocked ? 'text-zinc-400' : 'text-black dark:text-zinc-50'}`}>
              <input
                type="checkbox"
                disabled={busy || blocked}
                checked={!blocked && !off.has(screen)}
                onChange={(e) => run(() => setMemberScreenEnabled(clientId, screen, e.target.checked))}
              />
              {screen}
              {blocked && <span className="text-[10px] uppercase tracking-wide">not in plan</span>}
            </label>
          );
        })}
      </div>
    </div>
  );
}

// Coach: which daily check-in measures this member is asked for (sleep on, steps off, and so on).
export function MemberMetricToggles({ clientId, disabledMetrics }: { clientId: string; disabledMetrics: string[] }) {
  const { run, busy } = useAction();
  const off = toDisabledMetricSet(disabledMetrics);
  return (
    <div className="rounded-2xl border border-black/[.05] bg-card p-4 dark:border-white/10">
      <p className="text-sm font-extrabold text-black dark:text-zinc-50">Daily check-in measures</p>
      <p className="mt-0.5 text-xs text-zinc-500">Untick a measure to stop asking this member for it. Your weekly summary only lists what is on.</p>
      <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5">
        {CHECKIN_METRICS.map((m) => (
          <label key={m.key} className="flex items-center gap-2 text-sm text-black dark:text-zinc-50">
            <input
              type="checkbox"
              disabled={busy}
              checked={!off.has(m.key)}
              onChange={(e) => run(() => setMemberMetricEnabled(clientId, m.key, e.target.checked))}
            />
            {m.label}
            <span className="text-[10px] uppercase tracking-wide text-zinc-400">{m.kind === 'rating' ? 'rating' : 'number'}</span>
          </label>
        ))}
      </div>
    </div>
  );
}
