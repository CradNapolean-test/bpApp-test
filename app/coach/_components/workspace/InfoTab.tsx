import { EmptyState } from '@/app/_components/EmptyState';
import { Info } from 'lucide-react';
import type { ClientProfileRow } from '@/lib/data/types';

const MEASUREMENTS: { key: 'waist' | 'chest' | 'arm' | 'hips' | 'quad'; label: string }[] = [
  { key: 'waist', label: 'Waist' },
  { key: 'chest', label: 'Chest' },
  { key: 'arm', label: 'Arm' },
  { key: 'hips', label: 'Hips' },
  { key: 'quad', label: 'Quad' },
];

// Read-only summary of the client's own Setup answers -- the coach's at-a-glance "what's this
// client working toward" view. Editing still happens on the client's own Setup screen (or the
// coach's full dashboard drill-in at [clientId]/full), this tab is purely informational.
export function InfoTab({ profile }: { profile: ClientProfileRow | null }) {
  if (!profile) {
    return <EmptyState icon={Info} title="No setup yet" hint="This client hasn't filled out Setup yet." />;
  }

  const measurementRows = MEASUREMENTS.filter(
    ({ key }) => profile[`meas_${key}_start`] != null || profile[`meas_${key}_goal`] != null
  );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-black/[.05] p-4 dark:border-white/10">
          <p className="text-xs text-zinc-500">Goal</p>
          <p className="mt-1 font-bold text-black dark:text-zinc-50">{profile.goal_description || '—'}</p>
        </div>
        <div className="rounded-2xl border border-black/[.05] p-4 dark:border-white/10">
          <p className="text-xs text-zinc-500">Start → Goal weight</p>
          <p className="mt-1 font-bold text-black dark:text-zinc-50">
            {profile.start_weight} kg → {profile.goal_weight} kg
          </p>
        </div>
        <div className="rounded-2xl border border-black/[.05] p-4 dark:border-white/10">
          <p className="text-xs text-zinc-500">Diet approach</p>
          <p className="mt-1 font-bold text-black dark:text-zinc-50">{profile.diet_approach}</p>
        </div>
      </div>

      <div className="rounded-2xl border border-black/[.05] p-4 dark:border-white/10">
        <h3 className="font-bold text-black dark:text-zinc-50">Measurements (start → goal)</h3>
        {measurementRows.length === 0 ? (
          <p className="mt-2 text-sm text-zinc-500">No measurements recorded yet.</p>
        ) : (
          <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-5">
            {measurementRows.map(({ key, label }) => (
              <div key={key}>
                <p className="text-xs text-zinc-500">{label}</p>
                <p className="mt-0.5 font-bold text-black dark:text-zinc-50">
                  {profile[`meas_${key}_start`] ?? '—'} → {profile[`meas_${key}_goal`] ?? '—'}
                  {(profile[`meas_${key}_start`] != null || profile[`meas_${key}_goal`] != null) && ' cm'}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
