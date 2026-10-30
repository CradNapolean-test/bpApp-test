'use client';

import { TRACKING, type Measure, type SetInputs, type TrackingType } from '@/lib/workoutTracking';

const boxCls = 'h-11 w-full min-w-0 rounded-xl border border-black/10 bg-card px-2 text-center text-base font-semibold dark:border-white/10';
const COLUMNS = { 1: 'grid-cols-1', 2: 'grid-cols-2', 3: 'grid-cols-3' } as const;

// The boxes for one set: whatever the exercise records (reps, weight, time, distance, calories) and then RPE. Used by the form that logs a
// set and by the sheet that corrects one. `showLoad` is false for a no-weight exercise that has not had a weight added.
export function SetInputsGrid({
  tracking,
  inputs,
  onChange,
  showLoad = true,
}: {
  tracking: TrackingType;
  inputs: SetInputs;
  onChange: (next: SetInputs) => void;
  showLoad?: boolean;
}) {
  const boxes: { key: keyof SetInputs; label: string; mode: 'numeric' | 'decimal' | 'text'; placeholder?: string }[] = [];
  for (const m of TRACKING[tracking].measures as Measure[]) {
    if (m === 'reps') boxes.push({ key: 'reps', label: 'Reps', mode: 'numeric' });
    else if (m === 'weight') {
      if (showLoad) boxes.push({ key: 'load', label: 'Load (kg)', mode: 'decimal' });
    } else if (m === 'time') boxes.push({ key: 'time', label: 'Time', mode: 'text', placeholder: 'm:ss' });
    else if (m === 'distance') boxes.push({ key: 'distance', label: 'Distance (m)', mode: 'text', placeholder: 'm or km' });
    else boxes.push({ key: 'calories', label: 'Calories', mode: 'decimal' });
  }
  boxes.push({ key: 'rpe', label: 'RPE', mode: 'decimal' });

  return (
    <div className={`grid gap-2 ${COLUMNS[Math.min(3, boxes.length) as 1 | 2 | 3]}`}>
      {boxes.map((b) => (
        <label key={b.key} className="block">
          <span className="mb-1 block text-center text-[11px] font-medium text-zinc-500">{b.label}</span>
          <input
            type="text"
            inputMode={b.mode}
            placeholder={b.placeholder}
            className={boxCls}
            value={inputs[b.key]}
            onChange={(e) => onChange({ ...inputs, [b.key]: e.target.value })}
          />
        </label>
      ))}
    </div>
  );
}
