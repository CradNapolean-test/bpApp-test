// Which week of the programme a member is on (L1). The calorie targets move through phases by week, so this must be a real count of weeks.
// It was worked out from the first log inside the 84 days the page happens to load, so it read "week 13" for everyone, forever.
// Counted from the programme's start date: the member's join date when the coach has set one, else their first log ever.

export function programWeekAt(todayIso: string, startIso: string | null | undefined): number {
  if (!startIso) return 1;
  const days = Math.floor((Date.parse(`${todayIso}T00:00:00Z`) - Date.parse(`${startIso}T00:00:00Z`)) / 86_400_000);
  if (!Number.isFinite(days) || days < 0) return 1;
  return Math.floor(days / 7) + 1;
}
