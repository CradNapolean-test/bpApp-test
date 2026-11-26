import type { WeekVolume } from './trainingStats';

// The Load volume card's headline (TR12): the newest week that has any volume, not always this week, so Strength never opens on
// "0kg this week, 0 sets" over an empty chart. Null when none of the weeks shown has any volume: the card is left out.
export interface VolumeHeadline {
  week: WeekVolume;
  isThisWeek: boolean;
  // The week before it, when that one had volume too.
  previous: WeekVolume | null;
}

// `weeks` oldest first, this week last (as weeklyVolume returns them).
export function volumeHeadline(weeks: WeekVolume[]): VolumeHeadline | null {
  for (let i = weeks.length - 1; i >= 0; i--) {
    if (weeks[i].volume > 0) {
      const before = i > 0 ? weeks[i - 1] : null;
      return { week: weeks[i], isThisWeek: i === weeks.length - 1, previous: before && before.volume > 0 ? before : null };
    }
  }
  return null;
}
