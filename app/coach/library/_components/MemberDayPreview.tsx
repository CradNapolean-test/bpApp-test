'use client';

import { useState } from 'react';
import { Eye } from 'lucide-react';
import { ExerciseEditor } from '@/app/_components/workouts/ExerciseEditor';
import { FocusOverlay } from '@/app/_components/workouts/FocusOverlay';
import { VideoDemo } from '@/app/_components/workouts/VideoDemo';
import { inputCls } from '@/app/_components/ui';
import type { ExerciseLibraryRow, ProgramTemplateWithDays } from '@/lib/data/types';
import { previewDays, previewDayLabel } from '@/lib/memberDayPreview';

// Nothing in the preview is ever saved: the member's workout screen's own pieces, drawn read-only, with every change refused here.
const SAVES_NOTHING = () => Promise.resolve();

// "Preview as member" (LB16): a workout of a programme template the way a member sees it on the web (the member's black header, the
// exercises as the member's workout screen lists them, Strong / Conditioning to pick, the demo videos), without assigning or saving
// anything. There is no set logging, no finishing the workout and no scoring: those write a member's records. Picking Strong or
// Conditioning only changes what this preview shows.
export function MemberDayPreview({
  template,
  initialDayId,
  library,
  onClose,
}: {
  template: ProgramTemplateWithDays;
  initialDayId: string;
  library: ExerciseLibraryRow[];
  onClose: () => void;
}) {
  const days = previewDays(template);
  const [dayId, setDayId] = useState(initialDayId);
  const day = days.find((d) => d.id === dayId) ?? days[0];
  const [choices, setChoices] = useState<Record<string, { slot1: string | null; slot2: string | null }>>({});

  if (!day) return null;
  const choice = choices[day.id] ?? { slot1: null, slot2: null };
  const libraryVideo = (libraryId: string | null) => (libraryId ? library.find((l) => l.id === libraryId)?.video_url : null) ?? null;

  return (
    <FocusOverlay title={day.day_label} subtitle={`Week ${day.week_num} · preview`} onClose={onClose} variant="member">
      <div className="mx-auto w-full max-w-2xl">
        <div className="mb-4 space-y-2 rounded-2xl border border-black/[.08] bg-card p-3 dark:border-white/10">
          <p className="flex items-start gap-2 text-sm text-zinc-600 dark:text-zinc-300">
            <Eye className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            How members see this workout on the web. Nothing here is saved or given to anyone.
          </p>
          {days.length > 1 && (
            <label className="block">
              <span className="sr-only">Workout to preview</span>
              <select className={inputCls} value={day.id} onChange={(e) => setDayId(e.target.value)}>
                {days.map((d) => (
                  <option key={d.id} value={d.id}>
                    {previewDayLabel(d)}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>

        {day.notes && <p className="mb-3 whitespace-pre-wrap text-sm text-zinc-500">{day.notes}</p>}

        {day.program_template_exercises.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-black/[.12] p-5 text-center text-sm text-zinc-500 dark:border-white/15">
            This workout has no exercises yet.
          </p>
        ) : (
          <ExerciseEditor
            key={day.id}
            exercises={day.program_template_exercises}
            library={library}
            canEdit={false}
            onAdd={SAVES_NOTHING}
            onUpdate={SAVES_NOTHING}
            onUpdateMany={SAVES_NOTHING}
            onDelete={SAVES_NOTHING}
            onReorder={SAVES_NOTHING}
            memberChoices={{
              slot1: choice.slot1,
              slot2: choice.slot2,
              onChoose: (slot, key) =>
                setChoices((c) => ({ ...c, [day.id]: { ...choice, ...(slot === 1 ? { slot1: key } : { slot2: key }) } })),
            }}
            renderExtra={(ex) => {
              const videoUrl = ex.video_url || libraryVideo(ex.exercise_library_id);
              return videoUrl?.startsWith('http://') || videoUrl?.startsWith('https://') ? <VideoDemo videoUrl={videoUrl} title={ex.name} /> : null;
            }}
          />
        )}
      </div>
    </FocusOverlay>
  );
}
