// Groups a sorted exercise list into runs sharing the same non-null superset_group, so e.g.
// two exercises marked group "A" render together under one "Superset A" label. Generic so it
// works for both workout_exercises and program_template_exercises rows.
export function groupBySuperset<T extends { superset_group: string | null }>(
  exercises: T[]
): { group: string | null; exercises: T[] }[] {
  const groups: { group: string | null; exercises: T[] }[] = [];
  for (const ex of exercises) {
    const last = groups[groups.length - 1];
    if (last && last.group === ex.superset_group && ex.superset_group != null) {
      last.exercises.push(ex);
    } else {
      groups.push({ group: ex.superset_group, exercises: [ex] });
    }
  }
  return groups;
}

// Next unused superset letter (A, B, C, ...) among the exercises in one day -- used by the
// "link with previous" action to auto-assign a group rather than asking the coach to type one.
export function nextSupersetLetter(exercises: { superset_group: string | null }[]): string {
  const used = new Set(exercises.map((e) => e.superset_group).filter((g): g is string => g != null));
  for (let i = 0; i < 26; i++) {
    const letter = String.fromCharCode(65 + i);
    if (!used.has(letter)) return letter;
  }
  return `G${used.size + 1}`;
}
