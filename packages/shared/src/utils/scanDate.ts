// The date on a body scan (BS1). It could be set to any day, including one in the future, which put scans after "today" in the history and
// made the newest-scan rule (the body fat that feeds the calorie targets) pick a scan that has not happened.

// null when the date is fine; otherwise what to tell the person. `todayIso` is today at the member's own timezone.
export function scanDateProblem(scanDate: string, todayIso: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(scanDate) || Number.isNaN(Date.parse(`${scanDate}T00:00:00Z`))) return 'Please pick the scan date';
  if (scanDate > todayIso) return 'A scan cannot be dated in the future.';
  return null;
}
