// Where a member's weight stands between their start weight and goal weight, for the coach's Overview and Progress cards.
// "0% to goal" used to hide a member who had moved the other way (start 78.5kg, now 87.5kg, goal 70kg read as just "0%").

// Half a kilo is everyday scale noise; anything past that in the wrong direction is worth a look.
export const AWAY_FROM_GOAL_KG = 0.5;

export interface WeightGoalProgress {
  // 0-100: how much of the start-to-goal distance is done.
  pct: number;
  // Kilos still between now and the goal (0 once the goal is reached).
  toGoKg: number;
  // Kilos further from the goal than the start weight was; 0 unless they have moved the wrong way.
  awayKg: number;
  // True when awayKg is past the scale-noise allowance.
  movingAway: boolean;
}

export function weightGoalProgress(start: number, goal: number, now: number): WeightGoalProgress | null {
  if (start === goal) return null;
  const direction = start > goal ? 1 : -1; // 1 = losing towards the goal, -1 = gaining towards it
  const total = Math.abs(start - goal);
  const moved = (start - now) * direction; // positive = towards the goal
  const pct = Math.round((Math.max(0, Math.min(total, moved)) / total) * 100);
  const toGoKg = Math.max(0, (now - goal) * direction);
  const awayKg = Math.max(0, -moved);
  return { pct, toGoKg, awayKg, movingAway: awayKg > AWAY_FROM_GOAL_KG };
}
