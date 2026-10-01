'use client';

import { useRef, useState } from 'react';
import { Columns2, X } from 'lucide-react';
import { ImageIcon, Plus } from 'lucide-react';
import { useAction } from '@/app/_components/useAction';
import { useConfirm } from '@/app/_components/ConfirmDialog';
import { EmptyState } from '@/app/_components/EmptyState';
import { addMeasurementLog, deletePhoto, uploadProgressPhoto } from '@/lib/data/progress';
import { DEFAULT_TIMEZONE, todayIsoInTz } from '@/lib/utils/dates';
import { formatDelta, measurementDelta } from '@/lib/utils/measurementDeltas';
import type { ClientProfileRow, MeasurementLogRow, ProgressPhoto } from '@/lib/data/types';

const longDate = (iso: string) =>
  new Date(iso + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

const MEASUREMENT_FIELDS: { key: keyof Omit<MeasurementLogRow, 'id' | 'client_id' | 'log_date' | 'created_at'>; label: string }[] = [
  { key: 'arm', label: 'Arm' },
  { key: 'chest', label: 'Chest' },
  { key: 'waist', label: 'Waist' },
  { key: 'hips', label: 'Hips' },
  { key: 'quad', label: 'Quad' },
];

export function ProgressTab({
  clientId,
  initialPhotos,
  initialMeasurements,
  profile,
  readOnly,
}: {
  clientId: string;
  initialPhotos: ProgressPhoto[];
  initialMeasurements: MeasurementLogRow[];
  profile: ClientProfileRow | null;
  readOnly: boolean;
}) {
  const confirm = useConfirm();
  const { run: runUpload, busy: uploading } = useAction();
  const { run: runDelete } = useAction();
  const { run: runMeasurement, busy: savingMeasurement } = useAction();
  // Photos/measurements are saved tagged with this date -- must be the client's local day
  // (matching dashboardBundle's server-side resolution), not raw UTC, or an entry logged near
  // a UTC boundary gets silently filed under the wrong calendar day.
  const today = todayIsoInTz(profile?.timezone ?? DEFAULT_TIMEZONE);
  const [measurements, setMeasurements] = useState<Record<string, string>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [viewing, setViewing] = useState<ProgressPhoto | null>(null);
  const [comparing, setComparing] = useState(false);
  // Photos arrive newest-first; default the comparison to oldest (before) vs newest (after).
  const [beforeId, setBeforeId] = useState<string | null>(null);
  const [afterId, setAfterId] = useState<string | null>(null);
  const withImage = initialPhotos.filter((p) => p.signedUrl);
  const beforePhoto = withImage.find((p) => p.id === beforeId) ?? withImage[withImage.length - 1];
  const afterPhoto = withImage.find((p) => p.id === afterId) ?? withImage[0];
  const daysBetween =
    beforePhoto && afterPhoto
      ? Math.round((Date.parse(afterPhoto.photo_date) - Date.parse(beforePhoto.photo_date)) / 86400000)
      : 0;

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const input = e.currentTarget;
    const file = input.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.set('file', file);
    formData.set('clientId', clientId);
    formData.set('date', today);
    await runUpload(() => uploadProgressPhoto(formData), {
      success: 'Photo uploaded',
      onDone: () => {
        input.value = '';
      },
    });
  }

  async function handleDeletePhoto(id: string, date: string) {
    const ok = await confirm({
      title: `Delete the photo from ${longDate(date)}?`,
      body: 'This cannot be undone.',
      destructive: true,
    });
    if (!ok) return;
    await runDelete(() => deletePhoto(id), { success: 'Photo deleted' });
  }

  async function handleSaveMeasurement(e: React.FormEvent) {
    e.preventDefault();
    const fields = Object.fromEntries(
      Object.entries(measurements)
        .filter(([, v]) => v !== '')
        .map(([k, v]) => [k, Number(v)])
    );
    await runMeasurement(() => addMeasurementLog(clientId, today, fields), {
      success: 'Measurements saved',
      onDone: () => setMeasurements({}),
    });
  }

  const inputCls = 'w-full rounded-xl border border-black/10 bg-transparent px-3.5 py-2.5 text-sm dark:border-white/10';
  const labelCls = 'text-sm font-semibold text-zinc-500';

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-black/[.05] bg-card p-4 dark:border-white/10">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Progress photos</h3>
          {withImage.length >= 2 && (
            <button
              type="button"
              onClick={() => setComparing(true)}
              className="flex items-center gap-1.5 rounded-full bg-accent px-3 py-1.5 text-xs font-bold text-accent-foreground"
            >
              <Columns2 className="h-3.5 w-3.5" /> Compare
            </button>
          )}
        </div>

        {initialPhotos.length === 0 && readOnly ? (
          <div className="mt-4">
            <EmptyState icon={ImageIcon} title="No progress photos yet" hint="Nothing uploaded yet." />
          </div>
        ) : (
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {!readOnly && (
              <div>
                <button
                  type="button"
                  disabled={uploading}
                  onClick={() => fileInputRef.current?.click()}
                  className="flex aspect-square w-full flex-col items-center justify-center gap-1 rounded-xl border-[1.5px] border-dashed border-black/15 text-sm font-semibold text-zinc-500 disabled:opacity-50 dark:border-white/15"
                >
                  <Plus className="h-5 w-5" />
                  {uploading ? 'Uploading…' : 'Add photo'}
                </button>
                <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleUpload} />
              </div>
            )}
            {initialPhotos.map((photo) => (
              <div key={photo.id} className="space-y-1">
                {photo.signedUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={photo.signedUrl}
                    alt={`Progress photo ${photo.photo_date}`}
                    onClick={() => setViewing(photo)}
                    className="aspect-square w-full cursor-pointer rounded-xl object-cover"
                  />
                ) : (
                  <div className="aspect-square w-full rounded-xl bg-black/5 dark:bg-white/5" />
                )}
                <div className="flex items-center justify-between text-sm">
                  <span className="text-zinc-500">
                    {longDate(photo.photo_date)}
                  </span>
                  {!readOnly && (
                    <button onClick={() => handleDeletePhoto(photo.id, photo.photo_date)} className="font-bold text-danger hover:underline">
                      Delete
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-black/[.05] bg-card p-4 dark:border-white/10">
        <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Measurements</h3>

        {initialMeasurements.length === 0 ? (
          <p className="mt-4 text-sm text-zinc-500">No measurements logged yet.</p>
        ) : (
          <>
            <p className="mt-3 text-xs text-zinc-500">Last logged {longDate(initialMeasurements[0].log_date)}</p>
            <div className="mt-2 divide-y divide-black/[.05] dark:divide-white/10">
              <div className="grid grid-cols-[1fr_3.5rem_3.5rem_3.5rem] gap-1 pb-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
                <span />
                <span className="text-right">Start</span>
                <span className="text-right">Last</span>
                <span className="text-right">Now</span>
              </div>
              {MEASUREMENT_FIELDS.map(({ key, label }) => {
                const latest = initialMeasurements[0][key];
                const start = profile?.[`meas_${key}_start` as keyof ClientProfileRow] as number | null | undefined;
                const last = initialMeasurements[1]?.[key] ?? null;
                const { vsStart, vsPrevious } = measurementDelta(initialMeasurements, profile, key);
                const deltaLabel = formatDelta(vsStart);
                // Good = moving towards the goal (waist/hips usually down, arm/chest/quad usually up).
                const goal = profile?.[`meas_${key}_goal` as keyof ClientProfileRow] as number | null | undefined;
                const towardsGoal = vsStart != null && start != null && goal != null && Math.abs(vsStart) >= 0.05
                  ? (goal - start) * vsStart > 0
                  : null;
                return (
                  <div key={key} className="py-2.5">
                    <div className="grid grid-cols-[1fr_3.5rem_3.5rem_3.5rem] items-center gap-1">
                      <span className="text-sm font-medium text-black dark:text-zinc-50">{label}</span>
                      <span className="text-right text-sm text-zinc-500">{start ?? '—'}</span>
                      <span className="text-right text-sm text-zinc-500">{last ?? '—'}</span>
                      <span className="text-right text-sm font-bold text-black dark:text-zinc-50">{latest ?? '—'}</span>
                    </div>
                    {deltaLabel && (
                      <p className={`mt-0.5 text-[11px] font-medium ${towardsGoal == null ? 'text-zinc-500' : towardsGoal ? 'text-success' : 'text-danger'}`}>
                        {deltaLabel}cm since you started
                        {formatDelta(vsPrevious) ? ` · ${formatDelta(vsPrevious)}cm since last time` : ''}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
            <p className="mt-1 text-[11px] text-zinc-400">All in cm.</p>
          </>
        )}
      </div>

      {!readOnly && (
        <div className="rounded-2xl border border-black/[.05] bg-card p-4 dark:border-white/10">
          <h3 className="font-bold text-black dark:text-zinc-50">Log new measurements</h3>
          <form onSubmit={handleSaveMeasurement} className="mt-3 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              {MEASUREMENT_FIELDS.map(({ key, label }) => (
                <div key={key} className="space-y-1">
                  <label className={labelCls}>{label} (cm)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={measurements[key] ?? ''}
                    onChange={(e) => setMeasurements({ ...measurements, [key]: e.target.value })}
                    className={inputCls}
                  />
                </div>
              ))}
            </div>
            <button
              type="submit"
              disabled={savingMeasurement}
              className="w-full rounded-full bg-accent py-3 text-sm font-bold text-accent-foreground disabled:opacity-50"
            >
              {savingMeasurement ? 'Saving…' : 'Save measurements'}
            </button>
          </form>
        </div>
      )}
      {comparing && beforePhoto && afterPhoto && (
        <div className="fixed inset-0 z-[70] flex flex-col overflow-y-auto bg-background p-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold text-black dark:text-zinc-50">Before &amp; after</h3>
            <button type="button" aria-label="Close comparison" onClick={() => setComparing(false)} className="rounded-full bg-black/5 p-2 dark:bg-white/10">
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3">
            {([['Before', beforePhoto, setBeforeId], ['After', afterPhoto, setAfterId]] as const).map(([label, photo, setId]) => (
              <div key={label} className="space-y-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400">{label}</p>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photo.signedUrl!} alt={`${label} photo ${photo.photo_date}`} className="aspect-[3/4] w-full rounded-xl object-cover" />
                <select
                  value={photo.id}
                  onChange={(e) => setId(e.target.value)}
                  className="w-full rounded-xl border border-black/10 bg-card px-2 py-2 text-sm dark:border-white/10"
                >
                  {withImage.map((p) => (
                    <option key={p.id} value={p.id}>{longDate(p.photo_date)}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>
          <p className="mt-4 text-center text-sm font-semibold text-zinc-500">
            {daysBetween === 0 ? 'Same day' : daysBetween > 0 ? `${daysBetween} days between photos` : 'Before photo is later than the after photo'}
          </p>
        </div>
      )}
      {viewing?.signedUrl && (
        <div className="fixed inset-0 z-[70] flex flex-col items-center justify-center bg-black/90 p-4" onClick={() => setViewing(null)}>
          <button type="button" aria-label="Close photo" className="absolute right-4 top-4 rounded-full bg-white/15 p-2 text-white">
            <X className="h-5 w-5" />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={viewing.signedUrl} alt={`Progress photo ${viewing.photo_date}`} className="max-h-[80vh] max-w-full rounded-xl object-contain" />
          <p className="mt-3 text-sm font-semibold text-white">{longDate(viewing.photo_date)}</p>
        </div>
      )}
    </div>
  );
}
