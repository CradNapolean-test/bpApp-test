'use client';

import { useRef, useState } from 'react';
import { Columns2, Download, X } from 'lucide-react';
import { Camera, ImageIcon, Trash2 } from 'lucide-react';
import { useAction } from '@/app/_components/useAction';
import { useToast } from '@/app/_components/ToastProvider';
import { MEASUREMENT_CM, isValidMeasurement, measurementMessage } from '@/lib/limits';
import { useConfirm } from '@/app/_components/ConfirmDialog';
import { EmptyState } from '@/app/_components/EmptyState';
import { addMeasurementLog, deletePhoto, uploadProgressPhoto } from '@/lib/data/progress';
import { shrinkImageFile } from '@/lib/utils/shrinkImage';
import { downloadPhoto, downloadSideBySide } from '@/lib/utils/downloadPhotos';
import { IDENTITY, ZoomablePhoto } from './ZoomablePhoto';
import { useStaggerIn } from '@/app/_components/motion/useStaggerIn';
import type { ZoomPan } from '@/lib/zoomPan';
import { useBackHandler } from '@/app/_components/useBackHandler';
import { useDialog } from '@/app/_components/useDialog';
import { DEFAULT_TIMEZONE, todayIsoInTz } from '@/lib/utils/dates';
import { NOTHING_TO_COMPARE, anythingToCompare, siteChangeText, siteSummary } from '@/lib/utils/measurementDeltas';
import type { ClientProfileRow, MeasurementLogRow, ProgressPhoto } from '@/lib/data/types';

const shortDate = (iso: string) => new Date(iso + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const cardCls = 'rounded-[20px] border border-black/[.08] bg-card p-4 dark:border-white/10';
const headCls = 'text-base font-extrabold text-black dark:text-zinc-50';

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
  const toast = useToast();
  // Photos/measurements are saved tagged with this date -- must be the client's local day
  // (matching dashboardBundle's server-side resolution), not raw UTC, or an entry logged near
  // a UTC boundary gets silently filed under the wrong calendar day.
  const today = todayIsoInTz(profile?.timezone ?? DEFAULT_TIMEZONE);
  const [measurements, setMeasurements] = useState<Record<string, string>>({});
  const photosArea = useRef<HTMLElement>(null);
  useStaggerIn(photosArea, '[data-photo]', initialPhotos.length > 0);
  // Choosing a photo reads and shrinks it first; that takes a moment on a big phone photo and used to show nothing (PT4).
  const [preparing, setPreparing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [viewing, setViewing] = useState<ProgressPhoto | null>(null);
  const [comparing, setComparing] = useState(false);
  // Photos arrive newest-first; default the comparison to oldest (before) vs newest (after).
  const [beforeId, setBeforeId] = useState<string | null>(null);
  const [afterId, setAfterId] = useState<string | null>(null);
  // Before/after zoom together so the same body part lines up in both; the single viewer has its own.
  const [compareZoom, setCompareZoom] = useState<ZoomPan>(IDENTITY);
  const [viewZoom, setViewZoom] = useState<ZoomPan>(IDENTITY);
  const { run: runDownload, busy: downloading } = useAction();
  useBackHandler(viewing != null, () => setViewing(null));
  useBackHandler(comparing, () => setComparing(false));
  // Both full-screen views are real dialogs (SH3): focus moves in and returns, Tab stays inside, Escape closes, the page behind is inert.
  const viewerRef = useDialog<HTMLDivElement>({ onClose: () => setViewing(null), active: viewing != null });
  const compareRef = useDialog<HTMLDivElement>({ onClose: () => setComparing(false), active: comparing });
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
    try {
      setPreparing(true);
      const formData = new FormData();
      formData.set('file', await shrinkImageFile(file));
      formData.set('clientId', clientId);
      formData.set('date', today);
      setPreparing(false);
      await runUpload(() => uploadProgressPhoto(formData), { success: 'Photo uploaded' });
    } finally {
      // Always cleared, even when the upload failed: otherwise choosing the same photo again does nothing (PT2).
      setPreparing(false);
      input.value = '';
    }
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
    // An empty form used to be saved as an empty entry (PT1).
    if (Object.keys(fields).length === 0) {
      toast.error('Enter at least one measurement to save.');
      return;
    }
    if (!Object.values(fields).every(isValidMeasurement)) {
      toast.error(measurementMessage);
      return;
    }
    await runMeasurement(() => addMeasurementLog(clientId, today, fields), {
      success: 'Measurements saved',
      onDone: () => setMeasurements({}),
    });
  }

  const inputCls = 'w-full rounded-xl border border-black/10 bg-transparent px-3.5 py-2.5 text-sm dark:border-white/10';
  const labelCls = 'text-sm font-semibold text-zinc-500';

  return (
    <div className="space-y-6">
      <section ref={photosArea} className="space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <h2 className={headCls}>Progress photos</h2>
          {withImage.length >= 2 && (
            <button type="button" onClick={() => setComparing(true)} className="flex min-h-11 items-center gap-1.5 px-1 text-[13px] font-bold text-accent">
              <Columns2 className="h-4 w-4" /> Compare
            </button>
          )}
        </div>

        {withImage.length >= 2 && beforePhoto && afterPhoto && (
          // Before and after side by side (the board): the first and latest unless others were picked in the comparison, which a tap opens.
          <button
            type="button"
            onClick={() => setComparing(true)}
            aria-label={`Compare ${longDate(beforePhoto.photo_date)} with ${longDate(afterPhoto.photo_date)}`}
            className="grid w-full grid-cols-2 gap-2 rounded-[20px] border border-black/[.08] bg-card p-2 text-left dark:border-white/10"
          >
            {([['Before', beforePhoto], ['After', afterPhoto]] as const).map(([label, photo]) => (
              <span key={label} data-photo className="block space-y-1.5">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photo.signedUrl!} alt="" className="aspect-[3/4] w-full rounded-[14px] object-cover" />
                <span className="block px-1 pb-0.5 text-xs font-bold text-black dark:text-zinc-50">
                  {label} · <span className="font-semibold text-zinc-500 dark:text-zinc-400">{shortDate(photo.photo_date)}</span>
                </span>
              </span>
            ))}
          </button>
        )}

        {initialPhotos.length === 0 ? (
          readOnly ? (
            <EmptyState icon={ImageIcon} title="No progress photos yet" hint="They have not uploaded any yet." />
          ) : (
            <p className={`${cardCls} text-sm text-zinc-500 dark:text-zinc-400`}>No photos yet. Take one each week in the same spot and light, and the change shows here.</p>
          )
        ) : (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {initialPhotos.map((photo) => (
              <div key={photo.id} data-photo>
                {photo.signedUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={photo.signedUrl}
                    alt={`Progress photo ${photo.photo_date}`}
                    onClick={() => {
                      setViewZoom(IDENTITY);
                      setViewing(photo);
                    }}
                    className="aspect-square w-full cursor-pointer rounded-xl object-cover"
                  />
                ) : (
                  <div className="aspect-square w-full rounded-xl bg-black/5 dark:bg-white/5" />
                )}
                <div className="flex items-center justify-between gap-1 pl-0.5">
                  <span className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">{shortDate(photo.photo_date)}</span>
                  {!readOnly && (
                    <button
                      type="button"
                      aria-label={`Delete the photo from ${longDate(photo.photo_date)}`}
                      onClick={() => handleDeletePhoto(photo.id, photo.photo_date)}
                      className="-mr-2 flex h-11 w-11 items-center justify-center rounded-xl text-zinc-400 hover:bg-black/5 hover:text-danger dark:hover:bg-white/10"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {!readOnly && (
          <>
            <button
              type="button"
              disabled={uploading || preparing}
              onClick={() => fileInputRef.current?.click()}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#1d1d1b] text-[15px] font-bold text-white disabled:opacity-60 dark:bg-zinc-100 dark:text-[#1d1d1b]"
            >
              <Camera className="h-[18px] w-[18px]" />
              {preparing ? 'Preparing…' : uploading ? 'Uploading…' : 'Add this week\'s photo'}
            </button>
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleUpload} />
          </>
        )}
      </section>

      <section className="space-y-2.5">
      <h2 className={headCls}>Measurements</h2>
      <div className={cardCls}>

        {initialMeasurements.length === 0 ? (
          <p className="text-sm text-zinc-500">{readOnly ? 'They have not logged any measurements yet.' : 'No measurements logged yet.'}</p>
        ) : (
          <>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">Last logged {longDate(initialMeasurements[0].log_date)} · all in cm</p>
            {(() => {
              // Start is the first reading for each site, Last the one before Now (MX14). With only one entry there is nothing to compare,
              // so the card shows the figures and says so, instead of an empty Last column and "±0cm" on every row.
              const sites = MEASUREMENT_FIELDS.map(({ key, label }) => ({ key, label, ...siteSummary(initialMeasurements, key) }));
              const compare = anythingToCompare(sites);
              const cols = compare ? 'grid-cols-[1fr_3.5rem_3.5rem_3.5rem]' : 'grid-cols-[1fr_3.5rem]';
              return (
                <>
                  <div className="mt-2 divide-y divide-black/[.07] dark:divide-white/10">
                    <div className={`grid ${cols} gap-1 pb-1 text-xs font-semibold text-zinc-500 dark:text-zinc-400`}>
                      <span />
                      {compare && <span className="text-right">Start</span>}
                      {compare && <span className="text-right">Last</span>}
                      <span className="text-right">Now</span>
                    </div>
                    {sites.map((site) => {
                      const change = compare ? siteChangeText(site) : null;
                      // Waist/hips going down is the usual aim; for arm/chest/quad, up is.
                      const towardsGoal =
                        site.vsStart != null && Math.abs(site.vsStart) >= 0.05
                          ? site.key === 'waist' || site.key === 'hips'
                            ? site.vsStart < 0
                            : site.vsStart > 0
                          : null;
                      return (
                        <div key={site.key} className="py-2.5">
                          <div className={`grid ${cols} items-center gap-1`}>
                            <span className="text-[15px] font-bold text-black dark:text-zinc-50">{site.label}</span>
                            {compare && <span className="text-right text-sm text-zinc-500">{site.start ?? '—'}</span>}
                            {compare && <span className="text-right text-sm text-zinc-500">{site.last ?? '—'}</span>}
                            <span className="text-right text-[15px] font-black text-black dark:text-zinc-50">{site.now ?? '—'}</span>
                          </div>
                          {change && (
                            <p className={`mt-0.5 text-xs font-semibold ${towardsGoal == null ? 'text-zinc-500' : towardsGoal ? 'text-accent' : 'text-danger'}`}>
                              {change}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  {!compare && (
                    <p className="mt-2 text-xs font-semibold text-zinc-500 dark:text-zinc-400">
                      {readOnly ? 'Nothing to compare yet: their next measurement shows the change.' : NOTHING_TO_COMPARE}
                    </p>
                  )}
                </>
              );
            })()}
          </>
        )}
      </div>
      </section>

      {!readOnly && (
        <section className="space-y-2.5">
        <h2 className={headCls}>Add a measurement</h2>
        <div className={cardCls}>
          <form onSubmit={handleSaveMeasurement} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              {MEASUREMENT_FIELDS.map(({ key, label }) => (
                <div key={key} className="space-y-1">
                  <label className={labelCls}>{label} (cm)</label>
                  <input
                    type="number"
                    step="0.1"
                    min={MEASUREMENT_CM.min}
                    max={MEASUREMENT_CM.max}
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
              className="h-12 w-full rounded-xl bg-[#1d1d1b] text-[15px] font-bold text-white disabled:opacity-60 dark:bg-zinc-100 dark:text-[#1d1d1b]"
            >
              {savingMeasurement ? 'Saving…' : 'Save measurements'}
            </button>
          </form>
        </div>
        </section>
      )}
      {comparing && beforePhoto && afterPhoto && (
        <div ref={compareRef} role="dialog" aria-modal="true" aria-label="Before and after" className="fixed inset-0 z-[70] flex flex-col overflow-y-auto bg-background p-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold text-black dark:text-zinc-50">Before &amp; after</h3>
            <button type="button" data-dialog-close aria-label="Close comparison" onClick={() => setComparing(false)} className="flex h-11 w-11 items-center justify-center rounded-full bg-black/5 dark:bg-white/10">
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3">
            {([['Before', beforePhoto, setBeforeId], ['After', afterPhoto, setAfterId]] as const).map(([label, photo, setId]) => (
              <div key={label} className="space-y-2">
                <p className="text-xs font-bold uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400">{label}</p>
                <ZoomablePhoto
                  src={photo.signedUrl!}
                  alt={`${label} photo ${photo.photo_date}`}
                  value={compareZoom}
                  onChange={setCompareZoom}
                  className="aspect-[3/4] w-full rounded-xl"
                />
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
          <p className="mt-3 text-center text-xs text-zinc-400">Pinch, scroll or double-tap to zoom. Both photos move together.</p>
          <div className="mt-3 flex flex-wrap justify-center gap-2">
            {compareZoom.scale > 1 && (
              <button type="button" onClick={() => setCompareZoom(IDENTITY)} className="inline-flex h-11 items-center justify-center gap-1.5 rounded-xl border-[1.5px] border-black/20 px-4 text-sm font-bold text-black dark:border-white/25 dark:text-zinc-50">
                Reset zoom
              </button>
            )}
            <button
              type="button"
              disabled={downloading}
              onClick={() =>
                runDownload(async () => {
                  const name = `before-after-${beforePhoto.photo_date}-${afterPhoto.photo_date}`;
                  try {
                    await downloadSideBySide(
                      { url: beforePhoto.signedUrl!, label: longDate(beforePhoto.photo_date) },
                      { url: afterPhoto.signedUrl!, label: longDate(afterPhoto.photo_date) },
                      `${name}.jpg`
                    );
                  } catch {
                    // The browser could not draw them together: save the two photos separately instead.
                    await downloadPhoto(beforePhoto.signedUrl!, `before-${beforePhoto.photo_date}.jpg`);
                    await downloadPhoto(afterPhoto.signedUrl!, `after-${afterPhoto.photo_date}.jpg`);
                  }
                })
              }
              className="inline-flex h-11 items-center justify-center gap-1.5 rounded-xl bg-[#1d1d1b] text-white dark:bg-zinc-100 dark:text-[#1d1d1b] px-4 text-sm font-bold disabled:opacity-50"
            >
              <Download className="h-4 w-4" /> {downloading ? 'Saving…' : 'Download'}
            </button>
          </div>
          <p className="mt-4 text-center text-sm font-semibold text-zinc-500">
            {daysBetween === 0 ? 'Same day' : daysBetween > 0 ? `${daysBetween} days between photos` : 'Before photo is later than the after photo'}
          </p>
        </div>
      )}
      {viewing?.signedUrl && (
        <div ref={viewerRef} role="dialog" aria-modal="true" aria-label={`Progress photo ${viewing.photo_date}`} className="fixed inset-0 z-[70] flex flex-col items-center justify-center bg-black/90 p-4" onClick={() => setViewing(null)}>
          <button type="button" data-dialog-close aria-label="Close photo" onClick={() => setViewing(null)} className="absolute right-4 top-4 flex h-11 w-11 items-center justify-center rounded-full bg-white/15 text-white">
            <X className="h-5 w-5" />
          </button>
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md">
            <ZoomablePhoto
              src={viewing.signedUrl}
              alt={`Progress photo ${viewing.photo_date}`}
              value={viewZoom}
              onChange={setViewZoom}
              className="aspect-[3/4] max-h-[75vh] w-full rounded-xl"
            />
          </div>
          <p className="mt-3 text-sm font-semibold text-white">{longDate(viewing.photo_date)}</p>
          <button
            type="button"
            disabled={downloading}
            onClick={(e) => {
              e.stopPropagation();
              void runDownload(() => downloadPhoto(viewing.signedUrl!, `progress-${viewing.photo_date}.jpg`));
            }}
            className="mt-2 flex h-11 items-center gap-1.5 rounded-xl bg-white/15 px-4 text-sm font-bold text-white disabled:opacity-50"
          >
            <Download className="h-4 w-4" /> {downloading ? 'Saving…' : 'Download'}
          </button>
        </div>
      )}
    </div>
  );
}
