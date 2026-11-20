// The boxes on an exercise's own line in the coach's workout builder (live review item 4): the sets, and one box for the target, so a
// coach sets them without opening the exercise's sheet. Which target box shows follows what the exercise records: reps where reps are
// recorded, else the distance (a run, a carry, "Run 400m": the distance is set and the time recorded), the calories (a bike) or the
// time (a plank, a loaded hold). "Tick when done" has the sets box only. The weight, RPE, rest and a distance-and-time's target time
// stay in the sheet, and show on the line under the name.
//
// A box is read the way the sheet reads it, with the sheet's messages, and saves only the one field it shows.
import {
  durationInput,
  formatDuration,
  hasMeasure,
  parseDistance,
  parseDuration,
  parseNumberText,
  trackingOf,
  type PrescribedFields,
  type TrackingType,
} from './workoutTracking';

export type InlineTarget = 'reps' | 'distance' | 'calories' | 'time';
export type InlineBox = 'sets' | InlineTarget;

// What the sheet and the boxes say when a number cannot be saved.
export const PRESCRIPTION_ERRORS = {
  sets: 'Sets need to be a whole number above zero.',
  time: 'Target time can be seconds (45) or minutes and seconds (1:30).',
  distance: 'Target distance can be metres (400) or kilometres (5 km).',
  calories: 'Target calories need to be a number above zero.',
} as const;

export function inlineTarget(type: TrackingType): InlineTarget | null {
  if (hasMeasure(type, 'reps')) return 'reps';
  if (hasMeasure(type, 'distance')) return 'distance';
  if (hasMeasure(type, 'calories')) return 'calories';
  if (hasMeasure(type, 'time')) return 'time';
  return null;
}

// The box's name for a screen reader, and the hint shown while it is empty. Reps ("8-10"), a time ("1:30") and a distance ("5 km") need
// more than digits, so only sets and calories bring up the number pad.
export const INLINE_BOX: Record<InlineBox, { label: string; placeholder: string; inputMode: 'numeric' | 'decimal' | 'text' }> = {
  sets: { label: 'Sets', placeholder: 'sets', inputMode: 'numeric' },
  reps: { label: 'Reps', placeholder: 'reps', inputMode: 'text' },
  distance: { label: 'Distance in metres', placeholder: 'metres', inputMode: 'text' },
  calories: { label: 'Calories', placeholder: 'cal', inputMode: 'decimal' },
  time: { label: 'Time', placeholder: 'time', inputMode: 'text' },
};

export type InlineFields = PrescribedFields;

export interface InlineUpdate {
  sets?: number | null;
  reps?: string | null;
  target_seconds?: number | null;
  target_distance?: number | null;
  target_calories?: number | null;
}

export type InlineChange = { kind: 'none' } | { kind: 'error'; error: string } | { kind: 'save'; fields: InlineUpdate };

// What a box shows for the exercise as saved.
export function inlineText(ex: InlineFields, box: InlineBox): string {
  switch (box) {
    case 'sets':
      return ex.sets == null ? '' : String(ex.sets);
    case 'reps':
      return ex.reps ?? '';
    case 'time':
      return durationInput(ex.target_seconds);
    case 'distance':
      return ex.target_distance == null ? '' : String(ex.target_distance);
    case 'calories':
      return ex.target_calories == null ? '' : String(ex.target_calories);
  }
}

// Sets typed in the sheet or a box: blank clears them, otherwise a whole number above zero.
export function readSetsText(text: string): { ok: true; value: number | null } | { ok: false; error: string } {
  const s = text.trim();
  if (s === '') return { ok: true, value: null };
  const n = Number(s.replace(',', '.'));
  return Number.isInteger(n) && n > 0 ? { ok: true, value: n } : { ok: false, error: PRESCRIPTION_ERRORS.sets };
}

// A target typed in the sheet or a box, as it is saved (null when blank), or the reason it cannot be.
export function readTargetText(box: Exclude<InlineTarget, 'reps'>, text: string): { ok: true; value: number | null } | { ok: false; error: string } {
  if (text.trim() === '') return { ok: true, value: null };
  const value = box === 'time' ? parseDuration(text) : box === 'distance' ? parseDistance(text) : parseNumberText(text);
  return value != null && value > 0 ? { ok: true, value } : { ok: false, error: PRESCRIPTION_ERRORS[box] };
}

// What leaving a box does: nothing when it says what is saved, the one field to save, or why it cannot be saved.
export function readInlineBox(ex: InlineFields, box: InlineBox, text: string): InlineChange {
  if (box === 'reps') {
    const reps = text.trim() || null;
    return reps === ((ex.reps ?? '').trim() || null) ? { kind: 'none' } : { kind: 'save', fields: { reps } };
  }
  const read = box === 'sets' ? readSetsText(text) : readTargetText(box, text);
  if (!read.ok) return { kind: 'error', error: read.error };
  const field = ({ sets: 'sets', time: 'target_seconds', distance: 'target_distance', calories: 'target_calories' } as const)[box];
  return read.value === (ex[field] ?? null) ? { kind: 'none' } : { kind: 'save', fields: { [field]: read.value } as InlineUpdate };
}

// The line under the name: what the boxes do not show (the weight, a distance-and-time's target time, RPE and rest).
export function inlineDetails(ex: InlineFields & { rpe: number | null; rest_seconds: number | null }): string[] {
  const type = trackingOf(ex.tracking_type);
  const parts: string[] = [];
  if (hasMeasure(type, 'time') && inlineTarget(type) !== 'time' && ex.target_seconds != null) parts.push(formatDuration(ex.target_seconds));
  if (hasMeasure(type, 'weight')) {
    if (ex.prescription_type === 'percent_1rm') {
      if (ex.percent_1rm != null) parts.push(`${ex.percent_1rm}% 1RM`);
    } else if (ex.load != null) parts.push(`${ex.load}kg`);
  }
  if (ex.rpe != null) parts.push(`RPE ${ex.rpe}`);
  if (ex.rest_seconds != null) parts.push(`rest ${ex.rest_seconds}s`);
  return parts;
}

// A box's new value is held on screen from when it is typed until the page's own copy of the exercise has it. The line, the sheet and
// Duplicate all read the held value, so a sheet opened before the save is back no longer shows the old value and saves it back (the
// sheet saves every field). A held value is let go when its save fails, or at the first reload after its save is back.
type HeldValue = { value: InlineUpdate[keyof InlineUpdate]; saved: boolean };
export type HeldEdits = Record<string, Partial<Record<keyof InlineUpdate, HeldValue>>>;

// Changes the held values of one exercise's fields that still hold what was saved; the same map back when nothing changes.
function changeHeld(held: HeldEdits, id: string, fields: InlineUpdate, next: (h: HeldValue) => HeldValue | null): HeldEdits {
  const mine = held[id];
  if (!mine) return held;
  const out = { ...mine };
  let changed = false;
  for (const key of Object.keys(fields) as (keyof InlineUpdate)[]) {
    const h = out[key];
    if (!h || h.value !== fields[key]) continue;
    const n = next(h);
    if (n) out[key] = n;
    else delete out[key];
    changed = true;
  }
  if (!changed) return held;
  const rest = { ...held };
  if (Object.keys(out).length > 0) rest[id] = out;
  else delete rest[id];
  return rest;
}

export function holdEdit(held: HeldEdits, id: string, fields: InlineUpdate): HeldEdits {
  const out = { ...held[id] };
  for (const key of Object.keys(fields) as (keyof InlineUpdate)[]) out[key] = { value: fields[key], saved: false };
  return { ...held, [id]: out };
}

// The save is back: the value is let go at the next reload, which carries it. A newer value typed meanwhile stays held.
export function editSaved(held: HeldEdits, id: string, fields: InlineUpdate): HeldEdits {
  return changeHeld(held, id, fields, (h) => ({ ...h, saved: true }));
}

// The save failed: the box goes back to what is saved.
export function editFailed(held: HeldEdits, id: string, fields: InlineUpdate): HeldEdits {
  return changeHeld(held, id, fields, () => null);
}

// The page's copy was reloaded: the values whose saves are back are let go; those still on their way stay held.
export function releaseSaved(held: HeldEdits): HeldEdits {
  let changed = false;
  const out: HeldEdits = {};
  for (const [id, fields] of Object.entries(held)) {
    const kept: Partial<Record<keyof InlineUpdate, HeldValue>> = {};
    for (const [key, h] of Object.entries(fields) as [keyof InlineUpdate, HeldValue][]) {
      if (h.saved) changed = true;
      else kept[key] = h;
    }
    if (Object.keys(kept).length > 0) out[id] = kept;
  }
  return changed ? out : held;
}

// The exercises as the coach sees them: each with its held values over the page's copy.
export function withHeldEdits<E extends { id: string }>(rows: E[], held: HeldEdits): E[] {
  if (Object.keys(held).length === 0) return rows;
  return rows.map((row) => {
    const mine = held[row.id];
    if (!mine) return row;
    const values = Object.fromEntries(Object.entries(mine).map(([key, h]) => [key, h.value]));
    return { ...row, ...values };
  });
}
