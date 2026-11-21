'use client';

import { useMemo, useRef, useState } from 'react';
import { useStaggerIn } from '@/app/_components/motion/useStaggerIn';
import { Camera, ChevronLeft, ChevronRight, PencilLine, Trash2 } from 'lucide-react';
import { BottomSheet } from '@/app/_components/BottomSheet';
import { EmptyState } from '@/app/_components/EmptyState';
import { useAction } from '@/app/_components/useAction';
import { useConfirm } from '@/app/_components/ConfirmDialog';
import { useBackHandler } from '@/app/_components/useBackHandler';
import { useDaySwipe } from '@/app/_components/useDaySwipe';
import { deleteFoodPhoto, getFoodPhotosForDate, uploadFoodPhoto } from '@/lib/data/foodPhotos';
import { getOrCreateDailyLog } from '@/lib/data/dailyLogs';
import { LOCKED_DAY_MESSAGE, canBrowseDate, canEditDay } from '@/lib/dayPatch';
import { markReviewed } from '@/lib/data/coachReviews';
import { shrinkImageFile } from '@/lib/utils/shrinkImage';
import { groupByMealSection, suggestMealSection, validateMealEntry } from '@/lib/utils/photoDiary';
import { addDays, DEFAULT_TIMEZONE, toIsoDate } from '@/lib/utils/dates';
import { FeedbackThread } from './FeedbackThread';
import { PhotoViewer } from '@/app/_components/Overlays';
import { useTodayIso } from './useTodayIso';
import type { ClientProfileRow, FoodPhotoEntry, MealSectionRow, NutritionFeedbackRow } from '@/lib/data/types';

const inputCls = 'w-full rounded-xl border border-black/10 bg-transparent px-3 py-2.5 text-base dark:border-white/10';

const timeOf = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit', hour12: true }).replace(' ', '');

// A visual food diary: no numbers, just what was eaten and when, for the coach to look through
// and comment on. (Calories can't be told from a photo, so none are shown or estimated.)
export function PhotoDiaryTab({
  clientId,
  dailyLogId,
  initialPhotos,
  sections,
  readOnly,
  canGiveFeedback,
  feedback,
  profile,
}: {
  clientId: string;
  dailyLogId: string | null;
  initialPhotos: FoodPhotoEntry[];
  // The member's meal types (Breakfast, Lunch, ...), offered when adding a meal.
  sections: MealSectionRow[];
  readOnly: boolean;
  canGiveFeedback: boolean;
  feedback: NutritionFeedbackRow[];
  profile: ClientProfileRow | null;
}) {
  const confirm = useConfirm();
  const { run: runUpload, busy: uploading } = useAction();
  const { run: runDelete } = useAction();
  const { run: runReview, busy: reviewing } = useAction();
  // Days this coach has marked reviewed during this visit (marking twice is harmless, so the button needs no other memory).
  const [reviewedDays, setReviewedDays] = useState<Set<string>>(() => new Set());

  // Today at the member's own timezone (not UTC), kept current past midnight (FT2).
  const todayIso = useTodayIso(profile?.timezone ?? DEFAULT_TIMEZONE);
  const [viewingDate, setViewingDate] = useState(todayIso);
  const meals = useRef<HTMLDivElement>(null);
  // Today comes straight from props (they refresh after every action); a day browsed back to is
  // fetched and held locally.
  const [other, setOther] = useState<{ logId: string | null; photos: FoodPhotoEntry[] } | null>(null);
  const [dateLoading, setDateLoading] = useState(false);
  const isToday = viewingDate === todayIso;
  const photos = useMemo(() => (isToday ? initialPhotos : (other?.photos ?? [])), [isToday, initialPhotos, other]);
  const currentLogId = isToday ? dailyLogId : (other?.logId ?? null);
  // Members add to the last two weeks and look back a month (D20); a coach sees any day and changes none.
  const dayLocked = !readOnly && !canEditDay(viewingDate, todayIso);
  const previousDay = toIsoDate(addDays(new Date(viewingDate + 'T00:00:00Z'), -1));
  const nextDay = toIsoDate(addDays(new Date(viewingDate + 'T00:00:00Z'), 1));
  const atBrowseLimit = !readOnly && !canBrowseDate(previousDay, todayIso);
  // The arrows either side of the day, and the same two moves when the diary is swiped sideways (useDaySwipe, below).
  const canGoBack = !dateLoading && !atBrowseLimit;
  const canGoOn = !dateLoading && !isToday;

  // Reviewing a day is something the coach says ("Mark day as reviewed", or leaving feedback on it), not something that happens by looking:
  // paging through days used to clear every one of them from the dashboard's To do (R20).
  async function markDayReviewed() {
    const day = viewingDate;
    await runReview(() => markReviewed('diary_day', clientId, day), {
      success: 'Marked as reviewed',
      refresh: false,
      onDone: () => setReviewedDays((prev) => new Set(prev).add(day)),
    });
  }

  const [adding, setAdding] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [description, setDescription] = useState('');
  const [mealSectionId, setMealSectionId] = useState<string | null>(null);
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
      // Only reads: browsing back no longer leaves a blank row behind for every day looked at (FT1).
      const result = await getFoodPhotosForDate(clientId, date);
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

  // Opens the add sheet with the meal type for the time of day already chosen (the member can change or clear it).
  function openSheet() {
    setMealSectionId(suggestMealSection(sections, new Date().getHours()));
    setAdding(true);
  }

  function closeSheet() {
    setAdding(false);
    setDescription('');
    setMealSectionId(null);
    pickFile(null);
  }

  async function handleUpload() {
    if (validateMealEntry(!!file, description)) return;
    const formData = new FormData();
    // The photo is optional: a meal can be logged with a description alone.
    if (file) formData.set('file', await shrinkImageFile(file));
    formData.set('clientId', clientId);
    formData.set('description', description);
    if (mealSectionId) formData.set('mealSectionId', mealSectionId);
    // The day's row is made when its first photo is added, not when the day is looked at (FT1).
    const ok = await runUpload(
      async () => {
        const logId = currentLogId ?? (await getOrCreateDailyLog(clientId, viewingDate)).id;
        formData.set('dailyLogId', logId);
        return uploadFoodPhoto(formData);
      },
      { success: 'Meal added' }
    );
    if (ok) {
      closeSheet();
      if (!isToday) await loadDate(viewingDate);
    }
  }

  async function handleDelete(id: string) {
    if (!currentLogId) return;
    const ok = await confirm({ title: 'Delete this meal?', destructive: true });
    if (!ok) return;
    const done = await runDelete(() => deleteFoodPhoto(id), { success: 'Meal deleted' });
    if (done && !isToday) await loadDate(viewingDate);
  }

  const mealGroups = groupByMealSection(photos, sections);
  // Rises in when the screen opens and when another day has loaded; a photo added to the day does not set the whole list moving again.
  useStaggerIn(meals, '[data-meal]', `${viewingDate}|${dateLoading}`);
  useDaySwipe(meals, { previous: canGoBack ? () => loadDate(previousDay) : null, next: canGoOn ? () => loadDate(nextDay) : null });

  return (
    <div ref={meals} className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          aria-label="Previous day"
          disabled={!canGoBack}
          onClick={() => loadDate(previousDay)}
          className="rounded-full p-2 text-zinc-500 hover:bg-black/5 disabled:opacity-40 dark:hover:bg-white/10"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div className="text-center">
          <p className="text-[15px] font-extrabold text-black dark:text-zinc-50">{isToday ? 'Today' : dateLabel}</p>
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
            disabled={!canGoOn}
            onClick={() => loadDate(nextDay)}
            className="rounded-full p-2 text-zinc-500 hover:bg-black/5 disabled:opacity-40 dark:hover:bg-white/10"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
      </div>

      {dayLocked && <p className="rounded-xl bg-card-muted px-3 py-2 text-xs text-zinc-600 dark:text-zinc-400">{LOCKED_DAY_MESSAGE}</p>}

      {!readOnly && !dayLocked && (
        <div className="space-y-3 rounded-[20px] border border-black/[.08] bg-card p-4 dark:border-white/10">
          <p className="text-sm leading-snug text-zinc-600 dark:text-zinc-400">Photograph your meals and your coach looks through them. No weighing or counting.</p>
          <button
            type="button"
            onClick={() => {
              openSheet();
              // Straight to the phone's camera/photo picker.
              setTimeout(() => fileRef.current?.click(), 50);
            }}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#1d1d1b] text-[15px] font-bold text-white dark:bg-zinc-100 dark:text-[#1d1d1b]"
          >
            <Camera className="h-5 w-5" /> Add a meal photo
          </button>
          <button
            type="button"
            onClick={openSheet}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-xl border-[1.5px] border-black/20 text-sm font-bold text-black hover:bg-black/5 dark:border-white/25 dark:text-zinc-50 dark:hover:bg-white/5"
          >
            <PencilLine className="h-4 w-4" /> Add without a photo
          </button>
        </div>
      )}

      {canGiveFeedback && photos.length > 0 && (
        <button
          type="button"
          disabled={reviewing || reviewedDays.has(viewingDate)}
          onClick={() => void markDayReviewed()}
          className="h-11 w-full rounded-xl border-[1.5px] border-black/20 text-sm font-bold text-black hover:bg-black/[.03] disabled:opacity-60 dark:border-white/25 dark:text-zinc-50 dark:hover:bg-white/5"
        >
          {reviewedDays.has(viewingDate) ? '✓ Reviewed' : 'Mark day as reviewed'}
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
          {mealGroups.map((group) => (
            <div key={group.section?.id ?? 'none'} className="space-y-3">
              {(mealGroups.length > 1 || group.section) && (
                <h2 className="px-1 pt-1 text-base font-extrabold text-black dark:text-zinc-50">{group.section?.label ?? 'Other'}</h2>
              )}
          {group.entries.map((entry) => (
            <div key={entry.id} data-meal className="space-y-2.5 rounded-[20px] border border-black/[.08] bg-card p-3 dark:border-white/10">
                <div className="flex items-start gap-3">
                  {/* A meal logged with a description alone has no picture, so no picture box either. */}
                  {entry.signedUrl ? (
                    <button type="button" aria-label="View photo" onClick={() => setViewing(entry.signedUrl)} className="block h-[88px] w-[88px] shrink-0 overflow-hidden rounded-[14px]">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={entry.signedUrl} alt={entry.description ?? 'Food photo'} className="h-full w-full object-cover" />
                    </button>
                  ) : entry.storage_path ? (
                    <div className="h-[88px] w-[88px] shrink-0 rounded-[14px] bg-black/5 dark:bg-white/5" />
                  ) : null}
                  <div className="min-w-0 flex-1 self-center">
                    <p className="whitespace-pre-wrap break-words text-[15px] font-bold text-black dark:text-zinc-50">{entry.description || 'Meal photo'}</p>
                    <p className="text-[13px] text-zinc-500 dark:text-zinc-400">{timeOf(entry.created_at)}</p>
                  </div>
                  {!readOnly && !dayLocked && (
                    <button type="button" aria-label={entry.storage_path ? 'Delete photo' : 'Delete meal'} onClick={() => handleDelete(entry.id)} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-zinc-400 hover:text-danger">
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
          ))}
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
        <BottomSheet title="Add a meal" onClose={closeSheet}>
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
                <Camera className="h-6 w-6" /> Take or choose a photo (optional)
              </button>
            )}
            {preview && (
              <button type="button" onClick={() => fileRef.current?.click()} className="text-xs font-semibold text-accent">
                Choose a different photo
              </button>
            )}
            {sections.length > 0 && (
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="Which meal">
                {sections.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    aria-pressed={mealSectionId === s.id}
                    onClick={() => setMealSectionId((cur) => (cur === s.id ? null : s.id))}
                    className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
                      mealSectionId === s.id ? 'border-accent bg-accent-soft text-accent' : 'border-black/10 text-zinc-500 dark:border-white/10'
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            )}
            <textarea
              maxLength={500}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={file ? 'What is it? e.g. Chicken salad, small portion' : 'Describe the meal, e.g. Chicken salad, small portion'}
              rows={file ? 2 : 3}
              className={`${inputCls} resize-none`}
            />
            {!file && <p className="text-xs text-zinc-500">No photo? That is fine, a description is enough.</p>}
            <button
              type="button"
              disabled={!!validateMealEntry(!!file, description) || uploading}
              onClick={handleUpload}
              className="h-12 w-full rounded-xl bg-[#1d1d1b] text-white dark:bg-zinc-100 dark:text-[#1d1d1b] text-[15px] font-bold disabled:opacity-50"
            >
              {uploading ? 'Adding…' : 'Add to my diary'}
            </button>
          </div>
        </BottomSheet>
      )}

      {viewing && (
        <PhotoViewer label="Meal photo" onClose={() => setViewing(null)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={viewing} alt="Meal photo" className="max-h-[88vh] max-w-full rounded-xl object-contain" />
        </PhotoViewer>
      )}
    </div>
  );
}
