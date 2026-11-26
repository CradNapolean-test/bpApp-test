// Red flags follows the gym chosen in the header (CV14). What it shows is kept with the gym (and week) it was loaded for, so after a
// switch nothing of the old gym's is shown: not a list that was still loading, not the week the coach had moved to, not its coaches.

export type GymWeekPick = { gymId: string | null; week: string };

// The week on screen: the one the coach moved to, while it was picked at this gym; otherwise the gym's newest finished week.
export function redFlagWeekShown(pick: GymWeekPick | null, gymId: string | null, latest: string): string {
  return pick && pick.gymId === gymId ? pick.week : latest;
}

export const redFlagLoadKey = (gymId: string | null, week: string, reload: number) => `${gymId ?? ''}|${week}|${reload}`;

// A loaded answer, only while it is for what is on screen now.
export function shownIfCurrent<T extends { key: string }>(loaded: T | null, key: string): T | null {
  return loaded?.key === key ? loaded : null;
}
