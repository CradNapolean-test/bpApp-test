'use client';

import { useState } from 'react';
import { ImageIcon } from 'lucide-react';
import { useAction } from '@/app/_components/useAction';
import { useConfirm } from '@/app/_components/ConfirmDialog';
import { EmptyState } from '@/app/_components/EmptyState';
import { addMeasurementLog, deletePhoto, uploadProgressPhoto } from '@/lib/data/progress';
import { toIsoDate } from '@/lib/utils/dates';
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
  const today = toIsoDate(new Date());
  const [photoDate, setPhotoDate] = useState(today);
  const [measurementDate, setMeasurementDate] = useState(today);
  const [measurements, setMeasurements] = useState<Record<string, string>>({});

  async function handleUpload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    // Capture the form element up front -- e.currentTarget is nulled out once the handler
    // yields at the first await, so resetting it afterwards would throw.
    const form = e.currentTarget;
    const formData = new FormData(form);
    formData.set('clientId', clientId);
    formData.set('date', photoDate);
    await runUpload(() => uploadProgressPhoto(formData), {
      success: 'Photo uploaded',
      onDone: () => form.reset(),
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
    await runMeasurement(() => addMeasurementLog(clientId, measurementDate, fields), {
      success: 'Measurements saved',
      onDone: () => setMeasurements({}),
    });
  }

  const inputCls = 'rounded-md border border-black/10 bg-transparent px-3 py-2 text-sm dark:border-white/10';

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-black/[.05] p-4 dark:border-white/10">
        <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Progress photos</h3>

        {!readOnly && (
          <form onSubmit={handleUpload} className="mt-3 flex flex-wrap items-end gap-2">
            <div className="space-y-1">
              <label className="text-xs font-medium text-zinc-500">Date</label>
              <input
                type="date"
                value={photoDate}
                onChange={(e) => setPhotoDate(e.target.value)}
                className={inputCls}
              />
            </div>
            <input type="file" name="file" accept="image/*" required className="text-sm" />
            <button
              type="submit"
              disabled={uploading}
              className="rounded-md bg-accent px-3 py-2 text-sm font-medium text-accent-foreground disabled:opacity-50"
            >
              {uploading ? 'Uploading…' : 'Upload'}
            </button>
          </form>
        )}

        {initialPhotos.length === 0 ? (
          <div className="mt-4">
            <EmptyState
              icon={ImageIcon}
              title="No progress photos yet"
              hint={readOnly ? 'Nothing uploaded yet.' : 'Upload one above to start tracking visual progress over time.'}
            />
          </div>
        ) : (
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
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
              <div className="flex items-center justify-between text-xs text-zinc-500">
                <span>{photo.photo_date}</span>
                {!readOnly && (
                  <button onClick={() => handleDeletePhoto(photo.id, photo.photo_date)} className="text-red-600 hover:underline dark:text-red-400">
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

        {!readOnly && (
          <form onSubmit={handleSaveMeasurement} className="mt-3 space-y-2">
            <div className="space-y-1">
              <label className="text-xs font-medium text-zinc-500">Date</label>
              <input
                type="date"
                value={measurementDate}
                onChange={(e) => setMeasurementDate(e.target.value)}
                className={inputCls}
              />
            </div>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
              {MEASUREMENT_FIELDS.map(({ key, label }) => (
                <div key={key} className="space-y-1">
                  <label className="text-xs font-medium text-zinc-500">{label}</label>
                  <input
                    type="number"
                    step="0.1"
                    value={measurements[key] ?? ''}
                    onChange={(e) => setMeasurements({ ...measurements, [key]: e.target.value })}
                    className={`${inputCls} w-full`}
                  />
                </div>
              ))}
            </div>
            <button
              type="submit"
              disabled={savingMeasurement}
              className="rounded-md bg-accent px-3 py-2 text-sm font-medium text-accent-foreground disabled:opacity-50"
            >
              {savingMeasurement ? 'Saving…' : 'Save measurements'}
            </button>
          </form>
        )}

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
    </div>
  );
}
