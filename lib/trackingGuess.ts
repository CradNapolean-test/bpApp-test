// What an exercise most likely records, read from its name: a bike or ski erg is calories, a run is distance, a carry or prowler is
// weight and distance, a plank or hold is time, burpees and press-ups are reps. Used when a coach types a new exercise (in the library,
// or a custom one in a workout) so it does not start as weight x reps; the coach can always change it. Migration 0156 applied these
// rules once, as they were then, to the exercises that already existed (supabase/migrations/0156_tracking_and_scoring_backfill.sql).
// A run or machine that names its distance ("Run 400m", "Rower 500m") is distance and time, as the option's hint says (LB7, TR27): the
// distance is set, the time is what is recorded. It read "Rower 500m" as calories.
//
// Null means "no confident guess": the exercise keeps weight x reps. Combinations ("Squat Hold + Run", "DB Squat & Press") and anything
// called weighted are left alone on purpose.
import type { TrackingType } from './workoutTracking';

// Lower case, punctuation and dashes to spaces, single spaces: "TURKISH SIT-UP" -> "turkish sit up".
export function normaliseExerciseName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9+&,]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const any = (words: string[]) => new RegExp(`(?:^| )(?:${words.join('|')})(?: |$)`);

const COMBINATION = /[+&,]/;
const WEIGHTED = any(['weighted']);
const CABLE = any(['cable', 'cables']);
const BAND = any(['band', 'banded', 'bands']);
// Free weights that make a bodyweight move a loaded one (a medicine ball does not: slams and wall balls stay reps).
const FREE_WEIGHT = any(['db', 'dbs', 'kb', 'kbs', 'bb', 'barbell', 'dumbbell', 'dumbbells', 'kettlebell', 'kettlebells', 'plate']);
// A hold or isometric with one of these is held with a weight in hand.
const HOLD_LOAD = any(['db', 'kb', 'bb', 'mb', 'plate', 'barbell', 'dumbbell', 'dumbbells', 'kettlebell', 'kettlebells', 'suitcase', 'raise', 'bicep']);

const CALORIES = any(['bike', 'bikes', 'airbike', 'erg', 'ergs', 'skierg', 'rower', 'rowers', 'kcal', 'kcals', 'cal', 'cals', 'calorie', 'calories']);
const WEIGHT_DISTANCE = any(['carry', 'carries', 'farmer', 'farmers', 'prowler', 'sled', 'sleds', 'yoke']);
const DISTANCE = any(['run', 'runs', 'running', 'jog', 'jogging', 'sprint', 'sprints', 'shuttle', 'shuttles', 'crawl', 'crawls']);
// A set distance in the name: "400m", "500 m", "2km", "1 mile" (not "16kg").
const NAMED_DISTANCE = /(?:^| )\d+ ?(?:m|km|metre|metres|meter|meters|mile|miles)(?: |$)/;
// Reps whatever is in the hand (a ball, a pair of dumbbells for a burpee thruster).
const REPS_ANY_LOAD = any([
  'slam',
  'slams',
  'burpee',
  'burpees',
  'wall ball',
  'wall balls',
  'climber',
  'climbers',
  'high knees',
  'box jump',
  'box jumps',
  'squat jump',
  'squat jumps',
  'tuck jump',
  'tuck jumps',
  'star jump',
  'star jumps',
  'jumping jack',
  'jumping jacks',
  'tap',
  'taps',
  'touches',
  'walkout',
  'walkouts',
]);
// Reps when done with the body's own weight.
const REPS_BODYWEIGHT = any([
  'press up',
  'press ups',
  'push up',
  'push ups',
  'pushup',
  'pushups',
  'pull up',
  'pull ups',
  'pullup',
  'pullups',
  'chin up',
  'chin ups',
  'chinup',
  'chinups',
  'sit up',
  'sit ups',
  'dip',
  'dips',
  'crunch',
  'crunches',
  'leg raise',
  'leg raises',
  'deadbug',
  'deadbugs',
  'bird dog',
  'bird dogs',
  'roll out',
  'roll outs',
  'rollout',
  'rollouts',
  'bw',
  'body weight',
  'bodyweight',
]);
const HOLD = any(['hold', 'holds', 'iso', 'isometric']);
const PLANK = any(['plank', 'planks']);
// A plank that moves is not a timed hold.
const PLANK_MOVES = any(['reach', 'pull', 'relay', 'clock', 'row', 'rows', 'walk', 'jack', 'jacks']);
const TIMED = any(['wall sit', 'dead hang', 'battle rope', 'battle ropes', 'skipping']);

export function guessTrackingType(name: string): TrackingType | null {
  const n = normaliseExerciseName(name);
  if (!n || COMBINATION.test(n) || WEIGHTED.test(n)) return null;
  const setDistance = NAMED_DISTANCE.test(n);
  if (CALORIES.test(n)) return setDistance ? 'distance_time' : 'calories';
  if (WEIGHT_DISTANCE.test(n)) return 'weight_distance';
  if (DISTANCE.test(n)) return setDistance ? 'distance_time' : 'distance';
  if (REPS_ANY_LOAD.test(n)) return 'reps';
  if (REPS_BODYWEIGHT.test(n) && !CABLE.test(n) && !FREE_WEIGHT.test(n)) return 'reps';
  if (HOLD.test(n)) return HOLD_LOAD.test(n) && !BAND.test(n) ? 'weight_time' : 'time';
  if (PLANK.test(n) && !PLANK_MOVES.test(n)) return 'time';
  if (TIMED.test(n)) return 'time';
  return null;
}
