// Class names on the coach's Timetable (CS10). Each distinct name is a class type: its own colour, its own legend line and its own lines
// in the reports. So a slip ("Strenght", "strength ", "Strength  Club") must not quietly make a new one. The coach picks from the gym's
// existing names, or says on purpose that a name is new; a typed name that matches an existing one, ignoring case and extra spaces, is
// that one.

// The name as it is saved: no spaces at either end, and one space between words.
export const tidyClassName = (name: string) => name.trim().replace(/\s+/g, ' ');

// What two names are compared by.
export const classNameKey = (name: string) => tidyClassName(name).toLowerCase();

// The gym's class names for the picker: one per key, spelt the way most of its sessions spell it (the first in A to Z order on a tie),
// sorted A to Z. Blank names are left out.
export function classNameChoices(names: string[]): string[] {
  const byKey = new Map<string, Map<string, number>>();
  for (const raw of names) {
    const key = classNameKey(raw);
    if (!key) continue;
    const spellings = byKey.get(key) ?? new Map<string, number>();
    const tidy = tidyClassName(raw);
    spellings.set(tidy, (spellings.get(tidy) ?? 0) + 1);
    byKey.set(key, spellings);
  }
  const out: string[] = [];
  for (const spellings of byKey.values()) {
    const [best] = [...spellings.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    out.push(best[0]);
  }
  return out.sort((a, b) => a.localeCompare(b));
}

// The existing class a typed name is, ignoring case and extra spaces; null when it is a new name.
export function matchClassName(typed: string, choices: string[]): string | null {
  const key = classNameKey(typed);
  if (!key) return null;
  return choices.find((c) => classNameKey(c) === key) ?? null;
}

// How many single-letter changes (add, remove, change, or swap two letters side by side) turn one string into the other.
function editDistance(a: string, b: string): number {
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array<number>(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
}

// An existing class a new name looks like a slip of ("Strenght" for Strength, "HIT" for HIIT): one letter out for a short name, two for
// a name of six letters or more. null when nothing is that close, or the name already is an existing class.
export function nearClassName(typed: string, choices: string[]): string | null {
  const key = classNameKey(typed);
  if (!key || matchClassName(typed, choices)) return null;
  let best: { name: string; distance: number } | null = null;
  for (const c of choices) {
    const other = classNameKey(c);
    const allowed = Math.min(key.length, other.length) >= 6 ? 2 : 1;
    const distance = editDistance(key, other);
    if (distance <= allowed && (!best || distance < best.distance)) best = { name: c, distance };
  }
  return best?.name ?? null;
}

// The question before a new class name is saved, or null when there is nothing to ask (it is an existing class, or the gym has no
// classes yet, so there is nothing to split from).
export function newClassNameQuestion(typed: string, choices: string[]): { title: string; body: string; confirmLabel: string } | null {
  const name = tidyClassName(typed);
  if (!name || choices.length === 0 || matchClassName(name, choices)) return null;
  const near = nearClassName(name, choices);
  const effect = 'A new class gets its own colour on the timetable and its own lines in the reports.';
  return {
    title: `Add “${name}” as a new class?`,
    body: near
      ? `It looks like ${near}, which you already have. ${effect} To use ${near}, go back and pick it from the list.`
      : `${effect} Your classes now: ${choices.join(', ')}.`,
    confirmLabel: 'Add new class',
  };
}
