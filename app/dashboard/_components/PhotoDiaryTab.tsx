'use client';

import { useMemo, useState } from 'react';
import { Camera } from 'lucide-react';
import { Button } from '@/app/_components/Button';
import { ProgressRing } from '@/app/_components/ProgressRing';
import { useAction } from '@/app/_components/useAction';
import { useConfirm } from '@/app/_components/ConfirmDialog';
import { EmptyState } from '@/app/_components/EmptyState';
import { deleteFoodPhoto, updateFoodPhotoMacros, uploadFoodPhoto } from '@/lib/data/foodPhotos';
import { weeklyTarget } from '@/lib/calculations';
import { toEngineProfile } from '@/lib/utils/clientProfile';
import type { ClientProfileRow, FoodPhotoEntry } from '@/lib/data/types';

function MacroEditor({ entry, dailyLogId }: { entry: FoodPhotoEntry; dailyLogId: string }) {
  const { run, busy } = useAction();
  const [calories, setCalories] = useState(entry.estimated_calories?.toString() ?? '');
  const [protein, setProtein] = useState(entry.estimated_protein?.toString() ?? '');
  const [carbs, setCarbs] = useState(entry.estimated_carbs?.toString() ?? '');
  const [fat, setFat] = useState(entry.estimated_fat?.toString() ?? '');

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    await run(
      () =>
        updateFoodPhotoMacros(entry.id, dailyLogId, {
          calories: calories === '' ? null : Number(calories),
          protein: protein === '' ? null : Number(protein),
          carbs: carbs === '' ? null : Number(carbs),
          fat: fat === '' ? null : Number(fat),
        }),
      { success: 'Macros saved' }
    );
  }

  const inputCls = 'w-full rounded-md border border-black/10 bg-transparent px-2 py-1 text-xs dark:border-white/10';

  return (
    <form onSubmit={handleSave} className="mt-1.5 grid grid-cols-2 gap-1.5">
      <input type="number" placeholder="kcal" value={calories} onChange={(e) => setCalories(e.target.value)} className={inputCls} />
      <input type="number" placeholder="protein g" value={protein} onChange={(e) => setProtein(e.target.value)} className={inputCls} />
      <input type="number" placeholder="carbs g" value={carbs} onChange={(e) => setCarbs(e.target.value)} className={inputCls} />
      <input type="number" placeholder="fat g" value={fat} onChange={(e) => setFat(e.target.value)} className={inputCls} />
      <Button type="submit" variant="ghost" size="sm" disabled={busy} className="col-span-2">
        Save macros
      </Button>
    </form>
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
  const [description, setDescription] = useState('');

  const dayTarget = useMemo(() => {
    const engineProfile = profile ? toEngineProfile(profile) : null;
    return engineProfile ? weeklyTarget(engineProfile, programWeek)?.dailyFlat ?? null : null;
  }, [profile, programWeek]);

  async function handleUpload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!dailyLogId) return;
    const form = e.currentTarget;
    const formData = new FormData(form);
    formData.set('clientId', clientId);
    formData.set('dailyLogId', dailyLogId);
    formData.set('description', description);
    await runUpload(() => uploadFoodPhoto(formData), {
      success: 'Photo added',
      onDone: () => {
        form.reset();
        setDescription('');
      },
    });
  }

  async function handleDelete(id: string) {
    if (!dailyLogId) return;
    const ok = await confirm({ title: 'Delete this photo?', destructive: true });
    if (!ok) return;
    await runDelete(() => deleteFoodPhoto(id, dailyLogId), { success: 'Photo deleted' });
  }

  const totalCalories = initialPhotos.reduce((sum, p) => sum + (p.estimated_calories ?? 0), 0);
  const totalProtein = initialPhotos.reduce((sum, p) => sum + (p.estimated_protein ?? 0), 0);

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-black/10 p-4 dark:border-white/10">
        <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Today&apos;s photo diary</h3>
        <div className="mt-2 flex items-center gap-3">
          {dayTarget && (
            <>
              <ProgressRing value={totalCalories} target={dayTarget.calories} label="kcal" />
              <ProgressRing value={totalProtein} target={dayTarget.protein} label="protein" />
            </>
          )}
          <p className="text-xs text-zinc-500">{Math.round(totalCalories)} kcal estimated today</p>
        </div>

        {!readOnly && (
          <form onSubmit={handleUpload} className="mt-3 space-y-2">
            <input type="file" name="file" accept="image/*" required className="text-sm" />
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What is this? e.g. Chicken salad, small portion"
              rows={2}
              className="w-full rounded-md border border-black/10 bg-transparent px-2.5 py-1.5 text-sm dark:border-white/10"
            />
            <Button type="submit" variant="primary" disabled={uploading}>
              {uploading ? 'Uploading…' : 'Add photo'}
            </Button>
          </form>
        )}
      </div>

      {initialPhotos.length === 0 ? (
        <EmptyState
          icon={Camera}
          title="No photos logged today"
          hint={readOnly ? 'Nothing uploaded yet.' : 'Photograph a meal above to log it.'}
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {initialPhotos.map((entry) => (
            <div key={entry.id} className="space-y-1.5 rounded-lg border border-black/10 p-3 dark:border-white/10">
              {entry.signedUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={entry.signedUrl} alt={entry.description ?? 'Food photo'} className="aspect-square w-full rounded-md object-cover" />
              ) : (
                <div className="aspect-square w-full rounded-md bg-black/5 dark:bg-white/5" />
              )}
              {entry.description && <p className="text-sm text-zinc-700 dark:text-zinc-300">{entry.description}</p>}
              {entry.estimated_calories != null ? (
                <p className="text-xs text-zinc-500">
                  ~{Math.round(entry.estimated_calories)} kcal · {Math.round(entry.estimated_protein ?? 0)}P /{' '}
                  {Math.round(entry.estimated_carbs ?? 0)}C / {Math.round(entry.estimated_fat ?? 0)}F
                </p>
              ) : (
                <p className="text-xs text-zinc-500">No estimate — enter macros manually.</p>
              )}
              {!readOnly && dailyLogId && (
                <>
                  <MacroEditor entry={entry} dailyLogId={dailyLogId} />
                  <Button variant="danger" size="sm" onClick={() => handleDelete(entry.id)}>
                    Delete
                  </Button>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
