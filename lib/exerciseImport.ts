// Preparing an exercise library CSV import (EX): rows already in the library (same name and equipment) are skipped so importing twice never
// doubles the library, a file is capped at 500 rows, and a row with a video or image link that is not an https:// address is left out (the
// database refuses such links too, migration 0128, and one bad row would otherwise fail the whole import).
export const MAX_IMPORT_ROWS = 500;

export interface ImportRow {
  name: string;
  equipment: string | null;
  video_url: string | null;
  image_url: string | null;
}

export interface ImportPlan<T extends ImportRow> {
  // Rows to insert.
  rows: T[];
  skippedDuplicates: number;
  skippedBadLinks: number;
  // Set when the file has more rows than allowed: nothing is imported.
  tooMany: boolean;
}

const key = (name: string, equipment: string | null) => `${name.trim().toLowerCase()}|${(equipment ?? '').trim().toLowerCase()}`;
const isHttps = (link: string | null) => link == null || link.trim() === '' || /^https:\/\//i.test(link.trim());

export function prepareExerciseImport<T extends ImportRow>(parsed: T[], existing: { name: string; equipment: string | null }[]): ImportPlan<T> {
  if (parsed.length > MAX_IMPORT_ROWS) return { rows: [], skippedDuplicates: 0, skippedBadLinks: 0, tooMany: true };
  const seen = new Set(existing.map((e) => key(e.name, e.equipment)));
  const rows: T[] = [];
  let skippedDuplicates = 0;
  let skippedBadLinks = 0;
  for (const row of parsed) {
    if (!isHttps(row.video_url) || !isHttps(row.image_url)) {
      skippedBadLinks += 1;
      continue;
    }
    const k = key(row.name, row.equipment);
    if (seen.has(k)) {
      skippedDuplicates += 1;
      continue;
    }
    seen.add(k);
    rows.push(row);
  }
  return { rows, skippedDuplicates, skippedBadLinks, tooMany: false };
}

// One line for the coach about what happened.
export function describeImport(plan: ImportPlan<ImportRow>): string {
  if (plan.tooMany) return `That file has more than ${MAX_IMPORT_ROWS} rows. Split it and import it in parts.`;
  const parts = [`Imported ${plan.rows.length} exercise${plan.rows.length === 1 ? '' : 's'}`];
  if (plan.skippedDuplicates > 0) parts.push(`${plan.skippedDuplicates} already in the library`);
  if (plan.skippedBadLinks > 0) parts.push(`${plan.skippedBadLinks} left out because their link doesn't start with https://`);
  return parts.length === 1 ? parts[0] : `${parts[0]}. Skipped: ${parts.slice(1).join(', ')}.`;
}
