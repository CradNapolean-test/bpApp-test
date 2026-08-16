'use client';

import { useRef, useState } from 'react';
import { ImageIcon, Plus } from 'lucide-react';
import { useAction } from '@/app/_components/useAction';
import { useConfirm } from '@/app/_components/ConfirmDialog';
import { EmptyState } from '@/app/_components/EmptyState';
import { addMeasurementLog, deletePhoto, uploadProgressPhoto } from '@/lib/data/progress';
import { DEFAULT_TIMEZONE, todayIsoInTz } from '@/lib/utils/dates';
import { formatDelta, measurementDelta } from '@/lib/utils/measurementDeltas';
import type { ClientProfileRow, MeasurementLogRow, ProgressPhoto } from '@/lib/data/types';

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
      title: `Delete the photo from ${date}?`,
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
      <div className="rounded-2xl border border-black/[.05] p-4 dark:border-white/10">
        <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Progress photos</h3>

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
                    className="aspect-square w-full rounded-xl object-cover"
                  />
                ) : (
                  <div className="aspect-square w-full rounded-xl bg-black/5 dark:bg-white/5" />
                )}
                <div className="flex items-center justify-between text-sm">
                  <span className="text-zinc-500">
                    {new Date(photo.photo_date + 'T00:00:00Z').toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' })}
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

      <div className="rounded-2xl border border-black/[.05] p-4 dark:border-white/10">
        <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Measurements</h3>

        {initialMeasurements.length === 0 ? (
          <p className="mt-4 text-sm text-zinc-500">No measurements logged yet.</p>
        ) : (
          <>
            <p className="mt-3 text-xs text-zinc-500">Last logged {initialMeasurements[0].log_date}</p>
            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {MEASUREMENT_FIELDS.map(({ key, label }) => {
                const latest = initialMeasurements[0][key];
                const { vsStart } = measurementDelta(initialMeasurements, profile, key);
                const deltaLabel = formatDelta(vsStart);
                return (
                  <div
                    key={key}
                    className="flex items-center justify-between rounded-xl border border-black/[.05] p-3 dark:border-white/10"
                  >
                    <span className="text-sm font-medium text-black dark:text-zinc-50">{label}</span>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-black dark:text-zinc-50">
                        {latest != null ? `${latest}cm` : '—'}
                      </p>
                      {deltaLabel && <p className="text-[10px] font-medium text-success">{deltaLabel} vs start</p>}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {!readOnly && (
        <div className="rounded-2xl border border-black/[.05] p-4 dark:border-white/10">
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
    </div>
  );
}
