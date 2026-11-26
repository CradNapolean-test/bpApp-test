// The coach's workout day cards on a member's Workouts (CV12).

interface CardExercise {
  name: string;
  section?: string | null;
  sort_order: number;
  block_type: string;
  tracking_type?: string | null;
}

// Weight x reps (or a row from before tracking types, which is weight x reps): a squat, a press, a row. A bike, a ski erg, a hold or a
// mobility drill is not a main lift.
const isLoadedLift = (ex: CardExercise) => (ex.tracking_type ?? 'weight_reps') === 'weight_reps';

// The names the card leads with: the day's main lifts. The Lift section when the day has one, else Strong and Conditioning, and the
// warm-up only when there is nothing else. Within that, loaded lifts come before anything else, so a day built without sections (every
// row is in Lift, warm-up first) still names its squat and press, not "SKI ERG · Bike". Shown in the order they are done.
export function mainLiftNames<T extends CardExercise>(exercises: T[], count = 2): string[] {
  const rows = exercises.filter((ex) => ex.block_type === 'exercise').sort((a, b) => a.sort_order - b.sort_order);
  const sectionOf = (ex: CardExercise) => ex.section ?? 'lift';
  const lift = rows.filter((ex) => sectionOf(ex) === 'lift');
  const blocks = rows.filter((ex) => sectionOf(ex) === 'strong' || sectionOf(ex) === 'conditioning');
  const group = lift.length > 0 ? lift : blocks.length > 0 ? blocks : rows;
  const chosen = [...group.filter(isLoadedLift), ...group.filter((ex) => !isLoadedLift(ex))].slice(0, count);
  return chosen.sort((a, b) => a.sort_order - b.sort_order).map((ex) => ex.name);
}

