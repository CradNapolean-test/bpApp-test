'use client';

import { useMemo, useRef, useState } from 'react';
import { Camera, ChevronLeft, ChevronRight, Pencil, Trash2 } from 'lucide-react';
import { BottomSheet } from '@/app/_components/BottomSheet';
import { EmptyState } from '@/app/_components/EmptyState';
import { useAction } from '@/app/_components/useAction';
import { useConfirm } from '@/app/_components/ConfirmDialog';
import { deleteFoodPhoto, getFoodPhotosForDate, updateFoodPhotoMacros, uploadFoodPhoto } from '@/lib/data/foodPhotos';
import { shrinkImageFile } from '@/lib/utils/shrinkImage';
import { dayCalories, weeklyTarget } from '@/lib/calculations';
import { toEngineProfile } from '@/lib/utils/clientProfile';
import { addDays, DEFAULT_TIMEZONE, todayIsoInTz, toIsoDate } from '@/lib/utils/dates';
import { NutritionSummary } from './NutritionSummary';
import type { ClientProfileRow, FoodPhotoEntry } from '@/lib/data/types';

const MACRO_COLORS = { protein: '#a07aff', carbs: '#e8a020', fat: '#2ecc71' };
const inputCls = 'w-full rounded-xl border border-black/10 bg-transparent px-3 py-2.5 text-base dark:border-white/10';

// Edit what the AI estimated (or fill it in when there was no estimate). Calories follow the macros.
function MacroEditor({ entry, dailyLogId, onClose }: { entry: FoodPhotoEntry; dailyLogId: string; onClose: () => void }) {
  const { run, busy } = useAction();
  const [protein, setProtein] = useState(entry.estimated_protein != null ? String(Math.round(entry.estimated_protein)) : '');
  const [carbs, setCarbs] = useState(entry.estimated_carbs != null ? String(Math.round(entry.estimated_carbs)) : '');
  const [fat, setFat] = useState(entry.estimated_fat != null ? String(Math.round(entry.estimated_fat)) : '');
  const kcal = Math.round(dayCalories(Number(protein) || 0, Number(carbs) || 0, Number(fat) || 0));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const ok = await run(
      () =>
        updateFoodPhotoMacros(entry.id, dailyLogId, {
          calories: kcal,
          protein: protein === '' ? null : Number(protein),
          carbs: carbs === '' ? null : Number(carbs),
          fat: fat === '' ? null : Number(fat),
        }),
      { success: 'Macros saved' }
    );
    if (ok) onClose();
  }

  const field = (label: string, color: string, value: string, set: (v: string) => void) => (
    <label className="space-y-1">
      <span className="text-[11px] font-bold uppercase tracking-wide" style={{ color }}>{label}</span>
      <input type="number" inputMode="decimal" step="1" placeholder="g" value={value} onChange={(e) => set(e.target.value)} className={inputCls} />
    </label>
  );

  return (
    <form onSubmit={save} className="space-y-2.5 rounded-xl bg-black/[.03] p-3 dark:bg-white/[.04]">
      <div className="grid grid-cols-3 gap-2">
        {field('Protein', MACRO_COLORS.protein, protein, setProtein)}
        {field('Carbs', MACRO_COLORS.carbs, carbs, setCarbs)}
        {field('Fat', MACRO_COLORS.fat, fat, setFat)}
      </div>
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-zinc-500"><b className="text-black dark:text-zinc-50">{kcal}</b> kcal</p>
        <div className="flex gap-2">
          <button type="button" onClick={onClose} className="rounded-full px-4 py-2 text-sm font-semibold text-zinc-500">Cancel</button>
          <button type="submit" disabled={busy} className="rounded-full bg-accent px-5 py-2 text-sm font-extrabold text-accent-foreground disabled:opacity-50">
            {busy ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </form>
  );
}

function PhotoCard({
  entry,
  dailyLogId,
  readOnly,
  onDelete,
}: {
  entry: FoodPhotoEntry;
  dailyLogId: string | null;
  readOnly: boolean;
  onDelete: (id: string) => void;
}) {
  const hasEstimate = entry.estimated_calories != null;
  // A photo with no estimate opens straight into the macro editor so it gets filled in.
  const [editing, setEditing] = useState(!hasEstimate && !readOnly);
  return (
    <div className="overflow-hidden rounded-2xl border border-black/[.05] bg-card dark:border-white/10">
      {entry.signedUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={entry.signedUrl} alt={entry.description ?? 'Food photo'} className="aspect-[4/3] w-full object-cover" />
      ) : (
        <div className="aspect-[4/3] w-full bg-black/5 dark:bg-white/5" />
      )}
      <div className="space-y-2 p-3.5">
        <div className="flex items-start justify-between gap-2">
          <p className="min-w-0 text-sm font-bold text-black dark:text-zinc-50">{entry.description || 'Meal photo'}</p>
          {!readOnly && dailyLogId && (
            <div className="flex shrink-0 items-center">
              <button type="button" aria-label="Edit macros" onClick={() => setEditing((v) => !v)} className="rounded-full p-2 text-zinc-400 hover:text-black dark:hover:text-zinc-100">
                <Pencil className="h-4 w-4" />
              </button>
              <button type="button" aria-label="Delete photo" onClick={() => onDelete(entry.id)} className="rounded-full p-2 text-zinc-400 hover:text-danger">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
        {hasEstimate ? (
          <div>
            <p className="text-lg font-extrabold text-black dark:text-zinc-50">
              {Math.round(entry.estimated_calories!)} <span className="text-xs font-bold text-zinc-500">kcal · estimated</span>
            </p>
            <p className="text-xs font-semibold">
              <span style={{ color: MACRO_COLORS.protein }}>P {Math.round(entry.estimated_protein ?? 0)}g</span>{' · '}
              <span style={{ color: MACRO_COLORS.carbs }}>C {Math.round(entry.estimated_carbs ?? 0)}g</span>{' · '}
              <span style={{ color: MACRO_COLORS.fat }}>F {Math.round(entry.estimated_fat ?? 0)}g</span>
            </p>
          </div>
        ) : (
          <p className="text-xs text-zinc-500">{readOnly ? 'No estimate yet.' : 'Add the calories and macros for this meal.'}</p>
        )}
        {editing && dailyLogId && <MacroEditor entry={entry} dailyLogId={dailyLogId} onClose={() => setEditing(false)} />}
      </div>
    </div>
  );
}

export function PhotoDiaryTab({
  clientId,
  dailyLogId,
  initialPhotos,
  readOnly,
  profile,
  programWeek,
}: {
  clientId: string;
  dailyLogId: string | null;
  initialPhotos: FoodPhotoEntry[];
  readOnly: boolean;
  profile: ClientProfileRow | null;
  programWeek: number;
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

  const [adding, setAdding] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [description, setDescription] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const dayTarget = useMemo(() => {
    const engineProfile = toEngineProfile(profile);
    return engineProfile ? weeklyTarget(engineProfile, programWeek)?.dailyFlat ?? null : null;
  }, [profile, programWeek]);

  const totals = useMemo(() => {
    const protein = photos.reduce((s, p) => s + (p.estimated_protein ?? 0), 0);
    const carbs = photos.reduce((s, p) => s + (p.estimated_carbs ?? 0), 0);
    const fat = photos.reduce((s, p) => s + (p.estimated_fat ?? 0), 0);
    return { calories: dayCalories(protein, carbs, fat), protein, carbs, fat };
  }, [photos]);

  const dateLabel = new Date(viewingDate + 'T00:00:00Z').toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
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
    const done = await runDelete(() => deleteFoodPhoto(id, currentLogId), { success: 'Photo deleted' });
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
        <div className="text-sm font-semibold text-black dark:text-zinc-50">{isToday ? 'Today' : dateLabel}</div>
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

      <NutritionSummary totals={totals} target={dayTarget} title={isToday ? "Today's targets" : 'Targets'} dateLabel={dateLabel} />

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

      {photos.length === 0 ? (
        <EmptyState
          icon={Camera}
          title={isToday ? 'No meals logged yet' : 'No meals logged this day'}
          hint={readOnly ? 'Nothing uploaded yet.' : 'Photograph each meal and log its macros. Your coach can see every photo.'}
        />
      ) : (
        <div className="space-y-3">
          {photos.map((entry) => (
            <PhotoCard key={entry.id} entry={entry} dailyLogId={currentLogId} readOnly={readOnly} onDelete={handleDelete} />
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
    </div>
  );
}
