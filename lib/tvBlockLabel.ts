import type { BlockConfig } from '@/lib/blockScoring';
import { formatDuration } from '@/lib/workoutTracking';

// The line above a block on the class TV ("EMOM 12'", "TABATA · 8 ROUNDS · 20s ON / 10s OFF"). It used to read 20' for the first block and
// 10' for the rest whatever the coach set (CS17); now it shows the block's own time cap, rounds and work/rest from the workout builder.

const TIMED = ['AMRAP', 'EMOM', 'Partner AMRAP'];

// Minutes as the gym's printed cards write them (10'); anything that isn't whole minutes as 1:30.
const tvTime = (seconds: number) => (seconds % 60 === 0 ? `${seconds / 60}'` : formatDuration(seconds));

// `slotMinutes` is the length of the slot the block fills in the class (20 for a whole-session block, 10 otherwise). It is shown only for a
// timed format whose coach hasn't set a time, which is every block built before time caps existed, so those keep the line they had.
export function tvBlockLabel(format: string | null, config: BlockConfig, slotMinutes: number): string {
  const time = config.cap_seconds != null ? tvTime(config.cap_seconds) : format && TIMED.includes(format) ? `${slotMinutes}'` : null;
  const head = [format?.toUpperCase(), time].filter(Boolean).join(' ');
  const extras: string[] = [];
  if (config.rounds != null) extras.push(`${config.rounds} ROUND${config.rounds === 1 ? '' : 'S'}`);
  if (config.work_seconds != null && config.rest_seconds != null) extras.push(`${config.work_seconds}s ON / ${config.rest_seconds}s OFF`);
  else if (config.work_seconds != null) extras.push(`${config.work_seconds}s ON`);
  else if (config.rest_seconds != null) extras.push(`${config.rest_seconds}s REST`);
  return [head, ...extras].filter(Boolean).join(' · ');
}
