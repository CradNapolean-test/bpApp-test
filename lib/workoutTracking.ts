// What gets recorded for an exercise (migration 0151). Most are weight x reps; others are a hold, a distance, calories, or just "done".
// Time is kept in seconds and distance in metres. Twin of packages/shared/src/workoutTracking.ts: keep the two the same.

export const TRACKING_TYPES = ['weight_reps', 'reps', 'weight_time', 'time', 'distance', 'distance_time', 'calories', 'weight_distance', 'tick'] as const;
export type TrackingType = (typeof TRACKING_TYPES)[number];
export type Measure = 'reps' | 'weight' | 'time' | 'distance' | 'calories';

// `measures` is also the order the boxes appear in when a set is logged.
export const TRACKING: Record<TrackingType, { label: string; hint: string; measures: Measure[] }> = {
  weight_reps: { label: 'Weight and reps', hint: 'Squat, press, row', measures: ['reps', 'weight'] },
  reps: { label: 'Reps only', hint: 'Push-ups, pull-ups, burpees', measures: ['reps'] },
  weight_time: { label: 'Weight and time', hint: 'Loaded hold', measures: ['weight', 'time'] },
  time: { label: 'Time', hint: 'Plank, wall sit, a timed effort', measures: ['time'] },
  distance: { label: 'Distance', hint: 'Broad jump, sled push', measures: ['distance'] },
  distance_time: { label: 'Distance and time', hint: '400 m run, row for time', measures: ['distance', 'time'] },
  calories: { label: 'Calories', hint: 'Bike, ski erg, rower', measures: ['calories'] },
  weight_distance: { label: 'Weight and distance', hint: "Farmer's carry, loaded sled", measures: ['weight', 'distance'] },
  tick: { label: 'Tick when done', hint: 'Mobility, anything with no numbers', measures: [] },
};

export const isTrackingType = (v: unknown): v is TrackingType => typeof v === 'string' && (TRACKING_TYPES as readonly string[]).includes(v);
// Rows from before migration 0151, or from a client that does not send it, are weight x reps.
export const trackingOf = (v: string | null | undefined): TrackingType => (isTrackingType(v) ? v : 'weight_reps');
export const hasMeasure = (type: TrackingType, m: Measure): boolean => TRACKING[type].measures.includes(m);

// ---- reading what the member typed ----
export interface SetInputs {
  reps: string;
  load: string;
  time: string;
  distance: string;
  calories: string;
  rpe: string;
}
export const BLANK_INPUTS: SetInputs = { reps: '', load: '', time: '', distance: '', calories: '', rpe: '' };

export interface SetValues {
  reps: number | null;
  load: number | null;
  seconds: number | null;
  distance: number | null;
  calories: number | null;
  rpe: number | null;
}

// A plain number; a comma works as the decimal point. Null when blank or not a number.
export function parseNumberText(text: string): number | null {
  const s = text.trim().replace(',', '.');
  if (s === '') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

// Seconds from "90", "45s", "1:30", "1:02:03" or "2m30". Null when blank or not a time.
export function parseDuration(text: string): number | null {
  const s = text.trim().toLowerCase().replace(/\s+/g, '').replace(',', '.');
  if (s === '') return null;
  const plain = /^(\d+(?:\.\d+)?)s?$/.exec(s);
  if (plain) return Number(plain[1]);
  const words = /^(\d+)m(?:(\d+(?:\.\d+)?)s?)?$/.exec(s);
  if (words) return Number(words[1]) * 60 + Number(words[2] ?? 0);
  const clock = /^(?:(\d+):)?(\d+):(\d{1,2}(?:\.\d+)?)$/.exec(s);
  if (clock) {
    const [h, m, sec] = [Number(clock[1] ?? 0), Number(clock[2]), Number(clock[3])];
    if (sec >= 60 || (clock[1] != null && m >= 60)) return null;
    return h * 3600 + m * 60 + sec;
  }
  return null;
}

// Metres from "400", "400m", "5km" or "1.5 km". Null when blank or not a distance.
export function parseDistance(text: string): number | null {
  const s = text.trim().toLowerCase().replace(/\s+/g, '').replace(',', '.');
  if (s === '') return null;
  const m = /^(\d+(?:\.\d+)?)(m|km|k)?$/.exec(s);
  if (!m) return null;
  const n = Number(m[1]);
  return m[2] === 'km' || m[2] === 'k' ? Math.round(n * 1000 * 100) / 100 : n;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

// What the boxes say about a set, or why it cannot be saved. Only the measures the type records are read.
export function readSetInputs(type: TrackingType, i: SetInputs): { ok: true; values: SetValues } | { ok: false; error: string } {
  const has = (m: Measure) => hasMeasure(type, m);
  const bad = (blank: string, parsed: number | null) => blank.trim() !== '' && (parsed == null || parsed < 0);
  const reps = has('reps') ? parseNumberText(i.reps) : null;
  const load = has('weight') ? parseNumberText(i.load) : null;
  const seconds = has('time') ? parseDuration(i.time) : null;
  const distance = has('distance') ? parseDistance(i.distance) : null;
  const calories = has('calories') ? parseNumberText(i.calories) : null;
  const rpe = parseNumberText(i.rpe);
  if (has('reps') && bad(i.reps, reps)) return { ok: false, error: 'The reps need to be a number.' };
  if (has('weight') && bad(i.load, load)) return { ok: false, error: 'The weight needs to be a number.' };
  if (has('time') && bad(i.time, seconds)) return { ok: false, error: 'Time can be seconds (90) or minutes and seconds (1:30).' };
  if (has('distance') && bad(i.distance, distance)) return { ok: false, error: 'Distance can be metres (400) or kilometres (5 km).' };
  if (has('calories') && bad(i.calories, calories)) return { ok: false, error: 'The calories need to be a number.' };
  if (bad(i.rpe, rpe)) return { ok: false, error: 'RPE needs to be a number.' };
  return {
    ok: true,
    values: {
      reps: reps == null ? null : Math.round(reps),
      load,
      seconds: seconds == null ? null : round2(seconds),
      distance: distance == null ? null : round2(distance),
      calories: calories == null ? null : round2(calories),
      rpe,
    },
  };
}

// A set that says nothing is not saved (it would count as a set done). A "tick" exercise is the exception: logging it is the point.
export function isBlankSet(type: TrackingType, v: SetValues): boolean {
  if (type === 'tick') return false;
  const slots: Record<Measure, number | null> = { reps: v.reps, weight: v.load, time: v.seconds, distance: v.distance, calories: v.calories };
  return TRACKING[type].measures.every((m) => slots[m] == null) && v.rpe == null;
}

const NAMES: Record<Measure, string> = { reps: 'reps', weight: 'weight', time: 'time', distance: 'distance', calories: 'calories' };
export function blankSetMessage(type: TrackingType): string {
  const names = TRACKING[type].measures.map((m) => NAMES[m]);
  return `Enter the ${names.join(' and ')} (or your RPE) before logging the set.`;
}

// ---- showing numbers ----
export function formatDuration(seconds: number): string {
  const total = Math.round(seconds * 10) / 10;
  if (total < 60) return `${total}s`;
  const whole = Math.floor(total);
  const h = Math.floor(whole / 3600);
  const m = Math.floor((whole % 3600) / 60);
  const s = total - h * 3600 - m * 60;
  const ss = String(Math.round(s * 10) / 10).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

// For a box the member edits: "90" or "1:30", something parseDuration reads back.
export function durationInput(seconds: number | null | undefined): string {
  if (seconds == null) return '';
  return seconds < 60 ? String(Math.round(seconds * 100) / 100) : formatDuration(seconds);
}

export function formatDistance(metres: number): string {
  return metres >= 1000 ? `${Math.round(metres) / 1000} km` : `${Math.round(metres * 10) / 10} m`;
}

const formatCalories = (c: number) => `${Math.round(c * 10) / 10} cal`;

export interface LogValues {
  actual_reps: number | null;
  actual_load: number | null;
  actual_seconds?: number | null;
  actual_distance?: number | null;
  actual_calories?: number | null;
}

// A logged set on one line. Weight x reps keeps the "reps × weight" look the app has always used; the others list what was recorded.
// `compact` drops the spaces round the ×, for the small chips.
export function setSummary(type: TrackingType, s: LogValues, compact = false): string {
  if (type === 'weight_reps') return `${s.actual_reps ?? '—'}${compact ? '×' : ' × '}${s.actual_load ?? '—'}`;
  if (type === 'tick') return '✓';
  const parts: string[] = [];
  for (const m of TRACKING[type].measures) {
    if (m === 'reps') parts.push(s.actual_reps == null ? '—' : compact ? String(s.actual_reps) : `${s.actual_reps} reps`);
    else if (m === 'weight') parts.push(s.actual_load == null ? '—' : `${s.actual_load}kg`);
    else if (m === 'time') parts.push(s.actual_seconds == null ? '—' : formatDuration(s.actual_seconds));
    else if (m === 'distance') parts.push(s.actual_distance == null ? '—' : formatDistance(s.actual_distance));
    else parts.push(s.actual_calories == null ? '—' : formatCalories(s.actual_calories));
  }
  return parts.join(' · ');
}

// Does the set have anything recorded to show as "last time"?
export function hasRecordedValue(type: TrackingType, s: LogValues): boolean {
  if (type === 'tick') return true;
  const slots: Record<Measure, number | null | undefined> = {
    reps: s.actual_reps,
    weight: s.actual_load,
    time: s.actual_seconds,
    distance: s.actual_distance,
    calories: s.actual_calories,
  };
  return TRACKING[type].measures.some((m) => slots[m] != null);
}

// The boxes' starting text, from a set done before (the carry-over from the last set or last session).
export function inputsFromLog(type: TrackingType, s: LogValues | null | undefined): SetInputs {
  if (!s) return { ...BLANK_INPUTS };
  const text = (n: number | null | undefined) => (n == null ? '' : String(n));
  return {
    reps: hasMeasure(type, 'reps') ? text(s.actual_reps) : '',
    load: hasMeasure(type, 'weight') ? text(s.actual_load) : '',
    time: hasMeasure(type, 'time') ? durationInput(s.actual_seconds) : '',
    distance: hasMeasure(type, 'distance') ? text(s.actual_distance) : '',
    calories: hasMeasure(type, 'calories') ? text(s.actual_calories) : '',
    rpe: '',
  };
}

// ---- the coach's prescription ----
export interface PrescribedFields {
  tracking_type?: string | null;
  sets: number | null;
  reps: string | null;
  load: number | null;
  prescription_type: string;
  percent_1rm: number | null;
  target_seconds?: number | null;
  target_distance?: number | null;
  target_calories?: number | null;
}

// "3 × 8-10 · 20kg", "3 × 45s", "4 × 400 m · 20kg": the sets and target, then the weight when the type has one.
export function prescriptionParts(ex: PrescribedFields): string[] {
  const type = trackingOf(ex.tracking_type);
  const target: string[] = [];
  if (hasMeasure(type, 'reps') && ex.reps) target.push(ex.reps);
  if (hasMeasure(type, 'time') && ex.target_seconds != null) target.push(formatDuration(ex.target_seconds));
  if (hasMeasure(type, 'distance') && ex.target_distance != null) target.push(formatDistance(ex.target_distance));
  if (hasMeasure(type, 'calories') && ex.target_calories != null) target.push(formatCalories(ex.target_calories));
  const amount = target.join(' · ');
  const parts: string[] = [];
  if (ex.sets != null && amount) parts.push(`${ex.sets} × ${amount}`);
  else if (ex.sets != null) parts.push(`${ex.sets} sets`);
  else if (amount) parts.push(amount);
  if (hasMeasure(type, 'weight')) {
    if (ex.prescription_type === 'percent_1rm') {
      if (ex.percent_1rm != null) parts.push(`${ex.percent_1rm}% 1RM`);
    } else if (ex.load != null) parts.push(`${ex.load}kg`);
  }
  return parts;
}
