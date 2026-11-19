// "Reviewed by Brad ✓" on the member's own week and forms (D7, MX10, MS18, CW14). The member reads their reviews through the narrow
// my_checkin_reviews() function (migration 0170): which week (its Monday) or form (the assignment id) their coach marked reviewed, when, and
// the coach's first name. Nothing else of the coach's to-do list. The phone has the same rules in packages/shared/src/utils/checkinReviews.ts.

export type CheckinReviewRow = {
  kind: string;
  ref: string;
  reviewed_at: string;
  reviewer_first_name: string | null;
};

export type ReviewMark = { by: string | null; at: string };

// The reviews of one kind, by what they are about (a week's Monday, or a form assignment's id). If the same thing was somehow marked twice,
// the latest mark wins.
export function reviewsByRef(rows: readonly CheckinReviewRow[] | null | undefined, kind: 'week' | 'form'): Map<string, ReviewMark> {
  const out = new Map<string, ReviewMark>();
  for (const r of rows ?? []) {
    if (r.kind !== kind || !r.ref) continue;
    const prev = out.get(r.ref);
    if (prev && prev.at >= r.reviewed_at) continue;
    out.set(r.ref, { by: firstName(r.reviewer_first_name), at: r.reviewed_at });
  }
  return out;
}

function firstName(name: string | null | undefined): string | null {
  return name?.trim().split(/\s+/)[0] || null;
}

// What the member sees. A coach with no name set is "your coach".
export function reviewedByLine(mark: Pick<ReviewMark, 'by'>): string {
  return `Reviewed by ${firstName(mark.by) ?? 'your coach'} ✓`;
}
