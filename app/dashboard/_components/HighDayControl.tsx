'use client';

import { HIGH_DAYS_PER_WEEK } from '@/lib/utils/dayTarget';

// Calorie cycling, under the food diary's target rings: whether the day being looked at is a normal (lower calorie) day or one of
// the member's high days, and for the member a button to change it. A coach sees which it is and cannot change it.
export function HighDayControl({
  isHigh,
  left,
  loaded,
  extraCalories,
  canChange,
  coachView,
  busy,
  onToggle,
}: {
  isHigh: boolean;
  // High days still free this week, not counting this day.
  left: number;
  // The week's high days have arrived (until then the counts are unknown and the button waits).
  loaded: boolean;
  // How many more calories a high day has than a normal one.
  extraCalories: number;
  // The member can change this day (not a coach, and not a day past the edit window).
  canChange: boolean;
  coachView: boolean;
  busy: boolean;
  onToggle: () => void;
}) {
  const extra = Math.round(extraCalories).toLocaleString();
  // `left` does not count this day, so on a high day one of them is this day.
  const moreLeft = Math.max(0, left - 1);

  let detail: string;
  if (coachView) {
    detail = isHigh ? 'The member made this one of their high days.' : `Calorie cycling: the member can make up to ${HIGH_DAYS_PER_WEEK} days a week high days.`;
  } else if (!loaded) {
    detail = 'Calorie cycling';
  } else if (isHigh) {
    detail = moreLeft > 0 ? `You can have ${moreLeft} more high day${moreLeft === 1 ? '' : 's'} this week.` : 'That is all your high days for this week.';
  } else {
    detail = left > 0 ? `${left} of ${HIGH_DAYS_PER_WEEK} high days left this week, +${extra} kcal each.` : `You have used your ${HIGH_DAYS_PER_WEEK} high days this week.`;
  }

  const showButton = !coachView && canChange && (isHigh || left > 0);
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0 text-xs">
        <p className="font-bold text-black dark:text-zinc-50">{isHigh ? 'High day' : 'Normal day'}</p>
        <p className="text-zinc-500">{detail}</p>
      </div>
      {showButton && (
        <button
          type="button"
          onClick={onToggle}
          disabled={busy || !loaded}
          className="shrink-0 rounded-full border border-black/10 px-3 py-1.5 text-xs font-bold text-accent hover:bg-accent/10 disabled:opacity-50 dark:border-white/15"
        >
          {isHigh ? 'Make it a normal day' : 'Make this a high day'}
        </button>
      )}
    </div>
  );
}
