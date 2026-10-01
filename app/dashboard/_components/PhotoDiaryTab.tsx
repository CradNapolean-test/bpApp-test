'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Camera, ChevronLeft, ChevronRight, Trash2 } from 'lucide-react';
import { BottomSheet } from '@/app/_components/BottomSheet';
import { EmptyState } from '@/app/_components/EmptyState';
import { useAction } from '@/app/_components/useAction';
import { useConfirm } from '@/app/_components/ConfirmDialog';
import { useBackHandler } from '@/app/_components/useBackHandler';
import { deleteFoodPhoto, getFoodPhotosForDate, uploadFoodPhoto } from '@/lib/data/foodPhotos';
import { markReviewed } from '@/lib/data/coachReviews';
import { shrinkImageFile } from '@/lib/utils/shrinkImage';
import { addDays, DEFAULT_TIMEZONE, todayIsoInTz, toIsoDate } from '@/lib/utils/dates';
import { FeedbackThread } from './FeedbackThread';
import type { ClientProfileRow, FoodPhotoEntry, NutritionFeedbackRow } from '@/lib/data/types';

const inputCls = 'w-full rounded-xl border border-black/10 bg-transparent px-3 py-2.5 text-base dark:border-white/10';

const timeOf = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit', hour12: true }).replace(' ', '');

// A visual food diary: no numbers, just what was eaten and when, for the coach to look through
// and comment on. (Calories can't be told from a photo, so none are shown or estimated.)
export function PhotoDiaryTab({
  clientId,
  dailyLogId,
  initialPhotos,
  readOnly,
  canGiveFeedback,
  feedback,
  profile,
}: {
  clientId: string;
  dailyLogId: string | null;
  initialPhotos: FoodPhotoEntry[];
  readOnly: boolean;
  canGiveFeedback: boolean;
  feedback: NutritionFeedbackRow[];
  profile: ClientProfileRow | null;
}) {
  const confirm = useConfirm();
  const { run: runUpload, busy: uploading } = useAction();
  const { run: runDelete } = useAction();

  // Same "today" the server used for dailyLogId (the member's own timezone, not UTC).
  const todayIso = useMemo(() => todayIsoInTz(profile?.timezone ?? DEFAULT_TIMEZONE), [profile?.timezone]);
  const [viewingDate, setViewingDate] = useState(todayIso);
  // Today comes straight from props (they refresh after every action); a day browsed back to is
  // fetched and held locally.
  const [other, setOther] = useState<{ logId: string | null; photos: FoodPhotoEntry[] } | null>(null);
  const [dateLoading, setDateLoading] = useState(false);
  const isToday = viewingDate === todayIso;
  const photos = useMemo(() => (isToday ? initialPhotos : (other?.photos ?? [])), [isToday, initialPhotos, other]);
  const currentLogId = isToday ? dailyLogId : (other?.logId ?? null);

  // The member's own coach looking at a day of photos counts as reviewing it (it leaves the
  // dashboard's To do); commenting does too.
  useEffect(() => {
    if (canGiveFeedback && photos.length > 0) void markReviewed('diary_day', clientId, viewingDate);
  }, [canGiveFeedback, photos.length, clientId, viewingDate]);

  const [adding, setAdding] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [description, setDescription] = useState('');
  const [viewing, setViewing] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  useBackHandler(viewing != null, () => setViewing(null));

  const dateLabel = new Date(viewingDate + 'T00:00:00Z').toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  });

  async function loadDate(date: string) {
    setDateLoading(true);
    try {
      if (date === todayIso) {
        setViewingDate(date);
        setOther(null);
        return;
      }
      const result = await getFoodPhotosForDate(clientId, date, !readOnly);
      setViewingDate(date);
      setOther({ logId: result.dailyLogId, photos: result.photos });
    } finally {
      setDateLoading(false);
    }
  }

  function pickFile(f: File | null) {
    setFile(f);
    setPreview((old) => {
      if (old) URL.revokeObjectURL(old);
      return f ? URL.createObjectURL(f) : null;
    });
  }

  function closeSheet() {
    setAdding(false);
    setDescription('');
    pickFile(null);
  }

  async function handleUpload() {
    if (!currentLogId || !file) return;
    const formData = new FormData();
    formData.set('file', await shrinkImageFile(file));
    formData.set('clientId', clientId);
    formData.set('dailyLogId', currentLogId);
    formData.set('description', description);
    const ok = await runUpload(() => uploadFoodPhoto(formData), { success: 'Photo added' });
    if (ok) {
      closeSheet();
      if (!isToday) await loadDate(viewingDate);
    }
  }

  async function handleDelete(id: string) {
    if (!currentLogId) return;
    const ok = await confirm({ title: 'Delete this photo?', destructive: true });
    if (!ok) return;
    const done = await runDelete(() => deleteFoodPhoto(id), { success: 'Photo deleted' });
    if (done && !isToday) await loadDate(viewingDate);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          aria-label="Previous day"
          disabled={dateLoading}
          onClick={() => loadDate(toIsoDate(addDays(new Date(viewingDate + 'T00:00:00Z'), -1)))}
          className="rounded-full p-2 text-zinc-500 hover:bg-black/5 disabled:opacity-40 dark:hover:bg-white/10"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div className="text-center">
          <p className="text-sm font-semibold text-black dark:text-zinc-50">{isToday ? 'Today' : dateLabel}</p>
          {isToday && <p className="text-xs text-zinc-500">{dateLabel}</p>}
        </div>
        <div className="flex items-center gap-1">
          {!isToday && (
            <button type="button" disabled={dateLoading} onClick={() => loadDate(todayIso)} className="rounded-full px-3 py-1 text-xs font-bold text-accent">
              Today
            </button>
          )}
          <button
            type="button"
            aria-label="Next day"
            disabled={dateLoading || isToday}
            onClick={() => loadDate(toIsoDate(addDays(new Date(viewingDate + 'T00:00:00Z'), 1)))}
            className="rounded-full p-2 text-zinc-500 hover:bg-black/5 disabled:opacity-40 dark:hover:bg-white/10"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
      </div>

      {!readOnly && (
        <button
          type="button"
          onClick={() => {
            setAdding(true);
            // Straight to the phone's camera/photo picker.
            setTimeout(() => fileRef.current?.click(), 50);
          }}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-accent py-3.5 text-sm font-extrabold text-accent-foreground"
        >
          <Camera className="h-5 w-5" /> Add a meal photo
        </button>
      )}

      <FeedbackThread
        clientId={clientId}
        date={viewingDate}
        items={feedback}
        canGive={canGiveFeedback}
        placeholder={`Feedback on ${isToday ? "today's" : 'this day’s'} food…`}
        buttonLabel="Leave feedback on this day"
      />

      {photos.length === 0 ? (
        <EmptyState
          icon={Camera}
          title={isToday ? 'No meals logged yet' : 'No meals logged this day'}
          hint={readOnly ? 'Nothing uploaded yet.' : 'Photograph each meal and add a short description. Your coach looks through your photos.'}
        />
      ) : (
        <div className="space-y-3">
          {photos.map((entry) => (
            <div key={entry.id} className="overflow-hidden rounded-2xl border border-black/[.05] bg-card dark:border-white/10">
              {entry.signedUrl ? (
                <button type="button" aria-label="View photo" onClick={() => setViewing(entry.signedUrl)} className="block w-full">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={entry.signedUrl} alt={entry.description ?? 'Food photo'} className="aspect-[4/3] w-full object-cover" />
                </button>
              ) : (
                <div className="aspect-[4/3] w-full bg-black/5 dark:bg-white/5" />
              )}
              <div className="space-y-2 p-3.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-black dark:text-zinc-50">{entry.description || 'Meal photo'}</p>
                    <p className="text-xs text-zinc-500">{timeOf(entry.created_at)}</p>
                  </div>
                  {!readOnly && (
                    <button type="button" aria-label="Delete photo" onClick={() => handleDelete(entry.id)} className="shrink-0 rounded-full p-2 text-zinc-400 hover:text-danger">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
                <FeedbackThread
                  clientId={clientId}
                  date={viewingDate}
                  photoId={entry.id}
                  items={feedback}
                  canGive={canGiveFeedback}
                  placeholder="Comment on this meal…"
                  buttonLabel="Comment on this meal"
                />
              </div>
            </div>
          ))}
        </div>
      )}

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          pickFile(e.target.files?.[0] ?? null);
          e.target.value = '';
        }}
      />

      {adding && (
        <BottomSheet title="Add a meal photo" onClose={closeSheet}>
          <div className="space-y-3">
            {preview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={preview} alt="Chosen meal" className="aspect-[4/3] w-full rounded-xl object-cover" />
            ) : (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="flex aspect-[4/3] w-full flex-col items-center justify-center gap-2 rounded-xl border-[1.5px] border-dashed border-black/15 text-sm font-semibold text-zinc-500 dark:border-white/15"
              >
                <Camera className="h-6 w-6" /> Take or choose a photo
              </button>
            )}
            {preview && (
              <button type="button" onClick={() => fileRef.current?.click()} className="text-xs font-semibold text-accent">
                Choose a different photo
              </button>
            )}
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What is it? e.g. Chicken salad, small portion"
              rows={2}
              className={`${inputCls} resize-none`}
            />
            <button
              type="button"
              disabled={!file || uploading}
              onClick={handleUpload}
              className="w-full rounded-full bg-accent py-3 text-sm font-extrabold text-accent-foreground disabled:opacity-50"
            >
              {uploading ? 'Adding…' : 'Add to my diary'}
            </button>
          </div>
        </BottomSheet>
      )}

      {viewing && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/90 p-4" onClick={() => setViewing(null)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={viewing} alt="Meal photo" className="max-h-[88vh] max-w-full rounded-xl object-contain" />
        </div>
      )}
    </div>
  );
}
