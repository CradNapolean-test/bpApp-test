// Retention by join month (RO10), from owner_retention_report (migration 0176): of the members who joined in a month, how many started a
// plan, are on one now, and were on one 1, 3 and 6 months after joining. A share is only given once some of the month's members have been
// members that long ("eligible"), so a month that just started never reads 0%. Pure, so the maths can be tested.

export interface RetentionCohort {
  // The first day of the month, 'YYYY-MM-01'.
  month: string;
  joined: number;
  startedPlan: number;
  onPlanNow: number;
  eligible1: number;
  kept1: number;
  eligible3: number;
  kept3: number;
  eligible6: number;
  kept6: number;
}

export interface RetentionReportRaw {
  today: string;
  months: number;
  cohorts: RetentionCohort[];
}

// The share kept, or null when nobody has been a member that long yet.
export function keptPct(kept: number, eligible: number): number | null {
  return eligible > 0 ? Math.round((100 * Math.min(kept, eligible)) / eligible) : null;
}

export interface RetentionRow extends RetentionCohort {
  label: string;
  nowPct: number | null;
  pct1: number | null;
  pct3: number | null;
  pct6: number | null;
}

export const monthLabel = (month: string) =>
  new Date(`${month.slice(0, 7)}-01T00:00:00Z`).toLocaleDateString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' });

// Newest month first, as the table reads.
export function retentionRows(cohorts: RetentionCohort[]): RetentionRow[] {
  return [...cohorts]
    .sort((a, b) => b.month.localeCompare(a.month))
    .map((c) => ({
      ...c,
      label: monthLabel(c.month),
      nowPct: keptPct(c.onPlanNow, c.joined),
      pct1: keptPct(c.kept1, c.eligible1),
      pct3: keptPct(c.kept3, c.eligible3),
      pct6: keptPct(c.kept6, c.eligible6),
    }));
}

// Every month together: each share is out of the members old enough for it, not out of everyone who joined.
export function retentionTotals(cohorts: RetentionCohort[]) {
  const sum = (pick: (c: RetentionCohort) => number) => cohorts.reduce((n, c) => n + pick(c), 0);
  const joined = sum((c) => c.joined);
  return {
    joined,
    startedPlan: sum((c) => c.startedPlan),
    onPlanNow: sum((c) => c.onPlanNow),
    nowPct: keptPct(sum((c) => c.onPlanNow), joined),
    pct1: keptPct(sum((c) => c.kept1), sum((c) => c.eligible1)),
    pct3: keptPct(sum((c) => c.kept3), sum((c) => c.eligible3)),
    pct6: keptPct(sum((c) => c.kept6), sum((c) => c.eligible6)),
  };
}

const cell = (kept: number, eligible: number) => (eligible > 0 ? `${keptPct(kept, eligible)}% (${Math.min(kept, eligible)} of ${eligible})` : '');

export function retentionCsv(cohorts: RetentionCohort[]): { headers: string[]; rows: (string | number)[][] } {
  return {
    headers: ['Month joined', 'Joined', 'Started a plan', 'On a plan now', 'On a plan after 1 month', 'On a plan after 3 months', 'On a plan after 6 months'],
    rows: retentionRows(cohorts).map((r) => [r.month.slice(0, 7), r.joined, r.startedPlan, r.onPlanNow, cell(r.kept1, r.eligible1), cell(r.kept3, r.eligible3), cell(r.kept6, r.eligible6)]),
  };
}
