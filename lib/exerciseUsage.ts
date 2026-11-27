// Where a library exercise is used (LB11): in how many programme templates, and in how many members' own programmes. Counted by the
// database (exercise_library_usage, migration 0179) over what this coach can read; the counts are distinct, so a 12-week programme that
// repeats an exercise every week still counts once. Until 0179 is applied only templates are counted and `programmes` is null (unknown).

export type ExerciseUsage = { templates: number; programmes: number | null };

export const NO_USAGE: ExerciseUsage = { templates: 0, programmes: 0 };

// Where every exercise is used: `membersCounted` is false until 0179 is applied (or when the count could not be read), and then an
// exercise missing from `byId` is in no template but its members' programmes are unknown, never "none".
export type ExerciseUsageMap = { byId: Record<string, ExerciseUsage>; membersCounted: boolean };

export const EMPTY_USAGE_MAP: ExerciseUsageMap = { byId: {}, membersCounted: false };

export function usageFor(map: ExerciseUsageMap, exerciseId: string): ExerciseUsage {
  return map.byId[exerciseId] ?? (map.membersCounted ? NO_USAGE : { templates: 0, programmes: null });
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

// "2 templates, 5 members' programmes", or "2 templates" / "5 members' programmes" when the other is none. '' when it is in nothing.
export function usageSummary(u: ExerciseUsage): string {
  const parts: string[] = [];
  if (u.templates > 0) parts.push(plural(u.templates, 'template', 'templates'));
  if ((u.programmes ?? 0) > 0) parts.push(plural(u.programmes as number, "member's programme", "members' programmes"));
  return parts.join(', ');
}

export function isInUse(u: ExerciseUsage): boolean {
  return u.templates > 0 || (u.programmes ?? 0) > 0;
}

// The line at the top of an exercise's sheet.
export function usageLine(u: ExerciseUsage): string {
  if (isInUse(u)) return `In ${usageSummary(u)}.`;
  if (u.programmes === null) return 'Not in any programme template.';
  // Counted over what this coach can read: another gym's member's programme can still use it.
  return "Not in any template or member's programme you can see.";
}

// What Delete says before it does anything: retire instead when it is used (the database refuses to delete it), else confirm.
export function deleteWording(u: ExerciseUsage): { inUse: boolean; body: string } {
  if (isInUse(u)) {
    return {
      inUse: true,
      body: `In use in ${usageSummary(u)}, so it can’t be deleted. Retire it instead: it stays where it is used but is not offered for new programmes.`,
    };
  }
  return {
    inUse: false,
    body:
      u.programmes === null
        ? "No programme template uses it. If a member's workout still does, it can't be deleted and you can retire it instead."
        : "No template or member's programme you can see uses it. If anything else does (another gym's programme, a logged set or a tested max), it can't be deleted and you can retire it instead.",
  };
}

// The database's rows (one per exercise in use) -> usage by exercise id. Rows it can't read sensibly are skipped.
export function usageFromRows(rows: { exercise_library_id: string | null; templates: number | null; member_programmes: number | null }[]): Record<string, ExerciseUsage> {
  const out: Record<string, ExerciseUsage> = {};
  for (const r of rows) {
    if (!r.exercise_library_id) continue;
    out[r.exercise_library_id] = { templates: Number(r.templates ?? 0), programmes: Number(r.member_programmes ?? 0) };
  }
  return out;
}
